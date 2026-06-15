# flake.nix — thin wrapper so `nix develop` works without devenv CLI.
# Most developers should use `devenv up` (via devenv + direnv) instead.
{
  description = "MemberJunction development shell";

  inputs = {
    nixpkgs.url  = "github:NixOS/nixpkgs/nixos-24.11";
    devenv.url   = "github:cachix/devenv";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, devenv, flake-utils, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = devenv.lib.mkShell {
          inherit pkgs inputs;
          modules = [ (import ./devenv.nix) ];
        };
      }
    );
}
