{
  description = "pdfboop: Browser-Based PDF Editor";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_25
            pnpm
            biome
            typescript-language-server
          ];
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "pdfboop";
          version = "0.1.0";
          src = ./.;

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (self.packages.${system}.default) pname version src;
            hash = "sha256-chl/z/v7dU7hSTgx2vntkh+rO/obu2hS7sFBYYNlEbU=";
            fetcherVersion = 1;
          };

          nativeBuildInputs = [
            pkgs.nodejs_25
            pkgs.pnpm
            pkgs.pnpmConfigHook
          ];

          buildPhase = ''
            pnpm build
          '';

          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';
        };
      });
}
