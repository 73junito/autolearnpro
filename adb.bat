@echo off
REM workspace adb shim for tests - simulates adb push and related calls
if "%1"=="push" (
  echo [adb workspace shim] push %2 to %3
  exit /b 0
)
if "%1"=="devices" (
  echo List of devices attached
  exit /b 0
)
echo [adb workspace shim] %*
exit /b 0
