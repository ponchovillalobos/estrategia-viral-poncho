@echo off
REM Estrategia Viral Poncho — detener el dashboard que corre en :3000

echo Buscando proceso en puerto 3000...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Matando PID %%p
    taskkill /F /PID %%p
)
echo Listo. Si no apareció ningún PID, no había nada corriendo.
pause
