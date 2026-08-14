export default [
  {
    ignores: ["node_modules/**", "coverage/**", "public/vendor/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        URLSearchParams: "readonly",
        URL: "readonly",
        Intl: "readonly",
        CustomEvent: "readonly",
        encodeURIComponent: "readonly",
        decodeURIComponent: "readonly",
        HTMLElement: "readonly",
        Node: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        crypto: "readonly",
        process: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-console": "off",
      "eqeqeq": ["error", "always"],
      "prefer-const": "error"
    }
  }
];
