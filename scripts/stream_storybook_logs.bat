@echo off
rem Wrapper to run the PowerShell stream script from cmd.exe without complex quoting
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stream_storybook_logs.ps1"
exit /b %ERRORLEVEL%
