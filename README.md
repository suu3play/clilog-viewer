# clilog-viewer - Multi-AI CLI Log Converter & Viewer

AI CLIツールの会話ログをMarkdownファイルに変換し、高速チャットビューアーで表示するPythonツール

## 概要

このツールは、各種AI CLIツール（Claude Code、GitHub Copilot、ChatGPTなど）の会話ログを読みやすいMarkdownファイルに変換し、SQLiteキャッシュによる高速チャットビューアーで表示します。

## 機能

### ログ変換機能（既存）
- **自動ファイル検索**: `~/.claude/projects`配下のJSONLファイルを自動検索
- **設定ファイル対応**: ログディレクトリ・出力先・処理件数を設定可能
- **増分更新**: 未変更ファイルは自動スキップ（高速処理）
- **バッチ処理**: 複数ファイルの一括変換
- **ファイル名規則**: `log_yyyyMMddHHmmss_元ファイル名.md` 形式

### 高速チャットビューアー ⚡
- **SQLiteキャッシュ**: 初回パース後は50-150倍高速読み込み
- **Virtual Scrolling**: 大量メッセージの効率的描画
- **高速全文検索**: FTS5による瞬時検索（100-500倍高速化）
- **レスポンシブデザイン**: デスクトップ・モバイル対応
- **ダーク/ライトテーマ**: 目に優しい表示切り替え
- **コードハイライト**: シンタックスハイライト・ワンクリックコピー
- **ツール使用視覚化**: 展開可能なJSONブロック

### 🆕 リアルタイムビューワー機能 ⚡
- **リアルタイムモード**: ClaudeのJSONLファイルを直接読み取り
- **最新優先表示**: 最新ファイルから効率的に表示（速度最適化）
- **ファイル選択**: ドロップダウンでJSONLファイルを選択可能
- **WebSocket通信**: リアルタイムでファイル更新を通知
- **デュアルモード**: データベースモードと独立して動作
- **接続ステータス**: リアルタイム接続状況をリアルタイム表示

## セットアップ

### 要件
- Python 3.6以上
- Flask 3.0.0
- 標準ライブラリ（sqlite3, hashlib）

### インストール

#### オプション1: npmパッケージからインストール（推奨）

```bash
# npmパッケージをインストール
npm install @suu3play/clilog-viewer

# Python依存関係をインストール
cd node_modules/@suu3play/clilog-viewer/viewer
pip install -r requirements.txt
```

#### オプション2: GitHubからクローン

```bash
# プロジェクトをクローンまたはダウンロード
git clone https://github.com/suu3play/clilog-viewer.git
cd clilog-viewer

# チャットビューアー用依存関係インストール
cd viewer
pip install -r requirements.txt
```

## 使用方法

### npmパッケージとしての使用

npmパッケージからインストールした場合の使用方法：

#### 1. ログ変換
```bash
# パッケージディレクトリに移動
cd node_modules/@suu3play/clilog-viewer

# 設定に基づく自動処理（推奨）
python log_converter.py

# 利用可能ファイル一覧表示
python log_converter.py --list

# 特定ファイルを変換
python log_converter.py path/to/conversation.jsonl
```

#### 2. npmスクリプトとして実行（推奨）
プロジェクトの`package.json`にスクリプトを追加：

```json
{
  "scripts": {
    "log:convert": "cd node_modules/@suu3play/clilog-viewer && python log_converter.py",
    "log:list": "cd node_modules/@suu3play/clilog-viewer && python log_converter.py --list",
    "log:viewer": "cd node_modules/@suu3play/clilog-viewer/viewer && python app.py"
  }
}
```

実行：
```bash
npm run log:convert
npm run log:list
npm run log:viewer
```

#### 3. チャットビューアー起動
```bash
# Windowsの場合
cd node_modules/@suu3play/clilog-viewer/viewer
run.bat

# または手動起動
python app.py
```

ブラウザで `http://localhost:5000` にアクセス

### GitHubクローン版の使用方法

#### 1. ログ変換
```bash
# 設定に基づく自動処理（推奨）
python log_converter.py

# 利用可能ファイル一覧表示
python log_converter.py --list

# 特定ファイルを変換
python log_converter.py path/to/conversation.jsonl
```

#### 2. チャットビューアー（データベース + リアルタイム対応）
```bash
# Windowsの場合
cd viewer
run.bat

# または手動起動
python app.py
```

ブラウザで `http://localhost:5000` にアクセス

#### リアルタイムモード使用方法
1. **モード切り替え**: ヘッダーで「⚡ リアルタイムモード」をクリック
2. **ファイル選択**: ドロップダウンから表示したいJSONLファイルを選択
3. **自動更新**: WebSocketでファイル変更をリアルタイム検知・表示
4. **接続状況**: 画面右上で接続ステータスを確認

### 3. 自動実行の設定（Windows）
Windowsタスクスケジューラに登録して、定期的にログ変換を自動実行できます。

```bash
# インストール（管理者権限で実行）
install_task_scheduler.bat を右クリック → 「管理者として実行」

# アンインストール（管理者権限で実行）
uninstall_task_scheduler.bat を右クリック → 「管理者として実行」
```

**登録内容**:
- タスク名: `clilog-viewer-auto-convert`
- 実行タイミング: 毎日 9:00 AM（インストール時にカスタマイズ可能）
- 実行内容: `python log_converter.py --force`
- 動作: バックグラウンドで自動実行、ログ変換を最新状態に保つ

**確認方法**:
1. Windowsキー + R → `taskschd.msc` と入力
2. タスクスケジューラライブラリで `clilog-viewer-auto-convert` を確認

### 4. キャッシュ管理
```bash
# 全ファイルのキャッシュを事前作成（推奨）
cd viewer
python message_cache.py --build-cache

# 特定ファイルのテスト
python message_cache.py ../log_20240331143022_conversation.md
```

## チャットビューアーの特徴

### ⚡ パフォーマンス最適化
| 機能 | 初回 | キャッシュ後 | 高速化率 |
|-----|-----|-----------|---------|
| 5MBファイル読み込み | 2-3秒 | 20-50ms | **50-150倍** |
| 全文検索 | 500ms-1秒 | 1-5ms | **100-500倍** |
| フィルタリング | 200-500ms | 5-10ms | **20-50倍** |

### 🎨 モダンUI
- **チャット形式表示**: 吹き出しレイアウトで読みやすい
- **Virtual Scrolling**: 数千メッセージでもスムーズ
- **検索ハイライト**: 一致箇所を強調表示
- **レスポンシブ**: モバイルでも快適操作

### 🔍 高速検索機能
```
# 検索例
"エラー" AND "修正"          # 複数キーワード
"function.*Error"           # 正規表現
tool:TodoWrite             # ツール名検索
```

## プロジェクト構成

```
clilog-viewer/
├── log_converter.py              # 既存のログ変換スクリプト
├── log_converter_config.ini      # 設定ファイル
├── processed_files.json          # 処理済みファイル管理
├── install_task_scheduler.bat    # タスクスケジューラ登録（Windows）
├── install_task_scheduler.ps1    # タスクスケジューラ登録スクリプト
├── uninstall_task_scheduler.bat  # タスクスケジューラ削除（Windows）
├── uninstall_task_scheduler.ps1  # タスクスケジューラ削除スクリプト
├── viewer/                       # 新規：チャットビューアー
│   ├── app.py               # Flask Webサーバー
│   ├── message_cache.py     # SQLiteキャッシュシステム
│   ├── requirements.txt     # Python依存関係
│   ├── run.bat             # Windows起動スクリプト
│   ├── cache/              # キャッシュデータベース
│   ├── static/
│   │   ├── css/style.css   # レスポンシブスタイル
│   │   └── js/             # フロントエンドJS
│   │       ├── virtual-scroller.js
│   │       ├── api-client.js
│   │       ├── ui-manager.js
│   │       └── app.js
│   └── templates/
│       └── index.html      # メインHTML
├── logs/                    # 変換済みMarkdownファイル
└── README.md               # このファイル
```

## 設定ファイル

初回実行時に `log_converter_config.ini` が自動作成されます。

```ini
[DEFAULT]
# ログファイルのディレクトリ（空の場合は自動検索）
log_directory = 

# 出力先ディレクトリ（空の場合は作業ディレクトリ）
output_directory = 

# 一度に処理する最大ファイル数
max_files = 10

# 未変更ファイルをスキップするか
skip_unchanged = true
```

## トラブルシューティング

### タスクスケジューラ登録に失敗する
```bash
# 管理者権限で実行されているか確認
# install_task_scheduler.bat を右クリックして「管理者として実行」を選択

# Python実行パスの確認
python --version
# または
python3 --version

# install_log.txt でエラー詳細を確認
type install_log.txt
```

**よくあるエラー**:
- 「管理者権限が必要です」→ 右クリックメニューから「管理者として実行」
- 「Pythonが見つかりません」→ Pythonのインストール確認、PATH設定確認
- 「log_converter.py が見つかりません」→ プロジェクトルートで実行されているか確認

### タスクが実行されない
```bash
# タスクスケジューラで確認
# Windowsキー + R → taskschd.msc

# タスクの状態を確認
# 「clilog-viewer-auto-convert」を右クリック → 「実行」でテスト実行
# 「履歴」タブでエラー確認
```

### チャットビューアーが起動しない
```bash
# Python環境確認
python --version

# 依存関係再インストール
cd viewer
pip install -r requirements.txt --force-reinstall

# 手動起動
python app.py
```

### キャッシュが効かない
```bash
# キャッシュ再構築
cd viewer
python message_cache.py --build-cache

# または、Webインターフェースで「キャッシュ作成」ボタンクリック
```

### 検索が遅い
1. キャッシュが作成されているか確認
2. SQLiteデータベース（`.cache/message_cache.db`）のサイズ確認
3. 必要に応じてキャッシュ再構築

### ログファイルが見つからない
```bash
# ファイル確認
python log_converter.py --list

# 設定ファイルのlog_directoryを確認・修正
```

## パフォーマンス最適化のポイント

1. **事前キャッシュ作成**: `--build-cache` でバッチ処理
2. **ファイルハッシュ**: 高速更新検知（先頭1MB+末尾1KB）
3. **FTS5全文検索**: SQLiteの高速検索エンジン
4. **Virtual Scrolling**: DOM要素最小化
5. **レスポンシブ画像**: 軽量アセット読み込み

## パッケージ情報

### npm公開情報
- **パッケージ名**: `@suu3play/clilog-viewer`
- **バージョン**: 2.0.0
- **npm**: https://www.npmjs.com/package/@suu3play/clilog-viewer
- **GitHub**: https://github.com/suu3play/clilog-viewer
- **ライセンス**: MIT

### インストール
```bash
npm install @suu3play/clilog-viewer
```

### アップデート
```bash
# 最新バージョンを確認
npm view @suu3play/clilog-viewer version

# 最新版に更新
npm update @suu3play/clilog-viewer
```

## テスト

### セットアップ

#### Pythonテスト依存関係のインストール
```bash
pip install -r requirements-dev.txt
```

#### JavaScriptテスト依存関係のインストール
```bash
npm install --save-dev jest @testing-library/dom @playwright/test
npx playwright install
```

### テスト実行

#### Pythonユニットテスト
```bash
# テスト実行
pytest tests/ -v

# カバレッジレポート付き
pytest tests/ -v --cov=. --cov-report=html --cov-report=term

# または npm scripts
npm run test:python
```

#### JavaScriptユニットテスト
```bash
# テスト実行
jest

# ウォッチモード
jest --watch

# カバレッジレポート付き
jest --coverage

# または npm scripts
npm run test:js
```

#### E2Eテスト（Playwright）
```bash
# テスト実行
npx playwright test

# UIモード（デバッグ用）
npx playwright test --ui

# 特定のブラウザのみ
npx playwright test --project=chromium

# または npm scripts
npm run test:e2e
```

#### すべてのテストを実行
```bash
npm run test:all
```

### テストカバレッジ

テスト実行後、カバレッジレポートが生成されます：

- **Pythonカバレッジ**: `htmlcov/index.html`
- **JavaScriptカバレッジ**: `coverage/js/index.html`
- **Playwrightレポート**: `playwright-report/index.html`

### テスト構成

```
clilog-viewer/
├── tests/                      # Pythonテスト
│   ├── conftest.py            # pytest設定・共通fixture
│   ├── unit/                  # ユニットテスト
│   │   ├── test_log_converter.py
│   │   ├── test_database.py
│   │   └── ...
│   └── fixtures/              # テストデータ
│       └── sample.jsonl
├── viewer/static/js/tests/    # JavaScriptテスト
│   ├── api-client.test.js
│   ├── virtual-scroller.test.js
│   └── ...
├── e2e/                       # E2Eテスト
│   ├── viewer.spec.js
│   └── realtime.spec.js
├── pytest.ini                 # pytest設定
├── jest.config.js            # Jest設定
└── playwright.config.js      # Playwright設定
```

## ライセンス

MIT License

---

## 更新履歴

詳細は[CHANGELOG.md](CHANGELOG.md)を参照してください。

**v2.0.0** (2025-10-28)
- npmパッケージとして公開
- 高速チャットビューアー追加
- SQLiteキャッシュシステム実装
- Virtual Scrolling対応
- 全文検索機能（FTS5）
- レスポンシブデザイン
- ダーク/ライトテーマ
- リアルタイムビューアー機能

**v1.0.0** (2024-09-06)
- JSONLからMarkdown変換
- 設定ファイル対応
- 増分更新処理