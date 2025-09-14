/**
 * スクロール機能共通ユーティリティ
 * 全モード共通のスクロール処理を提供
 */

class ScrollUtils {
    /**
     * 指定された要素を最下部までスクロール
     * @param {HTMLElement} element - スクロール対象の要素
     * @param {boolean} smooth - スムーススクロールを使用するか
     */
    static scrollToBottom(element, smooth = false) {
        if (!element) return;

        const performScroll = () => {
            if (smooth && element.scrollTo) {
                element.scrollTo({
                    top: element.scrollHeight,
                    behavior: 'smooth'
                });
            } else {
                element.scrollTop = element.scrollHeight;
            }
        };

        // 即座に実行
        performScroll();

        // DOM更新を待って再実行
        requestAnimationFrame(() => {
            performScroll();
            // さらに少し遅延して確実に実行（画像読み込みなどを考慮）
            setTimeout(performScroll, 50);
        });
    }

    /**
     * messageAreaを最下部までスクロール（汎用）
     * @param {boolean} smooth - スムーススクロールを使用するか
     */
    static scrollMessageAreaToBottom(smooth = false) {
        const messageArea = document.getElementById('messageArea');
        if (messageArea) {
            this.scrollToBottom(messageArea, smooth);
        }
    }

    /**
     * 要素が完全に読み込まれた後にスクロール実行
     * @param {HTMLElement} element - スクロール対象の要素
     * @param {boolean} smooth - スムーススクロールを使用するか
     */
    static scrollToBottomWhenReady(element, smooth = false) {
        if (!element) return;

        // DOM内容が変更されるのを待つ
        const observer = new MutationObserver((mutations) => {
            let shouldScroll = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldScroll = true;
                }
            });

            if (shouldScroll) {
                this.scrollToBottom(element, smooth);
            }
        });

        // 監視開始
        observer.observe(element, {
            childList: true,
            subtree: true
        });

        // 即座にもスクロール実行
        this.scrollToBottom(element, smooth);

        // 少し時間をおいて監視停止
        setTimeout(() => {
            observer.disconnect();
        }, 1000);
    }
}

// グローバルに公開
window.ScrollUtils = ScrollUtils;