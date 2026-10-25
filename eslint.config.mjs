import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Warnings for now: the circle data is still untyped. Replace `any`
      // with real types, then make this an error.
      "@typescript-eslint/no-explicit-any": "warn",
      // Names starting with _ are deliberately unused (e.g. fields stripped
      // out with destructuring).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
      // The organiser wheel restarts its animation this way on purpose.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Edge Functions run on Deno.
    files: ["supabase/functions/**"],
    languageOptions: { globals: { Deno: "readonly" } },
  },
]);
