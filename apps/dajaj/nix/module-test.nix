# Boots the module in a VM and fetches the game through it. Linux only: run on twelve.
{
  testers,
  writeShellScriptBin,
  lib,
  module,
  package,
}:
let
  # stands in for a release the updater built: marks the journal, then runs the real server
  release = writeShellScriptBin "dajaj" ''
    echo "started from the updater's build" >&2
    exec ${lib.getExe package}
  '';
in
testers.runNixOSTest {
  name = "dajaj-module";
  nodes.machine = {
    imports = [ module ];
    services.dajaj = {
      enable = true;
      inherit package;
      players = [
        "AntennaTower"
        "Rectifier94"
      ];
      environmentFile = "/etc/dajaj.env";
      autoUpdate = {
        enable = true;
        url = "https://git.example.com/owner/dajaj";
      };
    };
    system.extraDependencies = [ release ];
    environment.etc."dajaj.env".text = "PUBG_API_KEY=not-a-real-key";
  };
  testScript = ''
    machine.wait_for_unit("dajaj.service")
    machine.wait_for_open_port(7310)
    assert machine.succeed("curl -sf http://127.0.0.1:7310/healthz") == "ok"
    machine.succeed("curl -sf http://127.0.0.1:7310/ | grep -q '<title>dajaj</title>'")
    assert machine.succeed("curl -sf http://127.0.0.1:7310/api/players") == '{"players":["AntennaTower","Rectifier94"]}'
    # the VM has no internet: PUBG's absence is a 502 with a message, not a crash
    machine.succeed("curl -s -o /tmp/report -w '%{http_code}' 'http://127.0.0.1:7310/api/report?players=AntennaTower' | grep -qx 502")
    machine.succeed("grep -q 'PUBG could not be reached' /tmp/report")
    machine.succeed("test -s /var/lib/private/dajaj/cache.sqlite")
    asset = machine.succeed("curl -sf http://127.0.0.1:7310/ | grep -o '/assets/index-[^\"]*\\.js'").strip()
    machine.succeed(f"curl -sfI http://127.0.0.1:7310{asset} | grep -qi 'cache-control: public, max-age=31536000, immutable'")
    machine.fail("curl -sf http://127.0.0.1:7310/nope")
    machine.succeed("systemctl show -p DynamicUser --value dajaj | grep -qx yes")

    with subtest("an updater that can't reach the repository fails without touching the running server"):
        machine.succeed("systemctl list-timers dajaj-update.timer | grep -q dajaj-update")
        machine.fail("systemctl start dajaj-update.service")
        machine.fail("test -e /var/lib/dajaj-updater/current")
        assert machine.succeed("curl -sf http://127.0.0.1:7310/healthz") == "ok"

    with subtest("the server starts from the updater's build when there is one"):
        machine.fail("journalctl -u dajaj | grep -q \"started from the updater's build\"")
        machine.succeed("ln -sfn ${release} /var/lib/dajaj-updater/current")
        machine.succeed("systemctl restart dajaj.service")
        machine.wait_for_open_port(7310)
        machine.succeed("journalctl -u dajaj | grep -q \"started from the updater's build\"")
        assert machine.succeed("curl -sf http://127.0.0.1:7310/healthz") == "ok"
  '';
}
