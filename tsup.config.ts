import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // sourcemaps pointed at ../src, which never ships in the tarball, so they
  // were broken for every consumer & ~40kB of dead weight
  sourcemap: false,
  target: "es2022",
});
