// Estrategia Viral Studio — launcher de escritorio (Tauri v2).
//
// v1 (esta máquina / desarrollo): arranca el server Next standalone como proceso
// hijo (node .next/standalone/server.js en el puerto 3100) y abre la ventana
// apuntando ahí. La UI completa del portal ES la app.
//
// v2 (instalador distribuible, siguiente iteración): node/python/ffmpeg van como
// sidecars empaquetados en resources y los paths se resuelven con el
// path-resolver de Tauri (ver docs/PLAN-LANZAMIENTO.md §2).
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct ServerProc(Mutex<Option<Child>>);

/// Ruta del frontend: sube desde la ubicación del EJECUTABLE (no del cwd — la app
/// puede lanzarse desde cualquier carpeta) hasta encontrar frontend/.next/standalone.
/// El .exe vive en desktop/src-tauri/target/release → 4 niveles arriba está la raíz.
fn frontend_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    loop {
        let candidate = dir.join("frontend");
        if candidate
            .join(".next")
            .join("standalone")
            .join("server.js")
            .exists()
        {
            return Some(candidate);
        }
        dir = dir.parent()?;
    }
}

fn spawn_server() -> Option<Child> {
    let Some(fe) = frontend_dir() else {
        eprintln!("[studio] no encontré frontend/.next/standalone — corré `npx next build`");
        return None;
    };
    let standalone = fe.join(".next").join("standalone");
    Command::new("node")
        .arg("server.js")
        .current_dir(&standalone)
        .env("PORT", "3100")
        .env("HOSTNAME", "127.0.0.1")
        // El render de Remotion necesita saber dónde está la API:
        .env("VIRAL_API_HOST", "http://localhost:3100")
        .spawn()
        .map_err(|e| eprintln!("[studio] no pude arrancar node: {e}"))
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child = spawn_server();
    // Darle aire al server antes de que la ventana cargue (Next standalone tarda <1s).
    std::thread::sleep(std::time::Duration::from_millis(1200));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProc(Mutex::new(child)))
        .on_window_event(|window, event| {
            // Al cerrar la ventana, matar el server hijo (si no, queda zombie).
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<ServerProc>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
