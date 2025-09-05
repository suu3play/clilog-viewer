#!/usr/bin/env python3
"""
会話ログをSQLiteデータベースに登録し、JSON形式で出力するスクリプト
"""
import json
import re
import sqlite3
import hashlib
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


class LogDatabase:
    """ログデータベース管理クラス"""
    def __init__(self, db_path='log_data.db'):
        self.db_path = Path(db_path)
        self.init_database()
    
    def init_database(self):
        """データベーススキーマを初期化"""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript('''
                -- 読み取りファイルテーブル
                CREATE TABLE IF NOT EXISTS log_files (
                    id INTEGER PRIMARY KEY,
                    filename TEXT UNIQUE NOT NULL,
                    file_path TEXT NOT NULL,
                    last_modified INTEGER NOT NULL,
                    file_hash TEXT NOT NULL,
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- 会話データテーブル
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY,
                    log_file_id INTEGER REFERENCES log_files(id),
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                    timestamp TEXT NOT NULL,
                    content TEXT NOT NULL,
                    filename TEXT NOT NULL
                );

                -- インデックス作成
                CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
                CREATE INDEX IF NOT EXISTS idx_conversations_role ON conversations(role);
                CREATE INDEX IF NOT EXISTS idx_conversations_filename ON conversations(filename);
                CREATE INDEX IF NOT EXISTS idx_log_files_modified ON log_files(last_modified);
            ''')
    
    def get_file_hash(self, file_path):
        """ファイルのハッシュ値を計算"""
        hasher = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()
    
    def is_file_changed(self, file_path):
        """ファイルが変更されているかチェック"""
        file_stat = file_path.stat()
        current_hash = self.get_file_hash(file_path)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('''
                SELECT file_hash, last_modified FROM log_files 
                WHERE file_path = ?
            ''', (str(file_path),))
            
            result = cursor.fetchone()
            if not result:
                return True  # 新しいファイル
            
            stored_hash, stored_mtime = result
            return current_hash != stored_hash or int(file_stat.st_mtime) != stored_mtime
    
    def register_file(self, file_path):
        """ファイルをデータベースに登録"""
        file_stat = file_path.stat()
        file_hash = self.get_file_hash(file_path)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute('''
                INSERT OR REPLACE INTO log_files 
                (filename, file_path, last_modified, file_hash)
                VALUES (?, ?, ?, ?)
            ''', (file_path.name, str(file_path), int(file_stat.st_mtime), file_hash))
            
            return cursor.lastrowid
    
    def clear_conversations_for_file(self, log_file_id):
        """特定ファイルの会話データを削除"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('DELETE FROM conversations WHERE log_file_id = ?', (log_file_id,))
    
    def insert_conversation(self, log_file_id, role, timestamp, content, filename):
        """会話データを登録"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT INTO conversations 
                (log_file_id, role, timestamp, content, filename)
                VALUES (?, ?, ?, ?, ?)
            ''', (log_file_id, role, timestamp, content, filename))
    
    def get_conversations_in_range(self, start_date=None, end_date=None):
        """指定された日付範囲の会話データを取得"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            if start_date and end_date:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations 
                    WHERE datetime(timestamp) BETWEEN datetime(?) AND datetime(?)
                    ORDER BY datetime(timestamp)
                ''', (start_date, end_date))
            elif start_date:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations 
                    WHERE datetime(timestamp) >= datetime(?)
                    ORDER BY datetime(timestamp)
                ''', (start_date,))
            elif end_date:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations 
                    WHERE datetime(timestamp) <= datetime(?)
                    ORDER BY datetime(timestamp)
                ''', (end_date,))
            else:
                cursor = conn.execute('''
                    SELECT role, timestamp, content, filename
                    FROM conversations 
                    ORDER BY datetime(timestamp)
                ''')
            
            return [dict(row) for row in cursor.fetchall()]


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
    """ログの1行を処理してユーザー/アシスタントメッセージのみを返す"""
    try:
        data = json.loads(line.strip())
        
        # 基本情報の抽出
        timestamp = data.get('timestamp', '')
        user_type = data.get('userType', data.get('type', ''))
        
        # メッセージ内容の抽出
        message_data = data.get('message', {})
        role = message_data.get('role', user_type)
        content = extract_content(message_data)
        
        # ユーザーまたはアシスタントのメッセージのみ処理
        if role in ['user', 'assistant'] and content:
            content = clean_text(content)
            if content:  # 空でない場合のみ返す
                return {
                    'timestamp': timestamp,  # ISO形式のまま保存
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


def process_log_file_to_database(file_path, database):
    """ログファイルを読み込んでデータベースに登録"""
    messages = []
    filename = file_path.name
    
    print(f"  → ファイルを読み込み中...")
    
    # ログファイルを読み込み
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            total_lines = len(lines)
            print(f"  → 総行数: {total_lines}行")
            
            for i, line in enumerate(lines, 1):
                if line.strip():
                    processed = process_log_line(line)
                    if processed:
                        messages.append(processed)
                
                # 100行ごとに進捗表示
                if i % 100 == 0 or i == total_lines:
                    found_messages = len(messages)
                    print(f"    進捗: {i}/{total_lines}行 ({i/total_lines*100:.1f}%) - 会話データ: {found_messages}件")
                    
    except FileNotFoundError:
        print(f"ファイルが見つかりません: {file_path}")
        return False
    except Exception as e:
        print(f"ファイル読み込みエラー: {e}")
        return False
    
    if not messages:
        print(f"  → 会話データが見つかりませんでした")
        return True  # エラーではない
    
    # データベースに登録
    try:
        print(f"  → データベースに登録中 ({len(messages)}件)")
        
        # ファイルを登録してIDを取得
        log_file_id = database.register_file(file_path)
        
        # 既存の会話データを削除
        database.clear_conversations_for_file(log_file_id)
        
        # 会話データを100件ずつ登録（トランザクションで高速化）
        import sqlite3
        with sqlite3.connect(database.db_path) as conn:
            batch_size = 100
            for i in range(0, len(messages), batch_size):
                batch = messages[i:i + batch_size]
                
                # バッチでINSERT
                conn.executemany('''
                    INSERT INTO conversations 
                    (log_file_id, role, timestamp, content, filename)
                    VALUES (?, ?, ?, ?, ?)
                ''', [(log_file_id, msg['role'], msg['timestamp'], msg['content'], filename) 
                      for msg in batch])
                
                # 進捗表示
                processed_count = min(i + batch_size, len(messages))
                print(f"    登録進捗: {processed_count}/{len(messages)}件 ({processed_count/len(messages)*100:.1f}%)")
        
        print(f"  ✓ 登録完了: {len(messages)}件の会話データ")
        return True
        
    except Exception as e:
        print(f"  → データベース登録エラー: {e}")
        return False


def export_conversations_to_json(database, output_file, start_date=None, end_date=None):
    """会話データをJSON形式で出力"""
    try:
        conversations = database.get_conversations_in_range(start_date, end_date)
        
        # JSON形式で出力
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(conversations, f, ensure_ascii=False, indent=2)
        
        print(f"JSON出力完了: {output_file}")
        print(f"出力した会話データ: {len(conversations)}件")
        return True
        
    except Exception as e:
        print(f"JSON出力エラー: {e}")
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


def find_log_files(log_directory=None, start_date=None, end_date=None):
    """Claudeプロジェクト配下のJSONLファイルを検索（ファイル更新日で絞り込み）"""
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
                file_stat = full_path.stat()
                file_modified = datetime.fromtimestamp(file_stat.st_mtime)
                
                # ファイル更新日による絞り込み
                if start_date and file_modified < start_date:
                    continue
                if end_date and file_modified > end_date:
                    continue
                    
                jsonl_files.append(full_path)
    
    # 更新日時でソート（新しい順）
    jsonl_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    return jsonl_files


def get_default_date_range():
    """デフォルトの日付範囲を取得（直近1ヶ月前後、開始は01日）"""
    now = datetime.now()
    
    # 今月の1日
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # 先月の1日
    if now.month == 1:
        last_month_start = current_month_start.replace(year=now.year-1, month=12)
    else:
        last_month_start = current_month_start.replace(month=now.month-1)
    
    # 来月の1日
    if now.month == 12:
        next_month_start = current_month_start.replace(year=now.year+1, month=1)
    else:
        next_month_start = current_month_start.replace(month=now.month+1)
    
    return last_month_start, next_month_start


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


def process_multiple_files_to_database(files, database):
    """複数ファイルをデータベースに一括処理"""
    processed_count = 0
    skipped_count = 0
    total_files = len(files)
    
    print(f"処理対象ファイル: {total_files}件")
    print("=" * 60)
    
    for i, file in enumerate(files, 1):
        print(f"\n[{i}/{total_files}] 処理中: {file.name}")
        
        # ファイルが変更されているかチェック
        if not database.is_file_changed(file):
            print(f"  → スキップ（未変更）")
            skipped_count += 1
            continue
        
        success = process_log_file_to_database(file, database)
        if success:
            processed_count += 1
        else:
            print(f"  ✗ エラー: {file.name} の処理に失敗")
        
        # ファイル処理完了の進捗表示
        progress = i / total_files * 100
        print(f"  📊 全体進捗: {i}/{total_files}ファイル ({progress:.1f}%)")
    
    print("\n" + "=" * 60)
    print(f"🎉 処理完了: {processed_count}件処理, {skipped_count}件スキップ")
    return processed_count > 0


def main():
    """メイン関数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='会話ログをSQLiteデータベースに登録・JSON出力')
    parser.add_argument('--output', '-o', help='JSON出力ファイル（デフォルト: conversations.json）')
    parser.add_argument('--list', action='store_true', help='データベース内の会話データを一覧表示')
    parser.add_argument('--config', help='設定ファイルパス')
    parser.add_argument('--force', action='store_true', help='全ファイル強制再処理')
    parser.add_argument('--start-date', help='開始日（YYYY-MM-DD形式、ファイル更新日基準）')
    parser.add_argument('--end-date', help='終了日（YYYY-MM-DD形式、ファイル更新日基準）')
    parser.add_argument('--json-start-date', help='JSON出力の開始日（YYYY-MM-DD形式、会話日時基準）')
    parser.add_argument('--json-end-date', help='JSON出力の終了日（YYYY-MM-DD形式、会話日時基準）')
    parser.add_argument('--db-path', help='データベースファイルパス（デフォルト: log_data.db）')
    
    args = parser.parse_args()
    
    # 設定読み込み
    config = Config(args.config or 'log_converter_config.ini')
    
    # データベース初期化
    database = LogDatabase(args.db_path or 'log_data.db')
    
    # データベース内容一覧表示モード
    if args.list:
        conversations = database.get_conversations_in_range()
        print(f"データベース内の会話データ: {len(conversations)}件")
        
        if conversations:
            print("\n最新10件:")
            for conv in conversations[-10:]:
                timestamp = conv['timestamp'][:19] if len(conv['timestamp']) > 19 else conv['timestamp']
                print(f"  {timestamp} [{conv['role']}] {conv['content'][:50]}...")
        return
    
    # 日付範囲の決定（ファイル更新日基準）
    start_date = None
    end_date = None
    
    if args.start_date or args.end_date:
        # コマンドライン引数指定
        if args.start_date:
            start_date = datetime.strptime(args.start_date, '%Y-%m-%d')
        if args.end_date:
            end_date = datetime.strptime(args.end_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        print(f"ファイル更新日フィルタ: {args.start_date or '開始日なし'} 〜 {args.end_date or '終了日なし'}")
    else:
        # デフォルト範囲（直近1ヶ月前後）
        start_date, end_date = get_default_date_range()
        print(f"デフォルト範囲を使用: {start_date.strftime('%Y-%m-%d')} 〜 {end_date.strftime('%Y-%m-%d')}")
    
    # ログファイルの検索・処理
    files = find_log_files(config.get_log_directory(), start_date, end_date)
    if not files:
        print("対象のJSONLファイルが見つかりませんでした。")
        exit(1)
    
    print(f"見つかったファイル: {len(files)}件")
    
    # 強制処理モードの場合、データベースをクリア
    if args.force:
        print("強制処理モード: データベースをクリアします")
        with sqlite3.connect(database.db_path) as conn:
            conn.execute('DELETE FROM conversations')
            conn.execute('DELETE FROM log_files')
    
    # ファイルをデータベースに処理
    success = process_multiple_files_to_database(files, database)
    if not success:
        print("ファイル処理に失敗しました。")
        exit(1)
    
    # JSON出力
    output_file = args.output or 'conversations.json'
    json_start = args.json_start_date
    json_end = args.json_end_date
    
    if json_start or json_end:
        print(f"JSON出力（会話日時フィルタ）: {json_start or '開始日なし'} 〜 {json_end or '終了日なし'}")
    
    success = export_conversations_to_json(database, output_file, json_start, json_end)
    if not success:
        exit(1)


if __name__ == "__main__":
    main()