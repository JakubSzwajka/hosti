import codebaseAiRules from "eslint-plugin-codebase-ai-rules";
import design from "eslint-plugin-codebase-ai-rules/design";
import markdown from "eslint-plugin-codebase-ai-rules/markdown";

function allowedColors(...alphaFades) {
  // allowValues replaces the rule's defaults, so every list starts from them.
  return ["transparent", "currentcolor", "inherit", "initial", "unset", ...alphaFades];
}

function appAlphaFades() {
  return [
    // The dot grid: ink at 8% on the paper behind every page.
    "rgba(43, 49, 51, 0.08)",
    // DESIGN.md's preview scrim: ink fading from 0% to 24% under the label.
    "rgba(43, 49, 51, 0)",
    "rgba(43, 49, 51, 0.24)",
    // Card at 0%, so a live preview fades into the card below it.
    "rgba(248, 253, 255, 0)",
  ];
}

function standalonePages() {
  // The not-found page can't load the token stylesheet (node_modules/eslint-plugin-codebase-ai-rules/docs/design-no-raw-color-literal.md#options).
  return ["apps/web/src/server/serving/respond.ts"];
}

function inlineStyleTokens() {
  // landing/index.html sets each chart bar's height in a style attribute.
  return ["--bar"];
}

function landingAlphaFades() {
  return [
    // The dot grid: ink at 8% on the paper behind the page.
    "rgba(43, 49, 51, 0.08)",
  ];
}

export default [
  {
    ignores: [
      "**/node_modules/**",
      "apps/web/.next/**",
      ".agent_sources/**",
      "apps/web/next-env.d.ts",
      ".pi/specs/**",
      "**/build/**",
      "**/dist/**",
      "**/coverage/**",
    ],
  },
  ...codebaseAiRules.configs.recommended,
  ...markdown,
  ...design({
    tokenFiles: ["apps/web/src/styles/hosti.css"],
    css: { files: ["apps/web/src/styles/**/*.css"] },
    source: { files: ["apps/web/src/**/*.{ts,tsx}"] },
    rules: {
      "design-scale-value": [
        {
          property: "radius$",
          allowed: ["0", "2px", "3px", "4px", "5px", "6px", "8px", "10px", "12px", "999px", "50%"],
        },
        { property: "^(box|text)-shadow$", allowed: ["none"] },
        { property: "^(transition|animation)", allowed: ["none"], requireVar: "--t" },
      ],
      "design-no-raw-color": { allowValues: allowedColors(...appAlphaFades()) },
      "design-no-raw-color-literal": { allowIn: standalonePages() },
    },
  }),
  ...design({
    tokenFiles: ["landing/styles/tokens.css"],
    css: { files: ["landing/styles/**/*.css"] },
    source: false,
    rules: {
      "design-no-raw-color": { allowValues: allowedColors(...landingAlphaFades()) },
      "design-no-unknown-token": { allow: inlineStyleTokens() },
    },
  }),
];
