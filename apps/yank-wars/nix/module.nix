{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.yank-wars;
  updaterDir = "/var/lib/yank-wars-updater";

  # The updater's build when there is one, else the package this config pins.
  start = pkgs.writeShellScript "yank-wars-start" ''
    if [ -x ${updaterDir}/current/bin/yank-wars ]; then
      exec ${updaterDir}/current/bin/yank-wars
    fi
    exec ${lib.getExe cfg.package}
  '';

  update = pkgs.writeShellApplication {
    name = "yank-wars-update";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.curl
      pkgs.git
      pkgs.gnused
      config.nix.package
      config.systemd.package
    ];
    text = ''
      repo=${lib.escapeShellArg cfg.autoUpdate.repo}
      dir=${updaterDir}
      latest=$(git ls-remote --tags --refs --sort=-v:refname "https://github.com/$repo" 'v*' | sed -n '1s|.*refs/tags/||p')
      if [ -z "$latest" ]; then
        echo "no release tags yet"
        exit 0
      fi
      if [ "$latest" = "$(cat "$dir/tag" 2>/dev/null || true)" ]; then
        exit 0
      fi
      echo "building $latest"
      previous=$(readlink "$dir/current" || true)
      # the out-link moves only after a successful build, and is the build's GC root
      nix --extra-experimental-features "nix-command flakes" build "github:$repo/$latest" --out-link "$dir/current"
      echo "$latest" >"$dir/tag"
      systemctl restart yank-wars.service
      for _ in $(seq 30); do
        if curl -fsS "http://${cfg.host}:${toString cfg.port}/healthz" >/dev/null 2>&1; then
          echo "running $latest"
          exit 0
        fi
        sleep 1
      done
      echo "$latest failed its health check; back to the previous build" >&2
      if [ -n "$previous" ]; then ln -sfn "$previous" "$dir/current"; else rm -f "$dir/current"; fi
      systemctl restart yank-wars.service
      exit 1
    '';
  };
in
{
  options.services.yank-wars = {
    enable = lib.mkEnableOption "the yank-wars server";
    package = lib.mkOption {
      type = lib.types.package;
      description = "The yank-wars package (server binary and web app).";
    };
    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address to bind; loopback, since the tunnel is the only way in.";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 7300;
      description = "Port to bind.";
    };
    autoUpdate = {
      enable = lib.mkEnableOption "running the newest vX.Y.Z release tag of `repo`; only yank-wars restarts, a failed build or health check keeps the running version";
      repo = lib.mkOption {
        type = lib.types.str;
        example = "owner/yank-wars";
        description = "The GitHub repository whose release tags to follow.";
      };
      interval = lib.mkOption {
        type = lib.types.str;
        default = "5min";
        description = "How often to look for a new tag (systemd time span).";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.yank-wars = {
      description = "yank-wars";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      environment = {
        YW_HOST = cfg.host;
        YW_PORT = toString cfg.port;
      };
      serviceConfig = {
        ExecStart = if cfg.autoUpdate.enable then start else lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = "2s";
        DynamicUser = true;
        StateDirectory = "yank-wars";
        WorkingDirectory = "/var/lib/yank-wars";
        CapabilityBoundingSet = "";
        LockPersonality = true;
        NoNewPrivileges = true;
        PrivateDevices = true;
        PrivateTmp = true;
        PrivateUsers = true;
        ProcSubset = "pid";
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHome = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        ProtectProc = "invisible";
        ProtectSystem = "strict";
        RestrictAddressFamilies = [
          "AF_INET"
          "AF_INET6"
          "AF_UNIX"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        UMask = "0077";
        # not MemoryDenyWriteExecute: Bun's JIT needs writable executable memory
      };
    };

    systemd.services.yank-wars-update = lib.mkIf cfg.autoUpdate.enable {
      description = "Run the newest yank-wars release";
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      serviceConfig = {
        Type = "oneshot";
        ExecStart = lib.getExe update;
        StateDirectory = "yank-wars-updater";
        StateDirectoryMode = "0755";
      };
    };

    systemd.timers.yank-wars-update = lib.mkIf cfg.autoUpdate.enable {
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnBootSec = "1min";
        OnUnitActiveSec = cfg.autoUpdate.interval;
      };
    };
  };
}
