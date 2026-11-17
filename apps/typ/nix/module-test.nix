# Boots the module in a VM and fetches the page through it. Linux only: run on twelve.
{
  testers,
  writeShellScriptBin,
  lib,
  module,
  package,
}:
let
  # stands in for a release the updater built: marks the journal, then runs the real server
  release = writeShellScriptBin "typ" ''
    echo "started from the updater's build" >&2
    exec ${lib.getExe package}
  '';
in
testers.runNixOSTest {
  name = "typ-module";
  nodes.machine = {
    imports = [ module ];
    services.typ = {
      enable = true;
      inherit package;
      autoUpdate = {
        enable = true;
        url = "https://git.example.com/owner/typ";
      };
    };
    system.extraDependencies = [ release ];
  };
  testScript = ''
    machine.wait_for_unit("typ.service")
    machine.wait_for_open_port(7200)
    assert machine.succeed("curl -sf http://127.0.0.1:7200/healthz") == "ok"
    machine.succeed("curl -sf http://127.0.0.1:7200/ | grep -q '<title>typ</title>'")
    asset = machine.succeed("curl -sf http://127.0.0.1:7200/ | grep -o '/assets/index-[^\"]*\\.js'").strip()
    machine.succeed(f"curl -sfI http://127.0.0.1:7200{asset} | grep -qi 'cache-control: public, max-age=31536000, immutable'")
    machine.fail("curl -sf http://127.0.0.1:7200/nope")
    machine.succeed("systemctl show -p DynamicUser --value typ | grep -qx yes")

    with subtest("an updater that can't reach the repository fails without touching the running server"):
        machine.succeed("systemctl list-timers typ-update.timer | grep -q typ-update")
        machine.fail("systemctl start typ-update.service")
        machine.fail("test -e /var/lib/typ-updater/current")
        assert machine.succeed("curl -sf http://127.0.0.1:7200/healthz") == "ok"

    with subtest("the server starts from the updater's build when there is one"):
        machine.fail("journalctl -u typ | grep -q \"started from the updater's build\"")
        machine.succeed("ln -sfn ${release} /var/lib/typ-updater/current")
        machine.succeed("systemctl restart typ.service")
        machine.wait_for_open_port(7200)
        machine.succeed("journalctl -u typ | grep -q \"started from the updater's build\"")
        assert machine.succeed("curl -sf http://127.0.0.1:7200/healthz") == "ok"
  '';
}
