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
//
// ARRANQUE ROBUSTO (auditoría de lanzamiento):
//  - Mata el node.exe zombi de una sesión anterior (PID file, verificando que
//    el PID siga siendo node.exe antes de matar).
//  - Elige un puerto LIBRE (3100→3120) en vez de asumir el 3100.
//  - Healthcheck real: espera a que el server acepte conexiones (hasta 40s)
//    y recién ahí navega la ventana. Si el proceso muere al arrancar, lee su
//    log y muestra un diálogo de error EN ESPAÑOL con el motivo (EADDRINUSE,
//    EACCES…) en vez de dejar la pantalla en blanco.
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
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

fn pid_file() -> PathBuf {
    std::env::temp_dir().join("viral-studio-node.pid")
}

fn server_log() -> PathBuf {
    std::env::temp_dir().join("viral-studio-node.log")
}

/// Mata el node de una sesión anterior que quedó zombi (la app se cerró sucio).
/// Solo mata si el PID guardado sigue siendo node.exe (los PIDs se reusan).
fn kill_previous_server() {
    let pf = pid_file();
    if let Ok(pid) = std::fs::read_to_string(&pf) {
        let pid = pid.trim().to_string();
        if !pid.is_empty() && pid.chars().all(|c| c.is_ascii_digit()) {
            if let Ok(out) = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
                .output()
            {
                if String::from_utf8_lossy(&out.stdout).to_lowercase().contains("node.exe") {
                    let _ = Command::new("taskkill").args(["/PID", &pid, "/T", "/F"]).output();
                }
            }
        }
        let _ = std::fs::remove_file(&pf);
    }
}

/// Primer puerto libre del rango 3100-3120 (otro programa puede estar usando 3100).
fn pick_port() -> u16 {
    for p in 3100u16..3121 {
        if TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return p;
        }
    }
    3100
}

fn spawn_server(port: u16) -> Option<Child> {
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

    // stderr/stdout del server a un log en %TEMP%: si muere al arrancar, el
    // healthcheck lo lee para explicarle al usuario QUÉ pasó.
    let log = std::fs::File::create(server_log()).ok();
    let log2 = log.as_ref().and_then(|f| f.try_clone().ok());

    let mut cmd = Command::new(&node_exe);
    cmd.arg("server.js")
        .current_dir(&standalone)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("VIRAL_API_HOST", format!("http://localhost:{port}"))
        // python/remotion se resuelven desde acá (paths.ts) sin depender del cwd:
        .env("VIRAL_PROJECT_ROOT", &root);
    if let Some(f) = log {
        cmd.stderr(Stdio::from(f));
    }
    if let Some(f) = log2 {
        cmd.stdout(Stdio::from(f));
    }

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

    let child = cmd
        .spawn()
        .map_err(|e| eprintln!("[studio] no pude arrancar node: {e}"))
        .ok()?;
    let _ = std::fs::write(pid_file(), child.id().to_string());
    Some(child)
}

/// Espera a que el server acepte conexiones TCP (hasta 40s). Si el proceso
/// murió, devuelve el motivo en español leyendo el log.
fn wait_for_server(port: u16, state: &ServerProc) -> Result<(), String> {
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    let deadline = std::time::Instant::now() + Duration::from_secs(40);
    loop {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok() {
            return Ok(());
        }
        // ¿El proceso murió al arrancar?
        {
            let mut guard = state.0.lock().unwrap();
            match guard.as_mut() {
                None => {
                    return Err(
                        "No se encontró el motor de la app (falta la carpeta payload o el \
                         proyecto compilado). Reinstalá la aplicación."
                            .into(),
                    );
                }
                Some(child) => {
                    if let Ok(Some(_status)) = child.try_wait() {
                        let log = std::fs::read_to_string(server_log()).unwrap_or_default();
                        let hint = if log.contains("EADDRINUSE") {
                            "Otro programa está usando el puerto de la app. Cerrá otras \
                             aplicaciones (o reiniciá la compu) y volvé a abrir."
                        } else if log.contains("EACCES") {
                            "Windows bloqueó el acceso. Probá ejecutar la app desde una \
                             carpeta de tu usuario (Documentos o Escritorio)."
                        } else if log.contains("Cannot find module") {
                            "La instalación está incompleta (faltan archivos). Reinstalá \
                             la aplicación."
                        } else {
                            "El motor de la app se cerró al arrancar."
                        };
                        let tail: String = log
                            .chars()
                            .rev()
                            .take(500)
                            .collect::<String>()
                            .chars()
                            .rev()
                            .collect();
                        return Err(format!("{hint}\n\nDetalle técnico:\n{tail}"));
                    }
                }
            }
        }
        if std::time::Instant::now() > deadline {
            return Err(
                "La app no respondió en 40 segundos. Cerrala, esperá unos segundos y \
                 volvé a abrirla. Si sigue pasando, reiniciá la computadora."
                    .into(),
            );
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    kill_previous_server();
    let port = pick_port();
    let child = spawn_server(port);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ServerProc(Mutex::new(child)))
        .setup(move |app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<ServerProc>();
                let result = wait_for_server(port, &state);
                if let Some(win) = handle.get_webview_window("main") {
                    match result {
                        Ok(()) => {
                            let url = format!("http://localhost:{port}").parse().unwrap();
                            let _ = win.navigate(url);
                        }
                        Err(msg) => {
                            rfd::MessageDialog::new()
                                .set_level(rfd::MessageLevel::Error)
                                .set_title("Estrategia Viral Studio — no pudo arrancar")
                                .set_description(&msg)
                                .set_buttons(rfd::MessageButtons::Ok)
                                .show();
                            handle.exit(1);
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<ServerProc>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.as_mut() {
                            let _ = child.kill();
                        }
                    }
                }
                let _ = std::fs::remove_file(pid_file());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
