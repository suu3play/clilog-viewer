@echo off
REM clilog-viewer タスクスケジューラ自動登録（管理者権限で実行）

echo.
echo ========================================
echo   clilog-viewer インストーラー
echo ========================================
echo.

REM 管理者権限チェック
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [エラー] 管理者権限が必要です
    echo.
    echo このファイルを右クリックして
    echo 「管理者として実行」を選択してください
    echo.
    pause
    exit /b 1
)

REM PowerShellスクリプトを実行
echo PowerShellスクリプトを起動中...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0install_task_scheduler.ps1"

if %errorLevel% neq 0 (
    echo.
    echo [エラー] インストールに失敗しました
    echo 詳細は install_log.txt を確認してください
    echo.
    pause
    exit /b 1
)

exit /b 0
