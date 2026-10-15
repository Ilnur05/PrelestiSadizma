@echo off
title Friends Clips Vault Server
cd /d "%~dp0"
echo ===================================================
echo   Friends Clips Vault - Server
echo ===================================================
echo.
echo   PC:     http://localhost:8080
echo   Mobile: http://192.168.0.173:8080
echo.
echo ===================================================
python server.py
pause
