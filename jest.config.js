/**
 * Jest設定ファイル
 * JavaScriptユニットテスト用
 */
module.exports = {
  // テスト環境
  testEnvironment: 'jsdom',

  // テストファイルのパターン
  testMatch: [
    '**/viewer/static/js/tests/**/*.test.js',
    '**/tests/**/*.test.js'
  ],

  // カバレッジ収集対象
  collectCoverageFrom: [
    'viewer/static/js/**/*.js',
    '!viewer/static/js/tests/**',
    '!**/node_modules/**'
  ],

  // カバレッジレポート形式
  coverageReporters: [
    'html',
    'text',
    'lcov'
  ],

  // カバレッジ出力ディレクトリ
  coverageDirectory: 'coverage/js',

  // カバレッジ閾値
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // モジュール名マッピング（必要に応じて）
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // タイムアウト設定
  testTimeout: 10000,

  // 詳細表示
  verbose: true
};
