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
const { GObject, Gio, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const QuickSettings = imports.ui.quickSettings;

// This is the live instance of the Quick Settings menu
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const { Tailscale } = Me.imports.tailscale

const TailscaleIndicator = GObject.registerClass(
  class TailscaleIndicator extends QuickSettings.SystemIndicator {
    _init(icon, tailscale) {
      super._init();

      // Create the icon for the indicator
      const up = this._addIndicator();
      up.gicon = icon;
      up.visible = false;

      tailscale.bind_property('running', up, 'visible', GObject.BindingFlags.DEFAULT);
    }
  }
);

const TailscaleMenuToggle = GObject.registerClass(
  class TailscaleMenuToggle extends QuickSettings.QuickMenuToggle {
    _init(icon, tailscale) {
      super._init({
        title: 'Tailscale',
        gicon: icon,
        toggleMode: true,
        menuEnabled: true,
      });
      tailscale.bind_property('running', this, 'checked', GObject.BindingFlags.BIDIRECTIONAL);

      // This function is unique to this class. It adds a nice header with an
      // icon, title and optional subtitle. It's recommended you do so for
      // consistency with other menus.
      this.menu.setHeader(icon, this.title);

      const prefs = new PopupMenu.PopupMenuSection();

      const routes = new PopupMenu.PopupSwitchMenuItem('Accept Routes', false, {});
      tailscale.connect('notify::accept-routes', (obj) => routes.setToggleState(obj.accept_routes));
      routes.connect("toggled", (item) => tailscale.accept_routes = item.state);
      prefs.addMenuItem(routes);

      const dns = new PopupMenu.PopupSwitchMenuItem('Accept DNS', false, {});
      tailscale.connect('notify::accept-dns', (obj) => dns.setToggleState(obj.accept_dns));
      dns.connect("toggled", (item) => tailscale.accept_dns = item.state);
      prefs.addMenuItem(dns);

      this.menu.addMenuItem(prefs);

      // Add an entry-point for more settings
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // You may also add sections of items to the menu
      const nodes = new PopupMenu.PopupMenuSection();
      tailscale.connect('notify::nodes', (obj) => {
        nodes.removeAll();
        for (const node of obj.nodes) {
          nodes.addAction(node.name, () => log('activated'), node.phone ? "phone-symbolic" : "computer-symbolic");
        }
      });
      this.menu.addMenuItem(nodes);
    }
  }
);

class Extension {
  constructor(uuid) {
    this._uuid = uuid;
  }

  enable() {
    const tailscale = new Tailscale();
    this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
      tailscale.refresh_status();
      tailscale.refresh_prefs();
      return GLib.SOURCE_CONTINUE;
    });

    const icon = Gio.icon_new_for_string(`${Me.path}/icons/tailscale.svg`);

    this._indicator = new TailscaleIndicator(icon, tailscale);
    QuickSettingsMenu._indicators.insert_child_at_index(this._indicator, 0);

    this._menu = new TailscaleMenuToggle(icon, tailscale);
    QuickSettingsMenu._addItems([this._menu]);
    QuickSettingsMenu.menu._grid.set_child_below_sibling(
      this._menu,
      QuickSettingsMenu._backgroundApps.quickSettingsItems[0]
    );
  }

  disable() {
    GLib.Source.remove(this._timerId);
    this._timerId = null;

    this._menu.destroy();
    this._menu = null;

    this._indicator.destroy();
    this._indicator = null;
  }
}

function init(meta) {
  return new Extension(meta.uuid);
}

