@echo off
chcp 65001 >nul
cls

REM Check administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Administrator privileges required
    echo.
    echo Please right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

REM Execute PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0install_task_scheduler.ps1"

if %errorLevel% neq 0 (
    echo.
    echo [ERROR] Installation failed
    echo Please check install_log.txt for details
    echo.
    pause
    exit /b 1
)

exit /b 0
