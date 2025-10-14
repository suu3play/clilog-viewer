/**
 * メインアプリケーション
 * 全体の初期化と制御
 */

class ChatLogApp {
    constructor() {
        this.apiClient = window.apiClient;
        this.uiManager = window.uiManager;
        this.virtualScroller = null;
        this.statsUpdateInProgress = false;
        this.statsUpdateTimer = null;

        this.init();
    }
    
    async init() {
        console.log('CliLog Viewer 起動中...');

        try {
            // API進捗表示を設定
            this.apiClient.onProgress(({ message, percent }) => {
                if (message) {
                    console.log('API Progress:', message);
                }
                if (percent !== null) {
                    this.updateProgressBar(percent);
                }
            });

            // 設定を読み込んで初期表示モードを決定
            await this.loadConfigAndInitializeMode();

            // 初期データ読み込み
            await this.loadInitialData();

            // 定期的な統計更新
            this.startStatsUpdateTimer();

            console.log('アプリケーション初期化完了');

        } catch (error) {
            console.error('アプリケーション初期化エラー:', error);
            this.uiManager.showNotification('アプリケーションの初期化に失敗しました', 'error');
        }
    }

    async loadConfigAndInitializeMode() {
        try {
            const response = await fetch('/api/config');
            const data = await response.json();

            if (data.success && data.config) {
                const defaultMode = data.config.default_display_mode || 'database';
                console.log(`設定から初期表示モード取得: ${defaultMode}`);

                // リアルタイムクライアントが存在する場合、初期モードを設定
                if (window.realtimeClient) {
                    window.realtimeClient.switchMode(defaultMode);
                }
            } else {
                console.warn('設定の取得に失敗、デフォルトモード(database)を使用');
                if (window.realtimeClient) {
                    window.realtimeClient.switchMode('database');
                }
            }
        } catch (error) {
            console.error('設定読み込みエラー:', error);
            // エラー時はデフォルトモード(database)を使用
            if (window.realtimeClient) {
                window.realtimeClient.switchMode('database');
            }
        }
    }
    
    async loadInitialData() {
        // 統計情報を読み込み
        await this.updateStats();
        
        // UIManagerはすでに初期化時にloadAllMessages()を呼び出すので、ここでは何もしない
        console.log('初期データ読み込み完了');
    }
    
    async updateStats() {
        // 重複実行を防止
        if (this.statsUpdateInProgress) {
            console.log('統計更新が既に進行中のためスキップ');
            return;
        }

        this.statsUpdateInProgress = true;

        try {
            console.log('統計情報更新開始');
            const data = await this.apiClient.getStats();

            if (data && data.success && data.stats) {
                const stats = data.stats;

                // UI要素が存在する場合のみ更新
                if (this.uiManager && this.uiManager.elements && this.uiManager.elements.cacheStatus) {
                    this.uiManager.elements.cacheStatus.textContent =
                        `キャッシュ: ${stats.cached_files}ファイル (${stats.cache_size_mb.toFixed(1)}MB)`;
                    console.log(`統計更新成功: ${stats.cached_files}ファイル, ${stats.total_messages}メッセージ`);
                } else {
                    console.warn('UI要素が見つからないため統計表示をスキップ');
                }
            } else {
                console.warn('統計情報の取得に失敗または無効なレスポンス:', data);

                // エラー時はUI表示も更新
                if (this.uiManager && this.uiManager.elements && this.uiManager.elements.cacheStatus) {
                    this.uiManager.elements.cacheStatus.textContent = 'キャッシュ: 取得失敗';
                }
            }
        } catch (error) {
            console.error('統計情報取得エラー:', error);

            // エラー表示をUIに反映
            if (this.uiManager && this.uiManager.elements && this.uiManager.elements.cacheStatus) {
                this.uiManager.elements.cacheStatus.textContent = 'キャッシュ: エラー';
            }

            // 通知がある場合は表示
            if (this.uiManager && typeof this.uiManager.showNotification === 'function') {
                this.uiManager.showNotification('統計情報の取得に失敗しました', 'warning');
            }
        } finally {
            this.statsUpdateInProgress = false;
        }
    }
    
    updateProgressBar(percent) {
        // プログレスバーがある場合の処理
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }
    
    startStatsUpdateTimer() {
        // 既存のタイマーがあればクリア
        if (this.statsUpdateTimer) {
            clearInterval(this.statsUpdateTimer);
        }

        // 30秒ごとに統計更新
        this.statsUpdateTimer = setInterval(() => {
            console.log('定期統計更新実行');
            this.updateStats();
        }, 30000);

        console.log('統計更新タイマー開始（30秒間隔）');
    }

    stopStatsUpdateTimer() {
        if (this.statsUpdateTimer) {
            clearInterval(this.statsUpdateTimer);
            this.statsUpdateTimer = null;
            console.log('統計更新タイマー停止');
        }
    }
    
    // エラー処理
    handleError(error, context = '') {
        console.error(`エラー[${context}]:`, error);
        
        let message = 'エラーが発生しました';
        if (context) message += ` (${context})`;
        if (error.message) message += `: ${error.message}`;
        
        this.uiManager.showNotification(message, 'error');
    }
    
    // デバッグ用メソッド
    debug() {
        return {
            state: this.uiManager.state,
            cache: this.apiClient.cache,
            version: '1.0.0'
        };
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatLogApp();
});

// Service Worker登録（PWA対応）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js')
            .then(registration => {
                console.log('Service Worker 登録成功:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker 登録失敗:', error);
            });
    });
}

// グローバルエラーハンドラー
window.addEventListener('error', (event) => {
    console.error('グローバルエラー:', event.error);
    if (window.app) {
        window.app.handleError(event.error, 'Global');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未処理のPromise拒否:', event.reason);
    if (window.app) {
        window.app.handleError(event.reason, 'Promise');
    }
});