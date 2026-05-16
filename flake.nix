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
            hash = "sha256-5WFwpFVfPddyX7j8zvrN8ywQ1dECmy1x1kvhx0RDIHs=";
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
