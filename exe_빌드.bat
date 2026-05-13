@echo off
REM ---- Self-elevate to administrator ----
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
    exit /b
)
REM ---- Running as administrator below ----

setlocal
title Build EXE (Admin)

echo ========================================
echo    .exe Builder
echo ========================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js not found.
    echo.
    echo Install Node.js LTS from https://nodejs.org and run again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo Node version: %NODE_VER%
for /f "tokens=1 delims=v." %%a in ("%NODE_VER%") do set "NODE_MAJOR=%%a"
if not "%NODE_MAJOR%"=="20" if not "%NODE_MAJOR%"=="22" (
    echo.
    echo ========================================
    echo    [X] Unsupported Node.js version: %NODE_VER%
    echo ========================================
    echo This project must be built with Node.js 20 or 22 LTS.
    echo Newer versions ^(Node 23 / 24+^) have no prebuilt better-sqlite3
    echo binary, so the native build falls back to a C++ compile and fails.
    echo.
    echo Fix: install Node.js 22 LTS from https://nodejs.org and run again.
    echo      ^(If you use nvm: "nvm install 22" then "nvm use 22"^)
    echo.
    pause
    exit /b 1
)
echo.

if not exist "node_modules" (
    echo [1/2] Installing dependencies... ^(first run takes 3-5 min^)
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [X] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed. Skipping.
)

echo.
echo [2/2] Building .exe... ^(takes 1-3 min^)
echo.

call npm run electron:build
if errorlevel 1 (
    echo.
    echo ========================================
    echo    [X] Build FAILED
    echo ========================================
    echo See log above for details.
    pause
    exit /b 1
)

echo.
echo Moving portable .exe to project root...
move /y "%~dp0release\DB-Archive-*.exe" "%~dp0" >nul 2>&1
if errorlevel 1 (
    echo [!] No portable .exe found in release\. Keeping output as-is.
)

echo.
echo ========================================
echo    Build SUCCESS
echo ========================================
echo.
echo Portable .exe location: %~dp0
echo Just double-click DB-Archive-*.exe to run. No install needed.
echo.

choice /C YN /T 5 /D Y /M "Open project folder now"
if errorlevel 2 goto end
start "" explorer "%~dp0"

:end
echo.
pause
