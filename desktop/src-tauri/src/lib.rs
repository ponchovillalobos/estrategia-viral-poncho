// Estrategia Viral Studio — launcher de escritorio (Tauri v2).
//
// DOS MODOS, mismo código:
//  - DEV (esta máquina): no hay carpeta `payload` junto al exe → busca el repo
//    subiendo desde el exe (frontend/.next/standalone) y usa los datos de
//    siempre (C:\hermes-data si existe).
//  - DISTRIBUIBLE: el instalador deja una carpeta `payload/` junto al exe con
//    TODO adentro (node, server standalone, remotion, python, ffmpeg). El
//    launcher la detecta, exporta los env VIRAL_* y la app funciona en
//    cualquier máquina SIN instalar nada más. Datos del usuario:
//    %USERPROFILE%\ViralStudio\videos (se crea sola, cero preguntas).
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct ServerProc(Mutex<Option<Child>>);

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|p| p.to_path_buf())
}

/// Carpeta `payload` junto al exe (modo distribuible) si existe y está completa.
fn payload_dir() -> Option<PathBuf> {
    let p = exe_dir()?.join("payload");
    if p.join("frontend").join(".next").join("standalone").join("server.js").exists() {
        Some(p)
    } else {
        None
    }
}

/// Modo dev: sube desde el exe hasta encontrar frontend/.next/standalone.
fn repo_root() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    loop {
        if dir
            .join("frontend").join(".next").join("standalone").join("server.js")
            .exists()
        {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }
}

/// Datos del usuario. Respeta instalaciones existentes (hermes/viral-data);
/// en máquinas nuevas crea %USERPROFILE%\ViralStudio\videos sin preguntar.
fn data_root() -> Option<PathBuf> {
    for known in ["C:\\hermes-data\\videos", "C:\\viral-data\\videos"] {
        if Path::new(known).exists() {
            return None; // los defaults del server ya lo encuentran
        }
    }
    let home = std::env::var("USERPROFILE").ok()?;
    let root = PathBuf::from(home).join("ViralStudio").join("videos");
    for sub in ["raw", "renders", "projects", "transcripts", "cuts", "long_form\\raw"] {
        let _ = std::fs::create_dir_all(root.join(sub));
    }
    Some(root)
}

fn spawn_server() -> Option<Child> {
    // Resolver raíz del proyecto: payload (distribuible) o repo (dev).
    let (root, node_exe, bundled) = if let Some(p) = payload_dir() {
        let node = p.join("node").join("node.exe");
        (p, node, true)
    } else {
        let Some(r) = repo_root() else {
            eprintln!("[studio] no encontré ni payload/ ni el repo con frontend buildeado");
            return None;
        };
        (r, PathBuf::from("node"), false)
    };
    let standalone = root.join("frontend").join(".next").join("standalone");

    let mut cmd = Command::new(&node_exe);
    cmd.arg("server.js")
        .current_dir(&standalone)
        .env("PORT", "3100")
        .env("HOSTNAME", "127.0.0.1")
        .env("VIRAL_API_HOST", "http://localhost:3100")
        // python/remotion se resuelven desde acá (paths.ts) sin depender del cwd:
        .env("VIRAL_PROJECT_ROOT", &root);

    if let Some(dr) = data_root() {
        cmd.env("VIRAL_DATA_ROOT", &dr);
    }
    if bundled {
        let ff = root.join("tools").join("ffmpeg").join("bin");
        if ff.join("ffmpeg.exe").exists() {
            cmd.env("VIRAL_FFMPEG_EXE", ff.join("ffmpeg.exe"));
            cmd.env("VIRAL_FFPROBE_EXE", ff.join("ffprobe.exe"));
        }
        // Python EMBEDDABLE del payload (el venv de dev no es relocatable).
        let py = root.join("python").join("runtime").join("python.exe");
        if py.exists() {
            cmd.env("VIRAL_PYTHON_EXE", &py);
        }
        // El node del payload también debe estar en PATH para los `npx`/`node`
        // que lanza el server (renders de Remotion, build-props, etc.).
        if let Ok(old) = std::env::var("PATH") {
            cmd.env("PATH", format!("{};{}", root.join("node").display(), old));
        }
    }

    cmd.spawn()
        .map_err(|e| eprintln!("[studio] no pude arrancar node: {e}"))
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child = spawn_server();
    std::thread::sleep(std::time::Duration::from_millis(1200));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProc(Mutex::new(child)))
        .on_window_event(|window, event| {
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
