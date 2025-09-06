/**
 * メインアプリケーション
 * 全体の初期化と制御
 */

class ChatLogApp {
    constructor() {
        this.apiClient = window.apiClient;
        this.uiManager = window.uiManager;
        this.virtualScroller = null;
        
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
    
    async loadInitialData() {
        // 統計情報を読み込み
        await this.updateStats();
        
        // UIManagerはすでに初期化時にloadAllMessages()を呼び出すので、ここでは何もしない
        console.log('初期データ読み込み完了');
    }
    
    async updateStats() {
        try {
            const data = await this.apiClient.getStats();
            if (data.success) {
                const stats = data.stats;
                this.uiManager.elements.cacheStatus.textContent = 
                    `キャッシュ: ${stats.cached_files}ファイル (${stats.cache_size_mb.toFixed(1)}MB)`;
            }
        } catch (error) {
            console.warn('統計情報取得エラー:', error);
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
        // 30秒ごとに統計更新
        setInterval(() => {
            this.updateStats();
        }, 30000);
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