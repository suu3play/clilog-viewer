# clilog-viewer タスクスケジューラ削除スクリプト

# 管理者権限チェック
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "エラー: このスクリプトは管理者権限で実行する必要があります" -ForegroundColor Red
    Write-Host "uninstall_task_scheduler.bat を右クリックして「管理者として実行」を選択してください" -ForegroundColor Yellow
    Read-Host "Enterキーを押して終了"
    exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  clilog-viewer タスクスケジューラ削除ツール" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# プロジェクトパスを取得
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = $scriptDir

# タスク名
$taskName = "clilog-viewer-auto-convert"

Write-Host "[1/2] タスクの確認..." -ForegroundColor Green

# 既存タスクの確認
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $existingTask) {
    Write-Host ""
    Write-Host "タスク '$taskName' は登録されていません" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Enterキーを押して終了"
    exit 0
}

Write-Host "      タスク '$taskName' が見つかりました" -ForegroundColor Gray

# 削除確認
Write-Host ""
Write-Host "[2/2] タスクの削除..." -ForegroundColor Green
$confirm = Read-Host "      本当に削除しますか？ (Y/n)"

if ($confirm -ne "" -and $confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "キャンセルしました" -ForegroundColor Yellow
    Read-Host "Enterキーを押して終了"
    exit 0
}

# タスクを削除
try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  削除完了！" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "タスク '$taskName' を削除しました" -ForegroundColor Cyan
    Write-Host ""

    # アンインストールログを記録
    $logFile = Join-Path $projectPath "install_log.txt"
    $logContent = @"
タスクスケジューラ削除ログ
========================================
削除日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
タスク名: $taskName
ユーザー: $env:USERNAME
ステータス: 成功
========================================
"@

    $logContent | Out-File -FilePath $logFile -Encoding UTF8 -Append
    Write-Host "アンインストールログ: $logFile" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "エラー: タスクの削除に失敗しました" -ForegroundColor Red
    Write-Host "詳細: $($_.Exception.Message)" -ForegroundColor Gray

    # エラーログを記録
    $logFile = Join-Path $projectPath "install_log.txt"
    $errorLog = @"
タスクスケジューラ削除ログ（エラー）
========================================
削除日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
ステータス: 失敗
エラー内容: $($_.Exception.Message)
========================================
"@

    $errorLog | Out-File -FilePath $logFile -Encoding UTF8 -Append

    Read-Host "Enterキーを押して終了"
    exit 1
}

Read-Host "Enterキーを押して終了"
