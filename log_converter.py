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
import getpass


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


def parse_message_date(timestamp_str):
    """メッセージの日付を解析してdatetimeオブジェクトを返す"""
    try:
        # UTC時刻をパース
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return dt
    except:
        return None


class DateFilter:
    """日付範囲フィルタクラス"""
    def __init__(self, start_date=None, end_date=None):
        self.start_date = self._parse_date(start_date) if start_date else None
        self.end_date = self._parse_date(end_date) if end_date else None
        
        # 終了日は23:59:59まで含める
        if self.end_date:
            self.end_date = self.end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    def _parse_date(self, date_str):
        """日付文字列をdatetimeに変換（YYYY-MM-DD形式）"""
        try:
            if isinstance(date_str, str):
                # YYYY-MM-DD形式を想定
                dt = datetime.strptime(date_str, '%Y-%m-%d')
                # UTCタイムゾーンを設定
                return dt.replace(tzinfo=timezone.utc)
            elif isinstance(date_str, datetime):
                return date_str
            else:
                return None
        except ValueError:
            print(f"警告: 日付形式が無効です: {date_str}")
            return None
    
    def is_in_range(self, message_date):
        """メッセージ日付が範囲内かチェック"""
        if not isinstance(message_date, datetime):
            return True  # 日付が不明な場合は含める
        
        # 開始日のチェック
        if self.start_date and message_date < self.start_date:
            return False
        
        # 終了日のチェック
        if self.end_date and message_date > self.end_date:
            return False
        
        return True
    
    def is_active(self):
        """フィルタが有効かどうか"""
        return self.start_date is not None or self.end_date is not None


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


def process_log_line(line, date_filter=None):
    """ログの1行を処理"""
    try:
        data = json.loads(line.strip())
        
        # 基本情報の抽出
        timestamp = data.get('timestamp', '')
        user_type = data.get('userType', data.get('type', ''))
        
        # 日付フィルタリング
        if date_filter and timestamp:
            message_date = parse_message_date(timestamp)
            if message_date and not date_filter.is_in_range(message_date):
                return None
        
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


def generate_output_filename(input_file, output_directory, username=None):
    """出力ファイル名を生成（ユーザー名_日付形式）"""
    # ファイルの更新時刻を取得（UTC）
    mod_time_utc = datetime.fromtimestamp(input_file.stat().st_mtime, tz=timezone.utc)
    
    # JSTに変換
    jst = timezone(timedelta(hours=9))
    mod_time_jst = mod_time_utc.astimezone(jst)
    
    # ユーザー名を取得（指定されていない場合は端末ユーザー名）
    if username is None:
        try:
            username = getpass.getuser()
        except Exception:
            username = "unknown"
    
    timestamp = mod_time_jst.strftime('%Y%m%d%H%M%S')
    filename = f"log_{username}_{timestamp}_{input_file.stem}.md"
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


def convert_log_to_markdown(input_file, output_file=None, date_filter=None):
    """ログファイルをMarkdownに変換"""
    if output_file is None:
        output_file = Path(input_file).with_suffix('.md')
    
    messages = []
    
    # ログファイルを読み込み
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    processed = process_log_line(line, date_filter)
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
    
    # 出力ディレクトリが存在しない場合は作成
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
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
            'username': '',  # 空の場合は端末ユーザー名
            'max_files': '10',
            'skip_unchanged': 'true',
            'date_start': '',  # 開始日（YYYY-MM-DD）
            'date_end': ''     # 終了日（YYYY-MM-DD）
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
    
    def get_username(self):
        """ユーザー名設定を取得"""
        username = self.config.get('DEFAULT', 'username', fallback='')
        if username:
            return username
        try:
            return getpass.getuser()
        except Exception:
            return "unknown"
    
    def get_date_filter(self):
        """日付フィルタ設定を取得"""
        start_date = self.config.get('DEFAULT', 'date_start', fallback='')
        end_date = self.config.get('DEFAULT', 'date_end', fallback='')
        
        if start_date or end_date:
            return DateFilter(start_date or None, end_date or None)
        return None
    
    def set_date_range(self, start_date, end_date):
        """日付範囲を設定"""
        self.config.set('DEFAULT', 'date_start', start_date or '')
        self.config.set('DEFAULT', 'date_end', end_date or '')
        self.save_config()


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


def process_multiple_files(files, config, processed_info, info_file, username=None, date_filter=None):
    """複数ファイルを一括処理"""
    processed_count = 0
    skipped_count = 0
    filtered_count = 0
    
    output_directory = config.get_output_directory()
    skip_unchanged = config.get_skip_unchanged()
    
    # ユーザー名が指定されていない場合は設定から取得
    if username is None:
        username = config.get_username()
    
    # 日付フィルタが指定されていない場合は設定から取得
    if date_filter is None:
        date_filter = config.get_date_filter()
    
    for file in files:
        if skip_unchanged and not should_process_file(file, processed_info):
            print(f"スキップ（未変更）: {file.name}")
            skipped_count += 1
            continue
        
        output_file = generate_output_filename(file, output_directory, username)
        
        # 日付フィルタが設定されている場合の表示
        if date_filter and date_filter.is_active():
            print(f"処理中（日付フィルタ適用）: {file.name} → {output_file.name}")
        else:
            print(f"処理中: {file.name} → {output_file.name}")
        
        success = convert_log_to_markdown(file, output_file, date_filter)
        if success:
            # 出力ファイルが空でないかチェック
            if output_file.exists() and output_file.stat().st_size > 100:  # ヘッダーのみでないかチェック
                # 処理済み情報を更新
                processed_info[file.name] = {
                    'mtime': file.stat().st_mtime,
                    'output_file': str(output_file),
                    'processed_at': datetime.now(timezone(timedelta(hours=9))).isoformat(),
                    'date_filter': f"{date_filter.start_date}~{date_filter.end_date}" if date_filter and date_filter.is_active() else None
                }
                processed_count += 1
            else:
                print(f"  → 日付フィルタにより除外されました")
                filtered_count += 1
                # 空のファイルは削除
                if output_file.exists():
                    output_file.unlink()
        else:
            print(f"エラー: {file.name} の処理に失敗")
    
    # 処理済み情報を保存
    save_processed_files_info(info_file, processed_info)
    
    if date_filter and date_filter.is_active():
        print(f"\n処理完了: {processed_count}件, スキップ: {skipped_count}件, フィルタ除外: {filtered_count}件")
    else:
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
    parser.add_argument('--username', '-u', help='出力ファイル名に使用するユーザー名')
    parser.add_argument('--start-date', help='開始日（YYYY-MM-DD形式）')
    parser.add_argument('--end-date', help='終了日（YYYY-MM-DD形式）')
    parser.add_argument('--set-date-range', action='store_true', help='日付範囲を設定ファイルに保存')
    
    args = parser.parse_args()
    
    # 設定読み込み
    config = Config(args.config or 'log_converter_config.ini')
    
    # 日付範囲設定の保存
    if args.set_date_range:
        start_date = args.start_date or ''
        end_date = args.end_date or ''
        config.set_date_range(start_date, end_date)
        print(f"日付範囲を設定しました: {start_date} 〜 {end_date}")
        return
    
    # 日付フィルタの作成
    date_filter = None
    if args.start_date or args.end_date:
        # コマンドライン引数から日付フィルタ作成
        date_filter = DateFilter(args.start_date, args.end_date)
        print(f"日付フィルタ: {args.start_date or '開始日なし'} 〜 {args.end_date or '終了日なし'}")
    else:
        # 設定ファイルから日付フィルタ取得
        date_filter = config.get_date_filter()
        if date_filter and date_filter.is_active():
            start_str = date_filter.start_date.strftime('%Y-%m-%d') if date_filter.start_date else '開始日なし'
            end_str = date_filter.end_date.strftime('%Y-%m-%d') if date_filter.end_date else '終了日なし'
            print(f"設定ファイルの日付フィルタを使用: {start_str} 〜 {end_str}")
    
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
        username = args.username or config.get_username()
        if args.output:
            output_file = Path(args.output)
        else:
            output_file = generate_output_filename(input_file, config.get_output_directory(), username)
        
        if not args.force and config.get_skip_unchanged() and not should_process_file(input_file, processed_info):
            print(f"スキップ（未変更）: {input_file.name}")
            print("強制処理する場合は --force オプションを使用してください。")
            return
        
        success = convert_log_to_markdown(input_file, output_file, date_filter)
        if success:
            processed_info[input_file.name] = {
                'mtime': input_file.stat().st_mtime,
                'output_file': str(output_file),
                'processed_at': datetime.now(timezone(timedelta(hours=9))).isoformat(),
                'date_filter': f"{date_filter.start_date}~{date_filter.end_date}" if date_filter and date_filter.is_active() else None
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
        
        success = process_multiple_files(files, config, processed_info, info_file, args.username, date_filter)
        if not success:
            exit(1)


if __name__ == "__main__":
    main()