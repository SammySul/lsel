{
  config,
  lib,
  ...
}:
let
  cfg = config.services.yank-wars;
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
        ExecStart = lib.getExe cfg.package;
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
  };
}
