import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Soup from "gi://Soup?version=3.0";

import { setTimeout } from "./timeout.js";

class TailscaleApiClient {
  constructor() {
    const address = new Gio.UnixSocketAddress({
      path: "/var/run/tailscale/tailscaled.sock",
    });
    this.session = new Soup.Session({
      "remote-connectable": address,
      "timeout": 0,
      "idle-timeout": 0,
    });
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async* stream(method, path, cancellable) {
    const message = Soup.Message.new(method, `http://local-tailscaled.sock${path}`);

    const base_stream = this.session.send(message, null);
    const stream = new Gio.DataInputStream({ base_stream });
    try {
      const content_type = message.response_headers.get_one("Content-Type");
      while (true) {
        Gio._promisify(Gio.DataInputStream.prototype, "read_line_async");
        const [_response, length] = await stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable);
        if (length == 0) {
          break;
        }
        const response = this.decoder.decode(_response);
        yield content_type == "application/json" ? JSON.parse(response) : response;
      }
    } finally {
      stream.close(null);
    }
  }

  async request(method, path, body = null) {
    const message = Soup.Message.new(method, `http://local-tailscaled.sock${path}`);
    if (body) {
      const bytes = this.encoder.encode(JSON.stringify(body));
      message.set_request_body_from_bytes("application/json", new GLib.Bytes(bytes));
    }

    Gio._promisify(Soup.Session.prototype, "send_and_read_async");
    const response_bytes = await this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
    const response = this.decoder.decode(response_bytes.get_data());
    const content_type = message.response_headers.get_one("Content-Type");
    return content_type == "application/json" ? JSON.parse(response) : response
  }
}

export const Tailscale = GObject.registerClass(
  {
    Properties: {
      "running": GObject.ParamSpec.boolean(
        "running", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "accept-dns": GObject.ParamSpec.boolean(
        "accept-dns", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "accept-routes": GObject.ParamSpec.boolean(
        "accept-routes", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "allow-lan-access": GObject.ParamSpec.boolean(
        "allow-lan-access", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "shields-up": GObject.ParamSpec.boolean(
        "shields-up", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "ssh": GObject.ParamSpec.boolean(
        "ssh", "", "",
        GObject.ParamFlags.READWRITE,
        false
      ),
      "exit-node": GObject.ParamSpec.string(
        "exit-node", "", "",
        GObject.ParamFlags.READWRITE,
        ""
      ),
      "nodes": GObject.ParamSpec.jsobject(
        "nodes", "", "",
        GObject.ParamFlags.READABLE,
        []
      ),
    },
  },
  class Tailscale extends GObject.Object {
    _init() {
      super._init();
      this._client = new TailscaleApiClient();
      this._running = false;
      this._dns = false;
      this._routes = false;
      this._allow_lan_access = false;
      this._shields_up = false;
      this._ssh = false;
      this._exit_node = "";
      this._nodes = [];
      this._cancelable = new Gio.Cancellable();
      this._listen();
    }

    destroy() {
      this._cancelable.cancel();
    }

    _process_running(prefs) {
      const running = prefs.WantRunning;
      if (running != this._running) {
        this._running = running;
        this.notify("running");
      }
    }

    _process_nodes(prefs, peers) {
      const nodes = peers
        .map(peer => ({
          id: peer.ID,
          name: peer.DNSName.split(".")[0],
          os: peer.OS,
          exit_node: peer.ID == prefs.ExitNodeID,
          exit_node_option: peer.ExitNodeOption,
          online: peer.Online,
          ips: peer.TailscaleIPs,
        }))
        .sort((a, b) =>
          (b.online - a.online)
          || (b.exit_node_option - a.exit_node_option)
          || a.name.localeCompare(b.name)
        );

      if (JSON.stringify(nodes) != JSON.stringify(this._nodes)) {
        this._nodes = nodes;
        this.notify("nodes");
      }
    }

    _process_exit_node(prefs) {
      const exit_node_id = prefs.ExitNodeID;
      if (exit_node_id != this._exit_node) {
        this._exit_node = exit_node_id;
        this.notify("exit-node");
      }
    }

    _process_dns(prefs) {
      const accept_dns = prefs.CorpDNS;
      if (accept_dns != this._dns) {
        this._dns = accept_dns;
        this.notify("accept-dns");
      }
    }

    _process_routes(prefs) {
      const accept_routes = prefs.RouteAll;
      if (accept_routes != this._routes) {
        this._routes = accept_routes;
        this.notify("accept-routes");
      }
    }

    _process_lan(prefs) {
      const allow_lan_access = prefs.ExitNodeAllowLANAccess;
      if (allow_lan_access != this._allow_lan_access) {
        this._allow_lan_access = allow_lan_access;
        this.notify("allow-lan-access");
      }
    }

    _process_shields(prefs) {
      const shields_up = prefs.ShieldsUp;
      if (shields_up != this._shields_up) {
        this._shields_up = shields_up;
        this.notify("shields-up");
      }
    }

    _process_ssh(prefs) {
      const ssh = prefs.RunSSH;
      if (ssh != this._ssh) {
        this._ssh = ssh;
        this.notify("ssh");
      }
    }

    get running() {
      return this._running;
    }

    set running(value) {
      if (this.running === value)
        return;

      this._update_prefs({ WantRunning: value });
    }

    get accept_dns() {
      return this._dns;
    }

    set accept_dns(value) {
      if (this.accept_dns === value)
        return;

      this._update_prefs({ CorpDNS: value });
    }

    get accept_routes() {
      return this._routes;
    }

    set accept_routes(value) {
      if (this.accept_routes === value)
        return;

      this._update_prefs({ RouteAll: value });
    }

    get allow_lan_access() {
      return this._allow_lan_access;
    }

    set allow_lan_access(value) {
      if (this.allow_lan_access === value)
        return;

      this._update_prefs({ ExitNodeAllowLANAccess: value });
    }

    get shields_up() {
      return this._shields_up;
    }

    set shields_up(value) {
      if (this.shields_up === value)
        return;

      this._update_prefs({ ShieldsUp: value });
    }

    get ssh() {
      return this._ssh;
    }

    set ssh(value) {
      if (this.ssh === value)
        return;

      this._update_prefs({ RunSSH: value });
    }

    get exit_node() {
      return this._exit_node;
    }

    set exit_node(value) {
      if (this.exit_node === value)
        return;

      this._update_prefs({ ExitNodeID: value });
    }

    get nodes() {
      return this._nodes;
    }

    async _listen() {
      const delay = (delay) => new Promise(resolve => setTimeout(resolve, delay));

      while (true) {
        try {
          const status = await this._client.request("GET", "/localapi/v0/status")
          this._peers = Object.values(status.Peer);
          this._prefs = await this._client.request("GET", "/localapi/v0/prefs")
          this._parse_response();

          for await (const update of this._client.stream("GET", "/localapi/v0/watch-ipn-bus", this._cancelable)) {
            let should_update = false;
            if (update.Prefs) {
              this._prefs = update.Prefs;
              should_update = true;
            }
            if (update.NetMap) {
              this._peers = update.NetMap.Peers.map(peer => ({
                ID: peer.StableID,
                DNSName: peer.Name,
                OS: peer.Hostinfo.OS,
                ExitNodeOption: peer.AllowedIPs?.includes("0.0.0.0/0"),
                Online: peer.Online,
                TailscaleIPs: peer.Addresses.map(address => address.split("/")[0]),
              }));
              should_update = true;
            }
            if (should_update) {
              this._parse_response();
            }
          }
        } catch (error) {
          if (this._cancelable.is_cancelled()) {
            break;
          }
          console.error(error);
          this._process_running({ WantRunning: false });
        }
        await delay(5000);
      }
    }

    _parse_response() {
      if (this._prefs) {
        this._process_running(this._prefs);
        this._process_dns(this._prefs);
        this._process_routes(this._prefs);
        this._process_lan(this._prefs);
        this._process_shields(this._prefs);
        this._process_ssh(this._prefs);
        this._process_exit_node(this._prefs);
        if (this._peers) {
          this._process_nodes(this._prefs, this._peers);
        }
      }
    }

    _update_prefs(prefs) {
      const body = {
        ...prefs,
        ...Object.fromEntries(
          Object.entries(prefs)
            .map(([key, _]) => [`${key}set`, true]),
        ),
      }
      this._client.request("PATCH", "/localapi/v0/prefs", body)
        .then(
          (prefs) => {
            this._prefs = prefs;
            this._parse_response();
          },
          (error) => console.error(error),
        );
    }
  }
);
