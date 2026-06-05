@echo off
title ImageGrab Launcher
color 0A

echo ============================================
echo           ImageGrab Launcher
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo         Download it from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    echo [NOTE]  First install downloads Chromium (~170MB^) for Puppeteer.
    echo         This only happens once. Please wait...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo.
)

:: Start the backend in a separate window
echo [1/2] Starting backend server on http://localhost:5000
start "ImageGrab - Backend" cmd /k "title ImageGrab Backend && npm run dev:backend"

:: Give backend a moment to bind the port
timeout /t 2 /nobreak >nul

:: Start the Vite frontend in a separate window
echo [2/2] Starting frontend on http://localhost:5173
start "ImageGrab - Frontend" cmd /k "title ImageGrab Frontend && npm run dev:frontend"

:: Wait a few seconds then open the browser
echo.
echo Both servers are starting up...
timeout /t 4 /nobreak >nul

echo Opening http://localhost:5173 in your browser...
start "" "http://localhost:5173"

echo.
echo ============================================
echo  Close the Backend and Frontend windows to
echo  stop the servers.
echo ============================================
echo.
pause
