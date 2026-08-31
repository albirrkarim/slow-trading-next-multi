import globals from "globals";
import eslintJs from "@eslint/js";
import eslintTs from "typescript-eslint";

import reactPlugin from "eslint-plugin-react";
import importPlugin from "eslint-plugin-import";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import perfectionistPlugin from "eslint-plugin-perfectionist";

// ----------------------------------------------------------------------

/**
 * @rules common
 * from 'react', 'eslint-plugin-react-hooks'...
 */
const commonRules = () => ({
  ...reactHooksPlugin.configs.recommended.rules,
  "func-names": 1,
  "no-bitwise": 2,
  "no-unused-vars": 0,
  "object-shorthand": 1,
  "no-useless-rename": 1,
  "default-case-last": 2,
  "consistent-return": 2,
  "no-constant-condition": 1,
  "default-case": [2, { commentPattern: "^no default$" }],
  "lines-around-directive": [2, { before: "always", after: "always" }],
  "arrow-body-style": [
    2,
    "as-needed",
    { requireReturnForObjectLiteral: false },
  ],
  // react
  "react/jsx-key": 0,
  "react/prop-types": 0,
  "react/display-name": 0,
  "react/no-children-prop": 0,
  "react/jsx-boolean-value": 2,
  "react/self-closing-comp": 2,
  "react/react-in-jsx-scope": 0,
  "react/jsx-no-useless-fragment": [1, { allowExpressions: true }],
  "react/jsx-curly-brace-presence": [2, { props: "never", children: "never" }],
  // typescript
  "@typescript-eslint/no-shadow": 2,
  "@typescript-eslint/no-explicit-any": 0,
  "@typescript-eslint/no-empty-object-type": 0,
  "@typescript-eslint/consistent-type-imports": 1,
  "@typescript-eslint/no-unused-vars": [1, { args: "none" }],
});

/**
 * @rules import
 * from 'eslint-plugin-import'.
 */
const importRules = () => ({
  ...importPlugin.configs.recommended.rules,
  "import/named": 0,
  "import/export": 0,
  "import/default": 0,
  "import/namespace": 0,
  "import/no-named-as-default": 0,
  "import/newline-after-import": 2,
  "import/no-named-as-default-member": 0,
  "import/no-cycle": [
    0, // disabled if slow
    {
      maxDepth: "∞",
      ignoreExternal: false,
      allowUnsafeDynamicCyclicDependency: false,
    },
  ],
});

/**
 * @rules unused imports
 * from 'eslint-plugin-unused-imports'.
 */
const unusedImportsRules = () => ({
  "unused-imports/no-unused-imports": 1,
  "unused-imports/no-unused-vars": [
    0,
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
    },
  ],
});

/**
 * Custom ESLint configuration.
 */
export const customConfig = {
  plugins: {
    "react-hooks": reactHooksPlugin,
    "unused-imports": unusedImportsPlugin,
    perfectionist: perfectionistPlugin,
    import: importPlugin,
  },
  settings: {
    // https://www.npmjs.com/package/eslint-import-resolver-typescript
    ...importPlugin.configs.typescript.settings,
    "import/resolver": {
      ...importPlugin.configs.typescript.settings["import/resolver"],
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  rules: {
    ...commonRules(),
    ...importRules(),
    ...unusedImportsRules(),
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
};

// ----------------------------------------------------------------------

const config = [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  {
    ignores: [
      "*",
      "!src/",
      "!eslint.config.*",
      "node_modules",
      "_private",
      "src/sections/lib/UI/MinimalKit/basic/input/editor",
      "src/sections/lib/UI/Components",
      "src/sections/lib/UI/LaraKit",
      "src/_mock_server",
      "_deprecated",
    ],
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    settings: { react: { version: "detect" } },
  },
  eslintJs.configs.recommended,
  ...eslintTs.configs.recommended,
  reactPlugin.configs.flat.recommended,
  customConfig,
  {
    files: [
      "src/lib/**/*.{js,mjs,cjs,ts,jsx,tsx}",
      "src/pages/api/**/*.{js,mjs,cjs,ts,jsx,tsx}",
      "src/components/**/*.{js,mjs,cjs,ts,jsx,tsx}",
    ],
    rules: {
      // "no-console": "error",
    },
  },
  {
    files: ["src/lib/trading/helper/log.ts"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;
