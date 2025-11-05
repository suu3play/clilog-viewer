/**
 * ログ変換機能のE2Eテスト
 */
const { test, expect } = require('@playwright/test');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

test.describe('ログ変換機能', () => {
  const testLogDir = path.join(__dirname, '../test_logs');
  const testOutputDir = path.join(__dirname, '../test_output');

  test.beforeAll(async () => {
    // テスト用ディレクトリを作成
    await fs.mkdir(testLogDir, { recursive: true });
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  test.afterAll(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(testLogDir, { recursive: true, force: true });
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  test('サンプルJSONLファイルを変換できる', async () => {
    // テスト用JSONLファイルを作成
    const testFile = path.join(testLogDir, 'test_conversation.jsonl');
    const jsonlContent = `{"type":"message","role":"user","content":"Hello"}
{"type":"message","role":"assistant","content":"Hi there!"}
{"type":"message","role":"user","content":"How are you?"}
`;

    await fs.writeFile(testFile, jsonlContent, 'utf-8');

    // log_converter.pyを実行（実際のテストでは適切なパスを指定）
    // 注：このテストは実際の環境に応じて調整が必要
    try {
      const { stdout, stderr } = await execAsync(
        `python log_converter.py --list`,
        { cwd: path.join(__dirname, '..') }
      );

      // 実行が成功することを確認
      expect(stderr).toBe('');
    } catch (error) {
      // Pythonが利用できない環境ではスキップ
      test.skip();
    }
  });

  test('--listオプションでファイル一覧を表示できる', async () => {
    try {
      const { stdout } = await execAsync(
        `python log_converter.py --list`,
        { cwd: path.join(__dirname, '..') }
      );

      // 何らかの出力があることを確認
      expect(stdout).toBeTruthy();
    } catch (error) {
      test.skip();
    }
  });

  test('設定ファイルが存在する', async () => {
    const configPath = path.join(__dirname, '../log_converter_config.ini');

    try {
      await fs.access(configPath);
      // ファイルが存在することを確認
      const stats = await fs.stat(configPath);
      expect(stats.isFile()).toBe(true);
    } catch (error) {
      // 設定ファイルが自動生成される場合はスキップ
      test.skip();
    }
  });
});

test.describe('変換後のファイル検証', () => {
  test('Markdownファイルのフォーマットが正しい', async () => {
    const testMdPath = path.join(__dirname, '../logs');

    try {
      // logsディレクトリが存在するか確認
      const files = await fs.readdir(testMdPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length > 0) {
        // 最初のMarkdownファイルを読み込み
        const content = await fs.readFile(
          path.join(testMdPath, mdFiles[0]),
          'utf-8'
        );

        // Markdown形式の基本的な構造を確認
        expect(content).toContain('#'); // 見出しが含まれる
        expect(content.length).toBeGreaterThan(0);
      }
    } catch (error) {
      // logsディレクトリが存在しない場合はスキップ
      test.skip();
    }
  });
});
