const { GObject, Gio } = imports.gi;

const exec_cmd = (args, callback) => {
  try {
    const proc = Gio.Subprocess.new(
      args,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    if(callback) {
      proc.communicate_utf8_async(null, null, (proc, res) => {
        try {
          let [, stdout, stderr] = proc.communicate_utf8_finish(res);
          if (proc.get_successful()) {
            const response = JSON.parse(stdout);
            callback(response);
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
    GTypeName: 'Tailscale',
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
      this.refresh_status();
      this.refresh_prefs();
    }

    _process_status(status) {
      const running = status.BackendState == "Running";
      if(running != this._running) {
        this._running = running;
        this.notify("running");
      }
    }

    _process_nodes(status) {
      const nodes = Object.values(status.Peer)
        .map(peer => ({
          name: peer.HostName,
          phone: peer.OS == "android" || peer.OS == "ios",
          exit_node: peer.ExitNode,
          exit_node_option: peer.ExitNodeOption,
        }));
      if(nodes != this._nodes) {
        this._nodes = nodes;
        this.notify("nodes");
      }
    }

    _process_dns(prefs) {
      const accept_dns = prefs.CorpDNS;
      if(accept_dns != this._dns) {
        this._dns = accept_dns;
        this.notify("accept-dns");
      }
    }

    _process_routes(prefs) {
      const accept_routes = prefs.RouteAll;
      if(accept_routes != this._routes) {
        this._routes = accept_routes;
        this.notify("accept-routes");
      }
    }

    get accept_dns() {
      return this._dns;
    }

    set accept_dns(value) {
      if (this.accept_dns === value)
        return;

      exec_cmd(['tailscale', 'set', `--accept-dns=${value}`]);

      this._dns=value;
      this.notify("accept-dns");
    }

    get accept_routes() {
      return this._routes;
    }

    set accept_routes(value) {
      if (this.accept_routes === value)
        return;

      exec_cmd(['tailscale', 'set', `--accept-routes=${value}`]);

      this._routes=value;
      this.notify("accept-routes");
    }

    get running() {
        return this._running;
    }

    set running(value) {
      if (this.running === value)
        return;

      exec_cmd(['tailscale', value ? 'up':'down']);

      this._running=value;
      this.notify("running");
    }

    get nodes() {
        return this._nodes;
    }

    refresh_status () {
      exec_cmd(['tailscale', "status", "--json"], (status) => {
        this._process_status(status);
        this._process_nodes(status);
      });
    }

    refresh_prefs () {
      exec_cmd(['tailscale', "debug", "prefs"], (prefs) => {
        this._process_dns(prefs);
        this._process_routes(prefs);
      });
    }
  }
);

