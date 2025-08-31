# Claude Log Converter

会話ログをMarkdownファイルに変換するPythonツール

## 概要

このツールは、Claude Codeの会話ログ（JSONL形式）を読みやすいMarkdownファイルに変換します。

## 機能

- **自動ファイル検索**: `~/.claude/projects`配下のJSONLファイルを自動検索
- **設定ファイル対応**: ログディレクトリ・出力先・処理件数を設定可能
- **増分更新**: 未変更ファイルは自動スキップ（高速処理）
- **バッチ処理**: 複数ファイルの一括変換
- **ファイル名規則**: `log_yyyyMMddHHmmss_元ファイル名.md` 形式

## セットアップ

### 要件
- Python 3.6以上
- 標準ライブラリのみ使用（追加パッケージ不要）

### インストール
```bash
# プロジェクトをクローンまたはダウンロード
cd claude-log
```

## 使用方法

### 基本的な使用
```bash
# 設定に基づく自動処理（推奨）
python log_converter.py

# 利用可能ファイル一覧表示
python log_converter.py --list

# 特定ファイルを変換
python log_converter.py path/to/conversation.jsonl
```

### オプション
```bash
# 全ファイル処理（件数制限なし）
python log_converter.py --all

# 強制処理（未変更でも処理）
python log_converter.py --force

# 出力ファイル名指定
python log_converter.py input.jsonl -o output.md

# 設定ファイル指定
python log_converter.py --config my_config.ini
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

### カスタマイズ例
```ini
[DEFAULT]
log_directory = C:\Users\username\.claude\projects
output_directory = D:\Logs\Claude
max_files = 20
skip_unchanged = true
```

## 出力形式

### ファイル名規則
- `log_20240331143022_conversation.md`
- 日時は元ファイルの最終更新日時

### Markdown構造
```markdown
# 会話ログ

生成日時: 2024-03-31 14:30:22

---

## 👤 ユーザー (2024-03-31 14:28:15)

ユーザーの発言内容

---

## 🤖 アシスタント (2024-03-31 14:28:30)

アシスタントの回答

[ツール使用: TodoWrite]
```json
{
  "todos": [...]
}
```

---
```

## 処理状況管理

- `processed_files.json`で処理済みファイルを管理
- ファイルの更新日時を記録し、未変更なら自動スキップ
- 強制処理や設定変更時は`--force`オプションを使用

## トラブルシューティング

### ログファイルが見つからない
```bash
# ディレクトリを確認
python log_converter.py --list

# 設定ファイルのlog_directoryを確認・修正
```

### 処理がスキップされる
```bash
# 強制処理
python log_converter.py --force

# 処理済み情報をリセット
rm processed_files.json
```

### 出力先が見つからない
- 設定ファイルの`output_directory`を確認
- ディレクトリが存在しない場合は自動作成

## ライセンス

MIT License