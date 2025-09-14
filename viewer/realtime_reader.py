#!/usr/bin/env python3
"""
リアルタイムJSONLファイル読み取り機能
ファイル監視・部分読み込み・WebSocket対応
"""
import json
import os
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Callable
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    Observer = None
    FileSystemEventHandler = None
    WATCHDOG_AVAILABLE = False
    print("警告: watchdogライブラリが利用できません。ファイル監視機能は無効です。")
import threading


class JSONLFileReader:
    """JSONLファイルの効率的読み取りクラス"""
    
    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)
        self.last_position = 0
        self.last_modified = 0
        self._file_size = 0
        
    def get_file_info(self) -> Dict[str, Any]:
        """ファイル基本情報を取得"""
        try:
            stat = self.file_path.stat()
            return {
                'path': str(self.file_path),
                'name': self.file_path.name,
                'size': stat.st_size,
                'modified': stat.st_mtime,
                'exists': True
            }
        except (OSError, FileNotFoundError):
            return {
                'path': str(self.file_path),
                'name': self.file_path.name,
                'size': 0,
                'modified': 0,
                'exists': False
            }
    
    def read_latest_messages(self, limit: int = 50) -> List[Dict[str, Any]]:
        """最新のメッセージを効率的に読み取り（末尾から）"""
        if not self.file_path.exists():
            return []
        
        try:
            file_size = self.file_path.stat().st_size
            if file_size == 0:
                return []
            
            # 大容量ファイルの場合は末尾から読む
            chunk_size = min(file_size, 1024 * 1024)  # 1MB単位
            
            with open(self.file_path, 'rb') as f:
                f.seek(max(0, file_size - chunk_size))
                
                # 最初の不完全な行をスキップ
                if file_size > chunk_size:
                    f.readline()
                
                lines = f.read().decode('utf-8').strip().split('\n')
            
            messages = []
            for line in reversed(lines):
                if line.strip() and len(messages) < limit:
                    parsed = self._parse_line(line)
                    if parsed:
                        messages.append(parsed)
            
            # タイムスタンプでソート（古い順）
            messages.reverse()
            return messages
            
        except Exception as e:
            print(f"ファイル読み取りエラー ({self.file_path}): {e}")
            return []
    
    def read_new_messages(self) -> List[Dict[str, Any]]:
        """前回読み取り後の新しいメッセージを取得"""
        if not self.file_path.exists():
            return []
        
        try:
            current_size = self.file_path.stat().st_size
            if current_size <= self.last_position:
                return []
            
            messages = []
            with open(self.file_path, 'r', encoding='utf-8') as f:
                f.seek(self.last_position)
                
                for line in f:
                    line = line.strip()
                    if line:
                        parsed = self._parse_line(line)
                        if parsed:
                            messages.append(parsed)
                
                self.last_position = f.tell()
            
            return messages
            
        except Exception as e:
            print(f"新規メッセージ読み取りエラー: {e}")
            return []
    
    def _parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        """JSONL行を解析してメッセージデータを抽出"""
        try:
            data = json.loads(line.strip())
            
            # 基本情報の抽出
            timestamp = data.get('timestamp', '')
            user_type = data.get('userType', data.get('type', ''))
            session_id = data.get('sessionId', '')
            
            # メッセージ内容の抽出
            message_data = data.get('message', {})
            role = message_data.get('role', user_type)
            content = self._extract_content(message_data)
            
            # ユーザーまたはアシスタントのメッセージのみ処理
            if role in ['user', 'assistant'] and content:
                content = self._clean_text(content)
                if content:
                    # UTCタイムスタンプをJSTに変換
                    jst_timestamp = self._convert_utc_to_jst(timestamp)
                    return {
                        'timestamp': jst_timestamp,
                        'role': role,
                        'content': content,
                        'session_id': session_id,
                        'raw_data': data  # デバッグ用
                    }
        
        except json.JSONDecodeError:
            pass
        except Exception as e:
            print(f"行解析エラー: {e}")
        
        return None
    
    def _extract_content(self, message: Dict[str, Any]) -> str:
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
        return str(message) if message else ""
    
    def _clean_text(self, text: str) -> str:
        """テキストをクリーンアップ"""
        if not text:
            return ""
        
        # コマンドメッセージの処理
        import re
        text = re.sub(r'<command-message>.*?</command-message>', '', text, flags=re.DOTALL)
        text = re.sub(r'<command-name>.*?</command-name>', '', text, flags=re.DOTALL)
        text = re.sub(r'<command-args>.*?</command-args>', '', text, flags=re.DOTALL)
        
        # システムリマインダーの処理
        text = re.sub(r'<system-reminder>.*?</system-reminder>', '', text, flags=re.DOTALL)
        
        # 空行の整理
        text = re.sub(r'\n\s*\n\s*\n', '\n\n', text)
        text = text.strip()
        
        return text
    
    def _convert_utc_to_jst(self, timestamp_str: str) -> str:
        """UTCタイムスタンプをJST形式に変換"""
        try:
            # UTC時刻をパース
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            
            # JSTに変換（UTC+9）
            jst = timezone(timedelta(hours=9))
            dt_jst = dt.astimezone(jst)
            
            # SQLiteで使いやすい形式で返す
            return dt_jst.strftime('%Y-%m-%d %H:%M:%S')
        except:
            # パースできない場合は現在時刻を返す
            return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


class RealtimeFileMonitor:
    """リアルタイムファイル監視クラス"""
    
    def __init__(self, watch_directory: Path, callback: Callable = None):
        self.watch_directory = Path(watch_directory)
        self.callback = callback
        self.observer = Observer() if WATCHDOG_AVAILABLE else None
        self.is_monitoring = False
        self.readers = {}  # file_path -> JSONLFileReader
        
    def start_monitoring(self):
        """監視を開始"""
        if self.is_monitoring:
            return
            
        if not WATCHDOG_AVAILABLE:
            print("ファイル監視: watchdogライブラリが無効のため監視を開始できません")
            return
        
        try:
            event_handler = FileChangeHandler(self.callback)
            self.observer.schedule(event_handler, str(self.watch_directory), recursive=True)
            self.observer.start()
            self.is_monitoring = True
            print(f"ファイル監視開始: {self.watch_directory}")
        except Exception as e:
            print(f"ファイル監視開始エラー: {e}")
            print("ファイル監視なしでリアルタイム機能を続行します")
    
    def stop_monitoring(self):
        """監視を停止"""
        if self.is_monitoring and self.observer:
            try:
                self.observer.stop()
                self.observer.join()
                self.is_monitoring = False
                print("ファイル監視停止")
            except Exception as e:
                print(f"ファイル監視停止エラー: {e}")
    
    def get_jsonl_files(self) -> List[Dict[str, Any]]:
        """監視ディレクトリ内のJSONLファイル一覧を取得"""
        if not self.watch_directory.exists():
            return []
        
        files = []
        for jsonl_file in self.watch_directory.rglob('*.jsonl'):
            reader = JSONLFileReader(jsonl_file)
            info = reader.get_file_info()
            if info['exists']:
                files.append(info)
        
        # 更新日時でソート（新しい順）
        files.sort(key=lambda x: x['modified'], reverse=True)
        return files
    
    def get_reader(self, file_path: Path) -> JSONLFileReader:
        """ファイルリーダーを取得（キャッシュあり）"""
        file_key = str(file_path)
        if file_key not in self.readers:
            self.readers[file_key] = JSONLFileReader(file_path)
        return self.readers[file_key]


# FileSystemEventHandlerが利用できる場合とできない場合の代替クラス
if WATCHDOG_AVAILABLE and FileSystemEventHandler:
    class FileChangeHandler(FileSystemEventHandler):
        """ファイル変更イベントハンドラー（watchdog使用）"""
        
        def __init__(self, callback: Callable = None):
            super().__init__()
            self.callback = callback
            self.last_modified = {}
            
        def on_modified(self, event):
            """ファイル変更時の処理"""
            if event.is_directory or not event.src_path.endswith('.jsonl'):
                return
            
            # 重複イベントを防ぐ
            current_time = time.time()
            if event.src_path in self.last_modified:
                if current_time - self.last_modified[event.src_path] < 1.0:  # 1秒以内は無視
                    return
            
            self.last_modified[event.src_path] = current_time
            
            if self.callback:
                try:
                    self.callback(event.src_path, 'modified')
                except Exception as e:
                    print(f"コールバックエラー: {e}")
else:
    class FileChangeHandler:
        """ファイル変更イベントハンドラー（watchdog無効時）"""
        
        def __init__(self, callback: Callable = None):
            self.callback = callback
            self.last_modified = {}
            print("ファイル変更イベントハンドラー: watchdog無効モードで初期化")


class RealtimeManager:
    """リアルタイムビューワー管理クラス"""
    
    def __init__(self, claude_projects_dir: Path = None):
        if claude_projects_dir is None:
            claude_projects_dir = Path.home() / '.claude' / 'projects'
        
        self.claude_projects_dir = Path(claude_projects_dir)
        self.monitor = RealtimeFileMonitor(self.claude_projects_dir, self._on_file_changed)
        self.change_callbacks = []  # WebSocket等への通知用
        
    def start(self):
        """リアルタイム監視を開始"""
        try:
            self.monitor.start_monitoring()
        except Exception as e:
            print(f"監視開始エラー: {e}")
            print("ファイル監視なしでリアルタイム機能を続行します")
        
    def stop(self):
        """リアルタイム監視を停止"""
        try:
            self.monitor.stop_monitoring()
        except Exception as e:
            print(f"監視停止エラー: {e}")
        
    def get_available_files(self) -> List[Dict[str, Any]]:
        """利用可能なJSONLファイル一覧を取得"""
        return self.monitor.get_jsonl_files()
    
    def get_latest_file(self) -> Optional[Dict[str, Any]]:
        """最新のJSONLファイルを取得"""
        files = self.get_available_files()
        return files[0] if files else None
    
    def read_file_messages(self, file_path: str, limit: int = 50, latest_only: bool = True) -> List[Dict[str, Any]]:
        """指定ファイルのメッセージを読み取り"""
        reader = self.monitor.get_reader(Path(file_path))
        
        if latest_only:
            return reader.read_latest_messages(limit)
        else:
            # TODO: 全メッセージ読み取り（ページング対応）
            return reader.read_latest_messages(limit)
    
    def add_change_callback(self, callback: Callable):
        """ファイル変更時のコールバックを追加"""
        self.change_callbacks.append(callback)
        
    def _on_file_changed(self, file_path: str, event_type: str):
        """ファイル変更時の内部処理"""
        print(f"ファイル変更検知: {file_path} ({event_type})")
        
        # 新しいメッセージを読み取り
        try:
            reader = self.monitor.get_reader(Path(file_path))
            new_messages = reader.read_new_messages()
            
            if new_messages:
                # 登録されたコールバックに通知
                for callback in self.change_callbacks:
                    try:
                        callback(file_path, new_messages)
                    except Exception as e:
                        print(f"コールバック実行エラー: {e}")
                        
        except Exception as e:
            print(f"ファイル変更処理エラー: {e}")


# 使用例とテスト用
if __name__ == "__main__":
    def test_callback(file_path: str, messages: List[Dict[str, Any]]):
        print(f"\n=== ファイル更新通知 ===")
        print(f"ファイル: {file_path}")
        print(f"新規メッセージ: {len(messages)}件")
        for msg in messages:
            timestamp = msg['timestamp'][:19]
            role = msg['role']
            content = msg['content'][:50] + '...' if len(msg['content']) > 50 else msg['content']
            print(f"  [{timestamp}] {role}: {content}")
    
    # テスト実行
    manager = RealtimeManager()
    manager.add_change_callback(test_callback)
    
    print("=== リアルタイム監視テスト ===")
    print(f"監視ディレクトリ: {manager.claude_projects_dir}")
    
    files = manager.get_available_files()
    print(f"\n利用可能ファイル: {len(files)}件")
    for i, file in enumerate(files[:5], 1):
        print(f"  {i}. {file['name']} ({file['size']:,} bytes, {datetime.fromtimestamp(file['modified']).strftime('%Y-%m-%d %H:%M:%S')})")
    
    if files:
        latest_file = files[0]
        print(f"\n最新ファイル: {latest_file['name']}")
        messages = manager.read_file_messages(latest_file['path'], limit=3)
        print(f"最新メッセージ: {len(messages)}件")
        for i, msg in enumerate(messages, 1):
            timestamp = msg['timestamp'][:19]
            role = msg['role']
            content = msg['content'][:100] + '...' if len(msg['content']) > 100 else msg['content']
            print(f"  {i}. [{timestamp}] {role}: {content}")
    
    print(f"\nファイル監視を開始します... (Ctrl+Cで停止)")
    try:
        manager.start()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n監視を停止します...")
        manager.stop()
        print("完了")