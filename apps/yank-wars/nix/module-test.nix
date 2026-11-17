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
  release = writeShellScriptBin "yank-wars" ''
    echo "started from the updater's build" >&2
    exec ${lib.getExe package}
  '';
in
testers.runNixOSTest {
  name = "yank-wars-module";
  nodes.machine = {
    imports = [ module ];
    services.yank-wars = {
      enable = true;
      inherit package;
      autoUpdate = {
        enable = true;
        repo = "example/yank-wars";
      };
    };
    system.extraDependencies = [ release ];
  };
  testScript = ''
    machine.wait_for_unit("yank-wars.service")
    machine.wait_for_open_port(7300)
    assert machine.succeed("curl -sf http://127.0.0.1:7300/healthz") == "ok"
    machine.succeed("curl -sf http://127.0.0.1:7300/ | grep -q '<title>Yank Wars</title>'")
    asset = machine.succeed("curl -sf http://127.0.0.1:7300/ | grep -o '/assets/index-[^\"]*\\.js'").strip()
    machine.succeed(f"curl -sfI http://127.0.0.1:7300{asset} | grep -qi 'cache-control: public, max-age=31536000, immutable'")
    machine.fail("curl -sf http://127.0.0.1:7300/nope")
    machine.succeed("systemctl show -p DynamicUser --value yank-wars | grep -qx yes")

    with subtest("an updater that can't reach GitHub fails without touching the running server"):
        machine.succeed("systemctl list-timers yank-wars-update.timer | grep -q yank-wars-update")
        machine.fail("systemctl start yank-wars-update.service")
        machine.fail("test -e /var/lib/yank-wars-updater/current")
        assert machine.succeed("curl -sf http://127.0.0.1:7300/healthz") == "ok"

    with subtest("the server starts from the updater's build when there is one"):
        machine.fail("journalctl -u yank-wars | grep -q \"started from the updater's build\"")
        machine.succeed("ln -sfn ${release} /var/lib/yank-wars-updater/current")
        machine.succeed("systemctl restart yank-wars.service")
        machine.wait_for_open_port(7300)
        machine.succeed("journalctl -u yank-wars | grep -q \"started from the updater's build\"")
        assert machine.succeed("curl -sf http://127.0.0.1:7300/healthz") == "ok"
  '';
}
