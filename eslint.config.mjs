export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly"
      }
    },
    rules: {
      eqeqeq: "error",
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": "error"
    }
  }
];
