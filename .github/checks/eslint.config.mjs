// ESLint flat config for the games repo. Run from the repo root (see .github/workflows/checks.yml).
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: [".github/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, Gamekit: "readonly", Manpage: "readonly" },
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-implicit-globals": "error",
      "no-use-before-define": ["error", { functions: false, classes: true, variables: false }],
    },
  },
];
