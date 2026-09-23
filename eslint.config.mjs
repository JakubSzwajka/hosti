import codebaseAiRules from "eslint-plugin-codebase-ai-rules";

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
  ...codebaseAiRules.configs.recommended,
];
