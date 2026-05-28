# Autostart — Dashboard al iniciar Windows

Para que el dashboard arranque **solo** al encender la computadora.

## Instalación

```powershell
cd "C:\Users\Poncho Robles\OneDrive\Documentos\Estrategia_Viral_Poncho"
.\install-autostart.ps1
```

Eso registra una **Tarea Programada de Windows** llamada `EstrategiaViralPoncho_Dashboard` que se ejecuta al iniciar tu sesión.

## Qué hace al inicio de sesión

1. Verifica Node.js disponible
2. Arranca Ollama (si no estuviera ya corriendo)
3. Lanza `npm run dev` en background (sin ventana visible)
4. Espera hasta 60s a que el dashboard responda en `localhost:3000`
5. Abre el navegador en `http://localhost:3000` automáticamente

## Comandos útiles

```powershell
# Probar AHORA sin esperar al próximo login
.\install-autostart.ps1 -RunNow

# Ver estado de la tarea
Get-ScheduledTask -TaskName "EstrategiaViralPoncho_Dashboard"

# Ver últimos logs del dashboard
Get-Content .dashboard.log -Tail 30
Get-Content .dashboard.log.npm.log -Tail 50

# Desinstalar (revertir)
.\install-autostart.ps1 -Uninstall

# Arrancar manual (sin Task Scheduler)
.\start-dashboard.ps1

# Detener el dashboard sin desinstalar
Get-Process node | Where-Object { $_.Path -like "*nodejs*" } | Stop-Process -Force
```

## Troubleshooting

### El dashboard no abre solo al iniciar Windows

```powershell
# 1. Verificar que la tarea existe
Get-ScheduledTask -TaskName "EstrategiaViralPoncho_Dashboard"

# 2. Ver última ejecución
Get-ScheduledTaskInfo -TaskName "EstrategiaViralPoncho_Dashboard"

# 3. Probar manualmente
Start-ScheduledTask -TaskName "EstrategiaViralPoncho_Dashboard"
Start-Sleep -Seconds 10
Get-Content .dashboard.log -Tail 30
```

### El log dice "Dashboard no respondió en 60s"

- Verificar que `frontend/node_modules/` existe (sino: `cd frontend; npm install`)
- Verificar que `frontend/.env.local` tiene tu `PEXELS_API_KEY`
- Probar manual: `.\start-dashboard.ps1` y leer la salida en consola

### "No se puede cargar el script porque la ejecución de scripts está deshabilitada"

```powershell
# Permitir scripts firmados localmente (1 vez, requiere admin)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Quiero que también arranque al hibernar/despertar

Editar la tarea en Task Scheduler (`taskschd.msc`) → Triggers → Agregar trigger "On workstation unlock".

### Ollama NO arranca solo

Ollama por default ya se inicia en el system tray al iniciar Windows (lo configura su instalador). Si no aparece:
- Click derecho en el icono de Ollama en el system tray (si está)
- O reinstalar Ollama desde https://ollama.com/download/windows

## Logs

Todos los logs van a 2 archivos en la raíz del proyecto:

- **`.dashboard.log`** — log del script de arranque (qué pasos hizo)
- **`.dashboard.log.npm.log`** — stdout/stderr de `npm run dev` (errores del dashboard)

Ambos están en `.gitignore`.

## Performance

Al iniciar Windows, el script tarda:
- **~5s** para verificar prerequisitos
- **~10-30s** para que `npm run dev` arranque (Next.js 16 con Turbopack es rápido)
- **~2s** para que el navegador abra

**Total: ~30-60s** desde login hasta que ves el dashboard.

## Desactivar temporalmente

Si querés apagar el autostart sin desinstalar:

```powershell
Disable-ScheduledTask -TaskName "EstrategiaViralPoncho_Dashboard"

# Para reactivar:
Enable-ScheduledTask -TaskName "EstrategiaViralPoncho_Dashboard"
```
