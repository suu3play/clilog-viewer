/**
 * コピー機能ユーティリティ
 * チャットメッセージのコピー機能を提供
 */

class CopyUtils {
    /**
     * テキストをクリップボードにコピー
     * @param {string} text - コピーするテキスト
     * @param {HTMLElement} button - コピーボタン要素（フィードバック表示用）
     * @returns {Promise<boolean>} - コピー成功時true
     */
    static async copyToClipboard(text, button = null) {
        try {
            // Clipboard API を使用（モダンブラウザ）
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);

                if (button) {
                    CopyUtils.showCopyFeedback(button, true);
                }

                return true;
            } else {
                // フォールバック: execCommand を使用（古いブラウザ）
                return CopyUtils.fallbackCopy(text, button);
            }
        } catch (error) {
            console.error('クリップボードへのコピーに失敗しました:', error);

            if (button) {
                CopyUtils.showCopyFeedback(button, false);
            }

            // フォールバック処理を試行
            return CopyUtils.fallbackCopy(text, button);
        }
    }

    /**
     * フォールバックコピー処理（古いブラウザ対応）
     * @param {string} text - コピーするテキスト
     * @param {HTMLElement} button - コピーボタン要素
     * @returns {boolean} - コピー成功時true
     */
    static fallbackCopy(text, button = null) {
        try {
            // 一時的なテキストエリアを作成
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);

            // テキストを選択してコピー
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successful) {
                if (button) {
                    CopyUtils.showCopyFeedback(button, true);
                }
                return true;
            } else {
                throw new Error('execCommand failed');
            }
        } catch (error) {
            console.error('フォールバックコピーも失敗しました:', error);
            if (button) {
                CopyUtils.showCopyFeedback(button, false);
            }
            return false;
        }
    }

    /**
     * コピー操作のビジュアルフィードバック
     * @param {HTMLElement} button - コピーボタン要素
     * @param {boolean} success - 成功時true、失敗時false
     */
    static showCopyFeedback(button, success) {
        if (!button) return;

        const originalIcon = button.textContent;
        const originalTitle = button.title;

        if (success) {
            // 成功時のフィードバック
            button.textContent = 'コピー済み';
            button.title = 'コピーしました！';
            button.classList.add('copy-success');

            // 2秒後に元に戻す
            setTimeout(() => {
                button.textContent = originalIcon;
                button.title = originalTitle;
                button.classList.remove('copy-success');
            }, 2000);
        } else {
            // 失敗時のフィードバック
            button.textContent = 'エラー';
            button.title = 'コピーに失敗しました';
            button.classList.add('copy-error');

            // 2秒後に元に戻す
            setTimeout(() => {
                button.textContent = originalIcon;
                button.title = originalTitle;
                button.classList.remove('copy-error');
            }, 2000);
        }
    }

    /**
     * メッセージ要素からテキスト内容を抽出
     * @param {HTMLElement} messageElement - メッセージ要素
     * @returns {string} - 抽出されたテキスト
     */
    static extractMessageText(messageElement) {
        const contentElement = messageElement.querySelector('.message-content');
        if (!contentElement) {
            return '';
        }

        // HTMLタグを除去してプレーンテキストを取得
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentElement.innerHTML;

        // <br>タグを改行文字に変換
        tempDiv.innerHTML = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');

        // リンクは URL として保持
        const links = tempDiv.querySelectorAll('a');
        links.forEach(link => {
            link.textContent = link.href;
        });

        return tempDiv.textContent || tempDiv.innerText || '';
    }

    /**
     * コピーボタンのHTML要素を作成
     * @param {string} messageText - コピー対象のテキスト
     * @param {string} messageIndex - メッセージインデックス（一意性確保用）
     * @returns {string} - コピーボタンのHTML
     */
    static createCopyButtonHTML(messageText, messageIndex) {
        return `<button class="copy-button"
                        data-message-index="${messageIndex}"
                        title="クリップボードにコピー"
                        aria-label="このメッセージをクリップボードにコピーします"
                        tabindex="0">コピー</button>`;
    }

    /**
     * コピーボタンのイベントリスナーを設定
     * @param {HTMLElement} container - メッセージコンテナ要素
     */
    static attachCopyListeners(container) {
        if (!container) return;

        const copyButtons = container.querySelectorAll('.copy-button');

        copyButtons.forEach(button => {
            // クリックイベント
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                CopyUtils.handleCopyClick(button);
            });

            // キーボードイベント（アクセシビリティ対応）
            button.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    CopyUtils.handleCopyClick(button);
                }
            });
        });
    }

    /**
     * コピーボタンクリック時の処理
     * @param {HTMLElement} button - クリックされたボタン
     */
    static handleCopyClick(button) {
        // 親のメッセージ要素を探す
        const messageElement = button.closest('.chat-message');
        if (!messageElement) {
            console.error('メッセージ要素が見つかりません');
            return;
        }

        // メッセージテキストを抽出
        const messageText = CopyUtils.extractMessageText(messageElement);

        if (!messageText.trim()) {
            console.warn('コピーするテキストが見つかりません');
            CopyUtils.showCopyFeedback(button, false);
            return;
        }

        // コピー実行
        CopyUtils.copyToClipboard(messageText, button);

        // 統計情報があれば送信（オプション）
        if (window.uiManager && typeof window.uiManager.showNotification === 'function') {
            // 成功通知は控えめに（ボタンのフィードバックで十分）
        }
    }
}

// グローバルに公開
window.CopyUtils = CopyUtils;