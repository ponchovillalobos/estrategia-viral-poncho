@echo off
REM Estrategia Viral Poncho — auto-start del dashboard
REM
REM Este archivo arranca el dev server de Next.js al iniciar sesión en Windows.
REM Lo invoca un acceso directo en la carpeta de Startup del usuario.
REM
REM Si querés detener el dashboard manualmente: cerrar la ventana o ejecutar
REM stop-dashboard.bat del mismo directorio.

setlocal
set "PROJECT_DIR=%~dp0frontend"
set "LOG_DIR=%~dp0logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Timestamp del log para no pisar al reiniciar
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value 2^>NUL ^| find "="') do set "DT=%%a"
set "LOG_FILE=%LOG_DIR%\dashboard-%DT:~0,8%-%DT:~8,6%.log"

cd /d "%PROJECT_DIR%"
title Estrategia Viral Poncho — Dashboard (npm run dev)

echo Arrancando dashboard en %PROJECT_DIR%
echo Log: %LOG_FILE%
echo.

call npm run dev > "%LOG_FILE%" 2>&1
