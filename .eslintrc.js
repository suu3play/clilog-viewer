module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        // 基本的なコード品質ルール
        'no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
        }],
        'no-console': 'off', // ログビューアーなのでconsoleは許可
        'no-debugger': 'warn',

        // コードスタイル
        'indent': ['error', 4, { SwitchCase: 1 }],
        'linebreak-style': 'off', // Windows/Unix混在環境に対応
        'quotes': ['error', 'single', { avoidEscape: true }],
        'semi': ['error', 'always'],

        // ベストプラクティス
        'eqeqeq': ['error', 'always'],
        'no-var': 'error',
        'prefer-const': 'warn',
        'prefer-arrow-callback': 'warn',
        'no-eval': 'error',
        'no-implied-eval': 'error',

        // 潜在的なバグの防止
        'no-prototype-builtins': 'error',
        'no-self-compare': 'error',
        'no-unmodified-loop-condition': 'error',
        'no-unreachable-loop': 'error',

        // 可読性
        'comma-dangle': ['error', 'never'],
        'comma-spacing': ['error', { before: false, after: true }],
        'key-spacing': ['error', { beforeColon: false, afterColon: true }],
        'space-before-blocks': 'error',
        'space-infix-ops': 'error',
        'arrow-spacing': ['error', { before: true, after: true }]
    },
    globals: {
        // Socket.IO
        io: 'readonly'
    }
};
