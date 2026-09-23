import tsParser from "@typescript-eslint/parser";
import { commentDisciplinePlugin } from "./tools/eslint/comment-discipline.mjs";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "apps/web/.next/**",
      "apps/web/next-env.d.ts",
      ".pi/specs/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      hosti: commentDisciplinePlugin,
    },
    rules: {
      "hosti/comment-discipline": "error",
    },
  },
];
