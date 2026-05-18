mod lan_panel;
mod lan_panel_auth;
mod lan_panel_fs;
mod lan_panel_state;
mod library;

use std::sync::Arc;

use lan_panel::{
    get_lan_panel_status, regenerate_lan_panel_code, set_lan_panel_workspace,
    start_lan_panel_server, stop_lan_panel_server,
};
use lan_panel_state::LanPanelState;
use library::{
    analyze_import, commit_import, create_folder, create_project, delete_assets, delete_folder,
    delete_rule, empty_recycle_bin, load_operation_history, load_recycle_bin, load_workspace,
    move_assets, open_external_target, open_managed_path, rename_asset, rename_folder,
    rescan_project, resolve_native_preview, restore_recycle_entries, reveal_managed_path,
    save_rule, save_settings, start_native_file_drag, unbind_project, undo_last_action,
    undo_last_import, WorkspaceWatchState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(WorkspaceWatchState::default()))
        .manage(Arc::new(LanPanelState::default()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            create_project,
            unbind_project,
            analyze_import,
            commit_import,
            rename_asset,
            save_rule,
            delete_rule,
            save_settings,
            create_folder,
            rename_folder,
            delete_folder,
            move_assets,
            delete_assets,
            rescan_project,
            resolve_native_preview,
            start_native_file_drag,
            open_managed_path,
            open_external_target,
            reveal_managed_path,
            load_operation_history,
            load_recycle_bin,
            undo_last_action,
            undo_last_import,
            restore_recycle_entries,
            empty_recycle_bin,
            get_lan_panel_status,
            set_lan_panel_workspace,
            start_lan_panel_server,
            stop_lan_panel_server,
            regenerate_lan_panel_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
