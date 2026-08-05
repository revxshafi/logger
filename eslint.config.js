import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // only the shipped sources & their tests are linted; everything else in the
  // working tree belongs to tooling
  { ignores: ["**/*", "!src/**", "!test/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // the public API is deliberately `unknown` first: a logger must accept
      // whatever a caller hands it, & narrowing happens inside serialize()
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // sanitize.ts exists to remove control characters, & helpers.ts strips
    // the escapes it produces; a control character in these regexes is intent
    files: ["src/internal/sanitize.ts", "test/helpers.ts"],
    rules: { "no-control-regex": "off" },
  },
  {
    // the deprecated 1.x option names are still read here, on purpose: folding
    // them into the nested shape is exactly what these modules are for
    files: ["src/logger.ts", "src/transports/console.ts", "src/index.ts"],
    rules: { "@typescript-eslint/no-deprecated": "off" },
  },
  {
    // tests reach past the public API on purpose, & pass deliberately
    // ill typed values to prove the runtime guards hold
    files: ["test/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/only-throw-error": "off",
    },
  },
);
