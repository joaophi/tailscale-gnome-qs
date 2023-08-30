const { GObject, Gio } = imports.gi;

const exec_cmd = (args, callback) => {
  try {
    const proc = Gio.Subprocess.new(
      args,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    if (callback) {
      proc.communicate_utf8_async(null, null, (proc, res) => {
        try {
          let [, stdout, stderr] = proc.communicate_utf8_finish(res);
          if (proc.get_successful()) {
            callback(stdout);
          } else {
            throw new Error(stderr);
          }
        } catch (e) {
          logError(e);
        }
      });
    }
  } catch (e) {
    logError(e);
  }
}

var Tailscale = GObject.registerClass(
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
      this._running = false;
      this._dns = false;
      this._routes = false;
      this._allow_lan_access = false;
      this._shields_up = false;
      this._ssh = false;
      this._exit_node = "";
      this._nodes = [];
      this.refresh_status();
      this.refresh_prefs();
    }

    _process_status(status) {
      const running = status.BackendState == "Running";
      if (running != this._running) {
        this._running = running;
        this.notify("running");
      }
    }

    _process_nodes(prefs, status) {
      const nodes = Object.values(status.Peer ?? {})
        .map(peer => ({
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

    _process_exit_node(prefs, status) {
      const exit_node = Object.values(status.Peer ?? {})
        .find(peer => peer.ID == prefs.ExitNodeID);

      if (exit_node?.HostName != this._exit_node) {
        this._exit_node = exit_node?.HostName ?? "";
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

      exec_cmd(["tailscale", value ? "up" : "down"]);

      this._running = value;
      this.notify("running");
    }

    get accept_dns() {
      return this._dns;
    }

    set accept_dns(value) {
      if (this.accept_dns === value)
        return;

      exec_cmd(["tailscale", "set", `--accept-dns=${value}`]);

      this._dns = value;
      this.notify("accept-dns");
    }

    get accept_routes() {
      return this._routes;
    }

    set accept_routes(value) {
      if (this.accept_routes === value)
        return;

      exec_cmd(["tailscale", "set", `--accept-routes=${value}`]);

      this._routes = value;
      this.notify("accept-routes");
    }

    get allow_lan_access() {
      return this._allow_lan_access;
    }

    set allow_lan_access(value) {
      if (this.allow_lan_access === value)
        return;

      exec_cmd(["tailscale", "set", `--exit-node-allow-lan-access=${value}`]);

      this._allow_lan_access = value;
      this.notify("allow_lan_access");
    }

    get shields_up() {
      return this._shields_up;
    }

    set shields_up(value) {
      if (this.shields_up === value)
        return;

      exec_cmd(["tailscale", "set", `--shields-up=${value}`]);

      this._shields_up = value;
      this.notify("shields-up");
    }

    get ssh() {
      return this._ssh;
    }

    set ssh(value) {
      if (this.ssh === value)
        return;

      exec_cmd(["tailscale", "set", `--ssh=${value}`]);

      this._ssh = value;
      this.notify("ssh");
    }

    get exit_node() {
      return this._exit_node;
    }

    set exit_node(value) {
      if (this.exit_node === value)
        return;

      exec_cmd(["tailscale", "set", `--exit-node=${value}`], () => this.refresh_prefs());

      this._exit_node = value;
      this.notify("exit-node");
    }

    get nodes() {
      return this._nodes;
    }

    refresh_status() {
      exec_cmd(["tailscale", "status", "--json"], (response) => {
        const status = JSON.parse(response);
        this.last_status = status;
        this._process_status(status);
        if (this.last_prefs) {
          this._process_nodes(this.last_prefs, status);
          this._process_exit_node(this.last_prefs, status);
        }
      });
    }

    refresh_prefs() {
      exec_cmd(["tailscale", "debug", "prefs"], (response) => {
        const prefs = JSON.parse(response);
        this.last_prefs = prefs;
        this._process_dns(prefs);
        this._process_routes(prefs);
        this._process_lan(prefs);
        this._process_shields(prefs);
        this._process_ssh(prefs);
        if (this.last_status) {
          this._process_nodes(prefs, this.last_status);
          this._process_exit_node(prefs, this.last_status);
        }
      });
    }
  }
);

