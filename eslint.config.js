const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: "module"
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin
        },
        rules: {
            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    "selector": "variable",
                    "format": ["camelCase", "UPPER_CASE", "PascalCase"]
                },
                {
                    "selector": "function",
                    "format": ["camelCase", "PascalCase"]
                },
                {
                    "selector": "class",
                    "format": ["PascalCase"]
                },
                {
                    "selector": "interface",
                    "format": ["PascalCase"],
                    "prefix": ["I"]
                },
                {
                    "selector": "typeAlias",
                    "format": ["PascalCase"]
                },
                {
                    "selector": "enum",
                    "format": ["PascalCase"]
                },
                {
                    "selector": "classProperty",
                    "format": ["camelCase"],
                    "leadingUnderscore": "allow"
                },
                {
                    "selector": "classMethod",
                    "format": ["camelCase"],
                    "leadingUnderscore": "allow"
                },
                {
                    "selector": "parameter",
                    "format": ["camelCase"],
                    "leadingUnderscore": "allow"
                }
            ]
        },
        ignores: ["out/**", "dist/**", "node_modules/**"]
    }
];
