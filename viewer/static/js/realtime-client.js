/**
 * リアルタイムビューワー クライアント
 * WebSocket通信とリアルタイムUI制御
 */

class RealtimeClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentMode = 'database';  // 'database' or 'realtime'
        this.selectedFile = null;
        this.autoScroll = true;
        this.files = [];
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // UI要素の取得
        this.elements = {
            // モード切り替え
            dbModeBtn: document.getElementById('dbModeBtn'),
            realtimeModeBtn: document.getElementById('realtimeModeBtn'),
            
            // ファイル選択
            fileSelector: document.getElementById('fileSelector'),
            fileDropdown: document.getElementById('fileDropdown'),
            refreshFilesBtn: document.getElementById('refreshFilesBtn'),
            
            // 接続ステータス
            connectionStatus: document.getElementById('connectionStatus'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),
            
            // 検索・フィルタ
            dateSearchContainer: document.getElementById('dateSearchContainer'),
            
            // メッセージ表示
            messageArea: document.getElementById('messageArea')
        };
    }

    bindEvents() {
        // モード切り替え
        this.elements.dbModeBtn?.addEventListener('click', () => this.switchMode('database'));
        this.elements.realtimeModeBtn?.addEventListener('click', () => this.switchMode('realtime'));
        
        // ファイル操作
        this.elements.fileDropdown?.addEventListener('change', (e) => this.selectFile(e.target.value));
        this.elements.refreshFilesBtn?.addEventListener('click', () => this.refreshFileList());
    }

    switchMode(mode) {
        console.log(`モード切り替え: ${this.currentMode} → ${mode}`);
        
        this.currentMode = mode;
        
        // UI状態の更新
        this.updateModeUI();
        
        if (mode === 'realtime') {
            this.initializeRealtimeMode();
        } else {
            this.initializeDatabaseMode();
        }
    }

    updateModeUI() {
        // ボタンのアクティブ状態
        this.elements.dbModeBtn?.classList.toggle('active', this.currentMode === 'database');
        this.elements.realtimeModeBtn?.classList.toggle('active', this.currentMode === 'realtime');
        
        // UI要素の表示/非表示
        if (this.currentMode === 'realtime') {
            this.elements.fileSelector?.classList.remove('hidden');
            this.elements.dateSearchContainer?.classList.add('hidden');

            // ポーリング制御も表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.remove('hidden');
        } else {
            this.elements.fileSelector?.classList.add('hidden');
            this.elements.dateSearchContainer?.classList.remove('hidden');

            // ポーリング制御を非表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.add('hidden');

            // ポーリングが動作中なら停止
            if (window.pollingClient && window.pollingClient.isPollingActive()) {
                window.pollingClient.stopPolling();
                const pollingToggle = document.getElementById('pollingToggle');
                if (pollingToggle) pollingToggle.checked = false;
            }
        }
        
        // メッセージエリアをクリア
        this.clearMessages();
    }

    async initializeRealtimeMode() {
        console.log('リアルタイムモード初期化開始');
        
        try {
            // WebSocket接続
            await this.connectWebSocket();
            
            // ファイル一覧取得
            await this.refreshFileList();
            
            // 最新ファイルを自動選択
            await this.loadLatestFile();
            
        } catch (error) {
            console.error('リアルタイムモード初期化エラー:', error);
            this.updateStatus('エラー', 'error');
            this.showNotification('リアルタイムモード初期化に失敗しました', 'error');
        }
    }

    async initializeDatabaseMode() {
        console.log('データベースモード初期化');
        
        // WebSocket切断
        this.disconnectWebSocket();
        
        // 既存のデータベース機能を再有効化
        this.updateStatus('データベースモード', 'success');
        
        // 元のUI機能を復元
        if (window.app && typeof window.app.init === 'function') {
            window.app.init();
        }
    }

    async connectWebSocket() {
        if (this.socket && this.isConnected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                // Socket.IOクライアント接続
                this.socket = io({
                    transports: ['websocket', 'polling']
                });

                // 接続成功
                this.socket.on('connect', () => {
                    console.log('WebSocket接続成功');
                    this.isConnected = true;
                    this.updateStatus('接続済み', 'success');
                    resolve();
                });

                // 接続エラー
                this.socket.on('connect_error', (error) => {
                    console.error('WebSocket接続エラー:', error);
                    this.isConnected = false;
                    this.updateStatus('接続エラー', 'error');
                    reject(error);
                });

                // 切断
                this.socket.on('disconnect', () => {
                    console.log('WebSocket切断');
                    this.isConnected = false;
                    this.updateStatus('切断', 'warning');
                });

                // ファイル更新通知
                this.socket.on('file_update', (data) => {
                    this.handleFileUpdate(data);
                });

                // サーバーからの通知
                this.socket.on('connected', (data) => {
                    console.log('サーバー通知:', data);
                });

                // エラー通知
                this.socket.on('error', (data) => {
                    console.error('サーバーエラー:', data);
                    this.showNotification(data.message || 'サーバーエラーが発生しました', 'error');
                });

                // 接続タイムアウト設定
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('接続タイムアウト'));
                    }
                }, 5000);

            } catch (error) {
                console.error('WebSocket初期化エラー:', error);
                reject(error);
            }
        });
    }

    disconnectWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.updateStatus('未接続', 'default');
        }
    }

    async refreshFileList() {
        console.log('ファイル一覧更新中...');
        this.updateStatus('読み込み中...', 'loading');

        try {
            const response = await fetch('/api/realtime/files');
            const data = await response.json();

            if (data.success) {
                this.files = data.files;
                this.populateFileDropdown();
                this.updateStatus(`${data.files.length}件のファイル`, 'success');
                console.log(`${data.files.length}件のファイルを取得`);
            } else {
                throw new Error(data.error || 'ファイル一覧の取得に失敗');
            }

        } catch (error) {
            console.error('ファイル一覧取得エラー:', error);
            this.updateStatus('ファイル取得エラー', 'error');
            this.showNotification('ファイル一覧の取得に失敗しました', 'error');
        }
    }

    populateFileDropdown() {
        if (!this.elements.fileDropdown) return;

        // ドロップダウンをクリア
        this.elements.fileDropdown.innerHTML = '<option value="">ファイルを選択...</option>';

        // ファイルオプションを追加
        this.files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.name;
            option.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
            option.title = file.display_path || file.path;
            this.elements.fileDropdown.appendChild(option);
        });
    }

    async loadLatestFile() {
        try {
            const response = await fetch('/api/realtime/latest?limit=30');
            const data = await response.json();

            if (data.success && data.file_info) {
                this.selectedFile = data.file_info;
                this.elements.fileDropdown.value = data.file_info.name;
                this.displayMessages(data.messages);
                
                console.log(`最新ファイル読み込み完了: ${data.file_info.name} (${data.messages.length}件)`);
                this.updateStatus(`最新: ${data.file_info.name}`, 'success');
            } else {
                throw new Error(data.error || '最新ファイルの読み込みに失敗');
            }

        } catch (error) {
            console.error('最新ファイル読み込みエラー:', error);
            this.showNotification('最新ファイルの読み込みに失敗しました', 'error');
        }
    }

    async selectFile(fileName) {
        if (!fileName) return;

        console.log(`ファイル選択: ${fileName}`);
        this.updateStatus('読み込み中...', 'loading');

        try {
            const response = await fetch(`/api/realtime/messages/${encodeURIComponent(fileName)}?limit=50`);
            const data = await response.json();

            if (data.success) {
                this.selectedFile = data.file_info;
                this.displayMessages(data.messages);
                
                console.log(`ファイル読み込み完了: ${fileName} (${data.messages.length}件)`);
                this.updateStatus(`読み込み完了: ${fileName}`, 'success');
                
                // WebSocketでファイル購読
                if (this.socket && this.isConnected) {
                    this.socket.emit('subscribe_file', { file_path: this.selectedFile.path });
                }
            } else {
                throw new Error(data.error || 'ファイルの読み込みに失敗');
            }

        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            this.updateStatus('読み込みエラー', 'error');
            this.showNotification(`ファイル読み込みに失敗: ${error.message}`, 'error');
        }
    }

    displayMessages(messages) {
        if (!this.elements.messageArea) return;

        // メッセージをクリア
        this.clearMessages();

        if (!messages || messages.length === 0) {
            this.elements.messageArea.innerHTML = `
                <div class="welcome-message">
                    <h2>メッセージがありません</h2>
                    <p>選択されたファイルにはメッセージが含まれていません。</p>
                </div>
            `;
            return;
        }

        // メッセージコンテナを作成
        const container = document.createElement('div');
        container.className = 'messages-container';

        messages.forEach(msg => {
            const messageElement = this.createMessageElement(msg);
            container.appendChild(messageElement);
        });

        this.elements.messageArea.appendChild(container);

        // 自動スクロール
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message message-${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleString('ja-JP');
        
        div.innerHTML = `
            <div class="message-header">
                <span class="role">${message.role === 'user' ? 'ユーザー' : 'アシスタント'}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content">
                ${this.formatMessageContent(message.content)}
            </div>
        `;

        return div;
    }

    formatMessageContent(content) {
        // Markdownライクな基本的なフォーマッティング
        content = content
            .replace(/```json\n([\s\S]*?)\n```/g, '<pre class="code-block json"><code>$1</code></pre>')
            .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        return content;
    }

    handleFileUpdate(data) {
        console.log('ファイル更新通知:', data);

        if (!this.selectedFile || data.file_path !== this.selectedFile.path) {
            return; // 現在選択中のファイルではない
        }

        // 新しいメッセージを追加
        if (data.messages && data.messages.length > 0) {
            this.appendMessages(data.messages);
            this.showNotification(`新しいメッセージ: ${data.messages.length}件`, 'info');
        }
    }

    appendMessages(messages) {
        const container = this.elements.messageArea.querySelector('.messages-container');
        if (!container) return;

        messages.forEach(msg => {
            const messageElement = this.createMessageElement(msg);
            container.appendChild(messageElement);
        });

        // 自動スクロール
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    clearMessages() {
        if (this.elements.messageArea) {
            this.elements.messageArea.innerHTML = '';
        }
    }

    scrollToBottom() {
        if (this.elements.messageArea) {
            this.elements.messageArea.scrollTop = this.elements.messageArea.scrollHeight;
        }
    }

    updateStatus(text, type = 'default') {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        this.elements.statusText.textContent = text;
        
        // ステータスインジケーターの色を更新
        this.elements.statusIndicator.className = `status-indicator status-${type}`;
    }

    showNotification(message, type = 'info') {
        // UIManagerの通知機能を使用
        if (window.uiManager && typeof window.uiManager.showNotification === 'function') {
            window.uiManager.showNotification(message, type);
        } else {
            console.log(`通知 [${type}]: ${message}`);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 公開メソッド
    getCurrentMode() {
        return this.currentMode;
    }

    isRealtimeMode() {
        return this.currentMode === 'realtime';
    }

    getSelectedFile() {
        return this.selectedFile;
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        console.log(`自動スクロール: ${this.autoScroll ? 'ON' : 'OFF'}`);
        return this.autoScroll;
    }
}

// グローバルインスタンス
window.realtimeClient = new RealtimeClient();