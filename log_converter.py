#!/usr/bin/env python3
"""
会話ログをMarkdownファイルに変換するスクリプト
"""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
import configparser
import os


def format_timestamp(timestamp_str):
    """タイムスタンプをJST形式に変換"""
    try:
        # UTC時刻をパース
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        
        # JSTに変換（UTC+9）
        jst = timezone(timedelta(hours=9))
        dt_jst = dt.astimezone(jst)
        
        return dt_jst.strftime('%Y-%m-%d %H:%M:%S JST')
    except:
        return timestamp_str


def extract_content(message):
    """メッセージからコンテンツを抽出"""
    if isinstance(message, dict):
        if 'content' in message:
            content = message['content']
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'text':
                        text_parts.append(item.get('text', ''))
                    elif isinstance(item, dict) and item.get('type') == 'tool_use':
                        tool_name = item.get('name', 'unknown')
                        tool_input = item.get('input', {})
                        text_parts.append(f"[ツール使用: {tool_name}]\n```json\n{json.dumps(tool_input, ensure_ascii=False, indent=2)}\n```")
                return '\n'.join(text_parts)
            elif isinstance(content, str):
                return content
        elif 'role' in message:
            return extract_content(message)
    return str(message)


def clean_text(text):
    """テキストをクリーンアップ"""
    if not text:
        return ""
    
    # コマンドメッセージの処理
    text = re.sub(r'<command-message>.*?</command-message>', '', text, flags=re.DOTALL)
    text = re.sub(r'<command-name>.*?</command-name>', '', text, flags=re.DOTALL)
    text = re.sub(r'<command-args>.*?</command-args>', '', text, flags=re.DOTALL)
    
    # システムリマインダーの処理
    text = re.sub(r'<system-reminder>.*?</system-reminder>', '', text, flags=re.DOTALL)
    
    # 空行の整理
    text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
    text = text.strip()
    
    return text


def process_log_line(line):
    """ログの1行を処理"""
    try:
        data = json.loads(line.strip())
        
        # 基本情報の抽出
        timestamp = data.get('timestamp', '')
        user_type = data.get('userType', data.get('type', ''))
        
        # メッセージ内容の抽出
        message_data = data.get('message', {})
        role = message_data.get('role', user_type)
        content = extract_content(message_data)
        
        # サマリー情報の処理
        if data.get('type') == 'summary':
            return {
                'timestamp': format_timestamp(timestamp),
                'type': 'summary',
                'content': data.get('summary', ''),
                'role': 'system'
            }
        
        # 通常のメッセージ処理
        if content:
            content = clean_text(content)
            if content:  # 空でない場合のみ返す
                return {
                    'timestamp': format_timestamp(timestamp),
                    'type': 'message',
                    'role': role,
                    'content': content
                }
    
    except json.JSONDecodeError:
        # JSON以外の行は無視
        pass
    except Exception as e:
        print(f"エラー: {e}")
        print(f"問題のある行: {line[:100]}...")
    
    return None


def generate_output_filename(input_file, output_directory):
    """出力ファイル名を生成（JST時刻使用）"""
    # ファイルの更新時刻を取得（UTC）
    mod_time_utc = datetime.fromtimestamp(input_file.stat().st_mtime, tz=timezone.utc)
    
    # JSTに変換
    jst = timezone(timedelta(hours=9))
    mod_time_jst = mod_time_utc.astimezone(jst)
    
    timestamp = mod_time_jst.strftime('%Y%m%d%H%M%S')
    filename = f"log_{timestamp}_{input_file.stem}.md"
    return output_directory / filename


def load_processed_files_info(info_file):
    """処理済みファイル情報を読み込み"""
    if not info_file.exists():
        return {}
    
    try:
        with open(info_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}


def save_processed_files_info(info_file, info):
    """処理済みファイル情報を保存"""
    with open(info_file, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2)


def should_process_file(input_file, processed_info):
    """ファイルを処理すべきかチェック"""
    file_key = input_file.name
    current_mtime = input_file.stat().st_mtime
    
    if file_key in processed_info:
        last_mtime = processed_info[file_key].get('mtime', 0)
        if current_mtime <= last_mtime:
            return False
    
    return True


def convert_log_to_markdown(input_file, output_file=None):
    """ログファイルをMarkdownに変換"""
    if output_file is None:
        output_file = Path(input_file).with_suffix('.md')
    
    messages = []
    
    # ログファイルを読み込み
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    processed = process_log_line(line)
                    if processed:
                        messages.append(processed)
    except FileNotFoundError:
        print(f"ファイルが見つかりません: {input_file}")
        return False
    except Exception as e:
        print(f"ファイル読み込みエラー: {e}")
        return False
    
    if not messages:
        print("変換可能なメッセージが見つかりませんでした")
        return False
    
    # Markdownファイルを生成
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write("# 会話ログ\n\n")
            # 生成日時をJSTで表示
            jst = timezone(timedelta(hours=9))
            now_jst = datetime.now(jst)
            f.write(f"生成日時: {now_jst.strftime('%Y-%m-%d %H:%M:%S JST')}\n\n")
            f.write("---\n\n")
            
            for msg in messages:
                timestamp = msg['timestamp']
                role = msg['role']
                content = msg['content']
                msg_type = msg.get('type', 'message')
                
                if msg_type == 'summary':
                    f.write(f"## 📋 サマリー ({timestamp})\n\n")
                    f.write(f"{content}\n\n")
                else:
                    # ロール表示の調整
                    if role == 'user':
                        role_display = "👤 ユーザー"
                    elif role == 'assistant':
                        role_display = "🤖 アシスタント"
                    else:
                        role_display = f"⚙️ {role}"
                    
                    f.write(f"## {role_display} ({timestamp})\n\n")
                    f.write(f"{content}\n\n")
                    f.write("---\n\n")
        
        print(f"変換完了: {output_file}")
        print(f"処理したメッセージ数: {len(messages)}")
        return True
        
    except Exception as e:
        print(f"ファイル書き込みエラー: {e}")
        return False


class Config:
    """設定管理クラス"""
    def __init__(self, config_file='log_converter_config.ini'):
        self.config_file = Path(config_file)
        self.config = configparser.ConfigParser()
        self.load_config()
    
    def load_config(self):
        """設定ファイルを読み込み"""
        if self.config_file.exists():
            self.config.read(self.config_file, encoding='utf-8')
        else:
            self.create_default_config()
    
    def create_default_config(self):
        """デフォルト設定ファイルを作成"""
        self.config['DEFAULT'] = {
            'log_directory': '',  # 空の場合は自動検索
            'output_directory': '',  # 空の場合は作業ディレクトリ
            'max_files': '10',
            'skip_unchanged': 'true'
        }
        self.save_config()
        print(f"設定ファイルを作成しました: {self.config_file}")
    
    def save_config(self):
        """設定ファイルを保存"""
        with open(self.config_file, 'w', encoding='utf-8') as f:
            self.config.write(f)
    
    def get_log_directory(self):
        """ログディレクトリを取得"""
        log_dir = self.config.get('DEFAULT', 'log_directory', fallback='')
        if log_dir:
            return Path(log_dir)
        return Path.home() / '.claude' / 'projects'
    
    def get_output_directory(self):
        """出力ディレクトリを取得"""
        output_dir = self.config.get('DEFAULT', 'output_directory', fallback='')
        if output_dir:
            return Path(output_dir)
        return Path.cwd()
    
    def get_max_files(self):
        """最大ファイル数を取得"""
        return self.config.getint('DEFAULT', 'max_files', fallback=10)
    
    def get_skip_unchanged(self):
        """未変更スキップ設定を取得"""
        return self.config.getboolean('DEFAULT', 'skip_unchanged', fallback=True)


def find_log_files(log_directory=None):
    """Claudeプロジェクト配下のJSONLファイルを検索"""
    if log_directory is None:
        log_directory = Path.home() / '.claude' / 'projects'
    
    if not log_directory.exists():
        print(f"ログディレクトリが見つかりません: {log_directory}")
        return []
    
    jsonl_files = []
    for root, dirs, files in os.walk(log_directory):
        for file in files:
            if file.endswith('.jsonl'):
                full_path = Path(root) / file
                jsonl_files.append(full_path)
    
    # 更新日時でソート（新しい順）
    jsonl_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    return jsonl_files


def select_log_file(files):
    """ログファイルを選択"""
    if not files:
        print("JSONLファイルが見つかりませんでした。")
        return None
    
    if len(files) == 1:
        print(f"見つかったファイル: {files[0]}")
        return files[0]
    
    print("複数のJSONLファイルが見つかりました:")
    for i, file in enumerate(files, 1):
        rel_path = file.relative_to(Path.home() / '.claude' / 'projects')
        file_size = file.stat().st_size
        mod_time = datetime.fromtimestamp(file.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        print(f"{i:2d}: {rel_path} ({file_size:,} bytes, 更新: {mod_time})")
    
    while True:
        try:
            choice = input("\n選択してください (番号): ").strip()
            if not choice:
                return None
            index = int(choice) - 1
            if 0 <= index < len(files):
                return files[index]
            else:
                print("無効な番号です。")
        except ValueError:
            print("数字を入力してください。")
        except KeyboardInterrupt:
            print("\n中断しました。")
            return None


def process_multiple_files(files, config, processed_info, info_file):
    """複数ファイルを一括処理"""
    processed_count = 0
    skipped_count = 0
    
    output_directory = config.get_output_directory()
    skip_unchanged = config.get_skip_unchanged()
    
    for file in files:
        if skip_unchanged and not should_process_file(file, processed_info):
            print(f"スキップ（未変更）: {file.name}")
            skipped_count += 1
            continue
        
        output_file = generate_output_filename(file, output_directory)
        print(f"処理中: {file.name} → {output_file.name}")
        
        success = convert_log_to_markdown(file, output_file)
        if success:
            # 処理済み情報を更新
            processed_info[file.name] = {
                'mtime': file.stat().st_mtime,
                'output_file': str(output_file),
                'processed_at': datetime.now(timezone(timedelta(hours=9))).isoformat()
            }
            processed_count += 1
        else:
            print(f"エラー: {file.name} の処理に失敗")
    
    # 処理済み情報を保存
    save_processed_files_info(info_file, processed_info)
    
    print(f"\n処理完了: {processed_count}件, スキップ: {skipped_count}件")
    return processed_count > 0


def main():
    """メイン関数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='会話ログをMarkdownに変換')
    parser.add_argument('input_file', nargs='?', help='入力ログファイル（省略時は自動検索）')
    parser.add_argument('-o', '--output', help='出力Markdownファイル')
    parser.add_argument('--list', action='store_true', help='利用可能なログファイルを一覧表示')
    parser.add_argument('--config', help='設定ファイルパス')
    parser.add_argument('--all', action='store_true', help='全てのファイルを処理（デフォルト制限を無視）')
    parser.add_argument('--force', action='store_true', help='未変更でも強制処理')
    
    args = parser.parse_args()
    
    # 設定読み込み
    config = Config(args.config or 'log_converter_config.ini')
    
    # 処理済みファイル情報
    info_file = Path('processed_files.json')
    processed_info = load_processed_files_info(info_file)
    
    # ファイル一覧表示モード
    if args.list:
        files = find_log_files(config.get_log_directory())
        if files:
            print("利用可能なJSONLファイル:")
            for i, file in enumerate(files, 1):
                try:
                    rel_path = file.relative_to(config.get_log_directory())
                except ValueError:
                    rel_path = file
                file_size = file.stat().st_size
                mod_time = datetime.fromtimestamp(file.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                status = "処理済み" if not should_process_file(file, processed_info) else "未処理"
                print(f"{i:2d}: {rel_path} ({file_size:,} bytes, 更新: {mod_time}, {status})")
        else:
            print("JSONLファイルが見つかりませんでした。")
        return
    
    # 入力ファイルの決定
    if args.input_file:
        input_file = Path(args.input_file)
        if not input_file.exists():
            print(f"ファイルが見つかりません: {input_file}")
            exit(1)
        
        # 単一ファイル処理
        if args.output:
            output_file = Path(args.output)
        else:
            output_file = generate_output_filename(input_file, config.get_output_directory())
        
        if not args.force and config.get_skip_unchanged() and not should_process_file(input_file, processed_info):
            print(f"スキップ（未変更）: {input_file.name}")
            print("強制処理する場合は --force オプションを使用してください。")
            return
        
        success = convert_log_to_markdown(input_file, output_file)
        if success:
            processed_info[input_file.name] = {
                'mtime': input_file.stat().st_mtime,
                'output_file': str(output_file),
                'processed_at': datetime.now(timezone(timedelta(hours=9))).isoformat()
            }
            save_processed_files_info(info_file, processed_info)
        if not success:
            exit(1)
    else:
        # 自動検索・一括処理
        files = find_log_files(config.get_log_directory())
        if not files:
            print("JSONLファイルが見つかりませんでした。")
            exit(1)
        
        # 処理対象ファイル数の制限
        if not args.all:
            max_files = config.get_max_files()
            files = files[:max_files]
            print(f"最新{len(files)}件のファイルを処理対象にします。")
        
        # 強制処理モードの場合
        if args.force:
            processed_info = {}  # 処理済み情報をクリア
        
        success = process_multiple_files(files, config, processed_info, info_file)
        if not success:
            exit(1)


if __name__ == "__main__":
    main()