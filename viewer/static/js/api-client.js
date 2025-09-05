/**
 * APIクライアント
 * Flask バックエンドとの通信処理
 */

class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.cache = new Map();
        this.abortController = null;
    }
    
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}/api${endpoint}`;
        
        // 進行中のリクエストをキャンセル
        if (this.abortController) {
            this.abortController.abort();
        }
        
        this.abortController = new AbortController();
        
        const config = {
            signal: this.abortController.signal,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };
        
        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Network error' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('リクエストがキャンセルされました');
            }
            throw error;
        } finally {
            this.abortController = null;
        }
    }
    
    async getFiles() {
        const cacheKey = 'files';
        
        try {
            const data = await this.request('/files');
            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            // キャッシュフォールバック
            if (this.cache.has(cacheKey)) {
                console.warn('ファイル一覧取得に失敗、キャッシュを使用:', error.message);
                return this.cache.get(cacheKey);
            }
            throw error;
        }
    }
    
    async getMessages(filename, page = 1, perPage = 50) {
        const cacheKey = `messages_${filename}_${page}_${perPage}`;
        
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                per_page: perPage.toString()
            });
            
            const data = await this.request(`/messages/${encodeURIComponent(filename)}?${params}`);
            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            if (this.cache.has(cacheKey)) {
                console.warn('メッセージ取得に失敗、キャッシュを使用:', error.message);
                return this.cache.get(cacheKey);
            }
            throw error;
        }
    }
    
    async searchMessages(query, options = {}) {
        const { file, limit = 100 } = options;
        
        const params = new URLSearchParams({
            q: query,
            limit: limit.toString()
        });
        
        if (file) {
            params.append('file', file);
        }
        
        return await this.request(`/search?${params}`);
    }

    async searchByDateRange(startDate, endDate, limit = 1000) {
        const params = new URLSearchParams({ 
            start_date: startDate, 
            end_date: endDate, 
            limit: limit.toString()
        });
        
        return await this.request(`/search/date-range?${params}`);
    }
    
    async buildCache() {
        return await this.request('/cache/build', {
            method: 'POST'
        });
    }
    
    async clearCache(filename = null) {
        const body = filename ? { file: filename } : {};
        
        return await this.request('/cache/clear', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }
    
    async getStats() {
        return await this.request('/stats');
    }
    
    clearCache() {
        this.cache.clear();
    }
}

// 進捗表示付きAPIクライアント
class ProgressApiClient extends ApiClient {
    constructor(baseUrl = '') {
        super(baseUrl);
        this.progressCallbacks = [];
    }
    
    onProgress(callback) {
        this.progressCallbacks.push(callback);
    }
    
    offProgress(callback) {
        this.progressCallbacks = this.progressCallbacks.filter(cb => cb !== callback);
    }
    
    notifyProgress(message, percent = null) {
        this.progressCallbacks.forEach(callback => {
            callback({ message, percent });
        });
    }
    
    async getMessages(filename, options = {}) {
        this.notifyProgress('メッセージを読み込み中...', 0);
        
        try {
            const startTime = Date.now();
            const data = await super.getMessages(filename, options);
            const loadTime = Date.now() - startTime;
            
            this.notifyProgress(`読み込み完了: ${data.total}メッセージ (${loadTime}ms)`, 100);
            
            return data;
        } catch (error) {
            this.notifyProgress('読み込みに失敗しました', 0);
            throw error;
        }
    }
    
    async searchMessages(query, options = {}) {
        this.notifyProgress('検索中...', 0);
        
        try {
            const startTime = Date.now();
            const data = await super.searchMessages(query, options);
            const searchTime = Date.now() - startTime;
            
            this.notifyProgress(`検索完了: ${data.total}件 (${searchTime}ms)`, 100);
            
            return data;
        } catch (error) {
            this.notifyProgress('検索に失敗しました', 0);
            throw error;
        }
    }
    
    async buildCache() {
        this.notifyProgress('キャッシュ作成中...', 0);
        
        try {
            const data = await super.buildCache();
            this.notifyProgress(data.message, 100);
            return data;
        } catch (error) {
            this.notifyProgress('キャッシュ作成に失敗しました', 0);
            throw error;
        }
    }
}

// エラーハンドリング用ヘルパー
class ApiError extends Error {
    constructor(message, status = null, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

// レスポンス検証
function validateResponse(data) {
    if (!data.success) {
        throw new ApiError(data.error || '不明なエラー', data.status, data);
    }
    return data;
}

// Retry 機能付きAPIクライアント
class RetryApiClient extends ProgressApiClient {
    constructor(baseUrl = '', maxRetries = 3) {
        super(baseUrl);
        this.maxRetries = maxRetries;
    }
    
    async request(endpoint, options = {}) {
        let lastError;
        
        for (let i = 0; i <= this.maxRetries; i++) {
            try {
                const response = await super.request(endpoint, options);
                return validateResponse(response);
            } catch (error) {
                lastError = error;
                
                if (i < this.maxRetries) {
                    const delay = Math.pow(2, i) * 1000; // 指数バックオフ
                    this.notifyProgress(`再試行中... (${i + 1}/${this.maxRetries})`, null);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    this.notifyProgress('', 0);
                }
            }
        }
        
        throw lastError;
    }
}

// グローバルAPIクライアントインスタンス
window.apiClient = new RetryApiClient();