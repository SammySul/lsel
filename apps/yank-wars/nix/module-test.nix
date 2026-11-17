# Boots the module in a VM and fetches the game through it. Linux only: run on twelve.
{
  testers,
  module,
  package,
}:
testers.runNixOSTest {
  name = "yank-wars-module";
  nodes.machine = {
    imports = [ module ];
    services.yank-wars = {
      enable = true;
      inherit package;
    };
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
  '';
}
