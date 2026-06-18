import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      ".next/**",
      ".next-app/**",
      ".next-local/**",
      "node_modules/**",
      ".npm-cache/**",
      ".appdata/**",
      ".localappdata/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
];
