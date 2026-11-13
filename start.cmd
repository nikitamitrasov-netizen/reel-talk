@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8000

where python >nul 2>nul
if errorlevel 1 goto static

echo.
echo   Reel Talk - club server on http://127.0.0.1:%PORT%
echo   Close this window to stop the room sync.
echo.
start "" /min cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:%PORT%"
python tools\server.py %PORT%
goto :eof

:static
echo Python not found - opening the site as a local file.
echo Room sync between devices needs the server.
start "" "index.html"
