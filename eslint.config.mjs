// Lint for the whole monorepo (CI runs `pnpm lint`). Kept to the recommended rule sets so it
// catches real mistakes without style churn; formatting is not linted.
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**", "**/.next/**", "**/.turbo/**", "**/dist/**", "**/coverage/**",
      "**/next-env.d.ts", "packages/scoring/src/generated.ts", "apps/web/test-results/**", "apps/web/playwright-report/**",
      ".data/**", "supabase/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Production serves the app under /leads: raw app paths in fetch() and form actions skip
      // the base path. next/link and next/navigation add it on their own.
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\u002F/]", message: "Wrap app paths in withBase() so the /leads base path is kept." },
        { selector: "CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement:first-child[value.raw=/^\\u002F/]", message: "Wrap app paths in withBase() so the /leads base path is kept." },
        { selector: "JSXAttribute[name.name='action'] > Literal[value=/^\\u002F/]", message: "Wrap form actions in withBase() so the /leads base path is kept." },
      ],
    },
  },
  {
    files: ["**/*.mjs", "scripts/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
