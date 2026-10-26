// Desktop shell for Hero of Arcadia: a single window showing the web build in dist/.
// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Hero of Arcadia");
}
