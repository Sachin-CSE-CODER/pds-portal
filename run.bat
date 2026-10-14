@echo off
title Tamil Nadu PDS Backend Server
cd /d "%~dp0"

echo ========================================================
echo   🌾 Tamil Nadu PDS Portal - Backend Launcher 🌾
echo ========================================================
echo.

if not exist "node_modules\" (
    echo [1/2] Installing required npm packages (first-time setup)...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install npm packages.
        echo Please ensure Node.js is installed from nodejs.org.
        pause
        exit /b %errorlevel%
    )
    echo [DONE] Packages installed successfully!
    echo.
)

echo [2/2] Starting backend server on http://localhost:3000 ...
echo.
node --dns-result-order=ipv4first server.js

if %errorlevel% neq 0 (
    echo.
    echo [NOTICE] Server stopped.
)

pause
