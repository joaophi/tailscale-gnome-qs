/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import St from "gi://St";

import { Extension, gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

// This is the live instance of the Quick Settings menu
const QuickSettingsMenu = Main.panel.statusArea.quickSettings;

import { Tailscale } from "./tailscale.js";
import { clearInterval, clearSources, setInterval } from "./timeout.js";

const TailscaleIndicator = GObject.registerClass(
  class TailscaleIndicator extends QuickSettings.SystemIndicator {
    _init(icon, tailscale) {
      super._init();

      // Create the icon for the indicator
      const up = this._addIndicator();
      up.gicon = icon;
      tailscale.bind_property("running", up, "visible", GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.DEFAULT);

      // Create the icon for the indicator
      const exit = this._addIndicator();
      exit.icon_name = "network-vpn-symbolic";
      const setVisible = () => { exit.visible = tailscale.running && tailscale.exit_node != ""; }
      tailscale.connect("notify::exit-node", () => setVisible());
      tailscale.connect("notify::running", () => setVisible());
      setVisible();
    }
  }
);

const TailscaleDeviceItem = GObject.registerClass(
  class TailscaleDeviceItem extends PopupMenu.PopupBaseMenuItem {
    _init(icon_name, text, subtitle, onClick, onLongClick) {
      super._init({
        activate: onClick,
      });

      const icon = new St.Icon({
        style_class: 'popup-menu-icon',
      });
      this.add_child(icon);
      icon.icon_name = icon_name;

      const label = new St.Label({
        x_expand: true,
      });
      this.add_child(label);
      label.text = text;

      const sub = new St.Label({
        style_class: 'device-subtitle',
      });
      this.add_child(sub);
      sub.text = subtitle;

      this.connect('activate', () => onClick());

      const clickAction = this._clickAction ?? (() => {
        const action = new Clutter.ClickAction();
        this.add_action(action);
        action.connect('notify::pressed', () => {
          if (action.pressed)
            this.add_style_pseudo_class('active');
          else
            this.remove_style_pseudo_class('active');
        });
        action.connect('clicked', () => this.activate(Clutter.get_current_event()));
        return action
      })();
      clickAction.connect('long-press', (_action, _actor, state) => {
        if (state === Clutter.LongPressState.ACTIVATE) {
          return onLongClick();
        }
        return true;
      });
      clickAction.enabled = true;
    }

    activate(event) {
      if (this._activatable)
        this.emit('activate', event);
    }

    vfunc_button_press_event() { }

    vfunc_button_release_event() { }

    vfunc_touch_event(touchEvent) { }
  }
);

const TailscaleMenuToggle = GObject.registerClass(
  class TailscaleMenuToggle extends QuickSettings.QuickMenuToggle {
    _init(icon, tailscale) {
      super._init({
        label: "Tailscale",
        gicon: icon,
        toggleMode: true,
        menuEnabled: true,
      });
      this.title = "Tailscale";
      tailscale.bind_property("running", this, "checked", GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL);

      // This function is unique to this class. It adds a nice header with an
      // icon, title and optional subtitle. It's recommended you do so for
      // consistency with other menus.
      this.menu.setHeader(icon, this.title);

      // NODES
      const nodes = new PopupMenu.PopupMenuSection();
      const update_nodes = (obj) => {
        nodes.removeAll();
        for (const node of obj.nodes) {
          const device_icon = !node.online ? "network-offline-symbolic" : ((node.os == "android" || node.os == "iOS") ? "phone-symbolic" : "computer-symbolic");
          const subtitle = node.exit_node ? _("disable exit node") : (node.exit_node_option ? _("use as exit node") : "");
          const onClick = node.exit_node_option ? () => { tailscale.exit_node = node.exit_node ? "" : node.id; } : null;
          const onLongClick = () => {
            if (!node.ips)
              return false;

            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, node.ips[0]);
            St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, node.ips[0]);
            Main.osdWindowManager.show(-1, icon, _("IP address has been copied to the clipboard"));
            return true;
          };

          nodes.addMenuItem(new TailscaleDeviceItem(device_icon, node.name, subtitle, onClick, onLongClick));
        }
      }
      tailscale.connect("notify::nodes", (obj) => update_nodes(obj));
      update_nodes(tailscale);
      this.menu.addMenuItem(nodes);

      // SEPARATOR
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // PREFS
      const prefs = new PopupMenu.PopupSubMenuMenuItem(_("Settings"), false, {});

      const routes = new PopupMenu.PopupSwitchMenuItem(_("Accept routes"), tailscale.accept_routes, {});
      tailscale.connect("notify::accept-routes", (obj) => routes.setToggleState(obj.accept_routes));
      routes.connect("toggled", (item) => tailscale.accept_routes = item.state);
      prefs.menu.addMenuItem(routes);

      const dns = new PopupMenu.PopupSwitchMenuItem(_("Accept DNS"), tailscale.accept_dns, {});
      tailscale.connect("notify::accept-dns", (obj) => dns.setToggleState(obj.accept_dns));
      dns.connect("toggled", (item) => tailscale.accept_dns = item.state);
      prefs.menu.addMenuItem(dns);

      const lan = new PopupMenu.PopupSwitchMenuItem(_("Allow LAN access"), tailscale.allow_lan_access, {});
      tailscale.connect("notify::allow-lan-access", (obj) => lan.setToggleState(obj.allow_lan_access));
      lan.connect("toggled", (item) => tailscale.allow_lan_access = item.state);
      prefs.menu.addMenuItem(lan);

      const shields = new PopupMenu.PopupSwitchMenuItem(_("Shields up"), tailscale.shields_up, {});
      tailscale.connect("notify::shields-up", (obj) => shields.setToggleState(obj.shields_up));
      shields.connect("toggled", (item) => tailscale.shields_up = item.state);
      prefs.menu.addMenuItem(shields);

      const ssh = new PopupMenu.PopupSwitchMenuItem(_("SSH"), tailscale.ssh, {});
      tailscale.connect("notify::ssh", (obj) => ssh.setToggleState(obj.ssh));
      ssh.connect("toggled", (item) => tailscale.ssh = item.state);
      prefs.menu.addMenuItem(ssh);

      this.menu.addMenuItem(prefs);
    }
  }
);

export default class TailscaleExtension extends Extension {
  enable() {
    const icon = Gio.icon_new_for_string(`${this.path}/icons/tailscale.svg`);

    this._tailscale = new Tailscale();
    this._indicator = new TailscaleIndicator(icon, this._tailscale);
    this._menu = new TailscaleMenuToggle(icon, this._tailscale);
    if (QuickSettingsMenu.addExternalIndicator) {
      this._indicator.quickSettingsItems.push(this._menu);
      QuickSettingsMenu.addExternalIndicator(this._indicator);
    } else {
      const timerHandle = setInterval(() => {
        if (!QuickSettingsMenu._indicators.get_first_child())
          return;

        QuickSettingsMenu._indicators.insert_child_at_index(this._indicator, 0);
        QuickSettingsMenu._addItems([this._menu]);
        QuickSettingsMenu.menu._grid.set_child_below_sibling(
          this._menu,
          QuickSettingsMenu._backgroundApps.quickSettingsItems[0]
        );

        clearInterval(timerHandle);
      }, 100);
    }
  }

  disable() {
    clearSources();

    this._menu.destroy();
    this._menu = null;

    this._indicator.destroy();
    this._indicator = null;

    this._tailscale.destroy();
    this._tailscale = null;
  }
}

function init(meta) {
  ExtensionUtils.initTranslations(Me.metadata.uuid);
  return new TailscaleExtension(meta.uuid, Me.path);
}
