use std::{collections::HashMap, path::PathBuf, sync::Mutex};

use chrono::{DateTime, Duration, Local};
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tokio::sync::oneshot;

pub const LAN_PANEL_AUTH_MODE: &str = "one_time_code";
const DEVICE_ONLINE_WINDOW_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPanelDeviceRecord {
    pub id: String,
    pub ip: String,
    pub label: String,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPanelStatusResponse {
    pub server_enabled: bool,
    pub workspace_selected: bool,
    pub workspace_name: Option<String>,
    pub workspace_path: Option<String>,
    pub auth_mode: String,
    pub has_code: bool,
    pub access_code: Option<String>,
    pub port: Option<u16>,
    pub addresses: Vec<String>,
    pub devices: Vec<LanPanelDeviceRecord>,
}

#[derive(Debug, Clone)]
pub struct SeenDevice {
    pub id: String,
    pub ip: String,
    pub label: String,
    pub first_seen_at: DateTime<Local>,
    pub last_seen_at: DateTime<Local>,
}

#[derive(Debug, Clone)]
pub struct SessionRecord {
    pub id: String,
    pub device_id: String,
    pub created_at: DateTime<Local>,
    pub last_seen_at: DateTime<Local>,
    pub expires_at: DateTime<Local>,
}

pub struct LanPanelRuntime {
    pub port: u16,
    pub addresses: Vec<String>,
    pub assets_root: PathBuf,
    pub shutdown_tx: Option<oneshot::Sender<()>>,
    pub task: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct LanPanelSharedState {
    pub workspace_root: Option<PathBuf>,
    pub access_code: Option<String>,
    pub runtime: Option<LanPanelRuntime>,
    pub devices: Vec<SeenDevice>,
    pub sessions: HashMap<String, SessionRecord>,
}

pub struct LanPanelState {
    pub inner: Mutex<LanPanelSharedState>,
}

impl Default for LanPanelState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(LanPanelSharedState::default()),
        }
    }
}

impl LanPanelState {
    pub fn snapshot(&self) -> Result<LanPanelStatusResponse, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| "Failed to access LAN panel state.".to_string())?;
        Ok(snapshot_from_shared(&guard))
    }
}

pub fn snapshot_from_shared(shared: &LanPanelSharedState) -> LanPanelStatusResponse {
    let workspace_selected = shared.workspace_root.is_some();
    let workspace_name = shared.workspace_root.as_ref().map(workspace_display_name);
    let workspace_path = shared
        .workspace_root
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    let server_enabled = shared.runtime.is_some();
    let port = shared.runtime.as_ref().map(|runtime| runtime.port);
    let addresses = shared
        .runtime
        .as_ref()
        .map(|runtime| runtime.addresses.clone())
        .unwrap_or_default();
    let devices = device_records(&shared.devices);

    LanPanelStatusResponse {
        server_enabled,
        workspace_selected,
        workspace_name,
        workspace_path,
        auth_mode: LAN_PANEL_AUTH_MODE.into(),
        has_code: shared.access_code.is_some(),
        access_code: shared.access_code.clone(),
        port,
        addresses,
        devices,
    }
}

pub fn workspace_display_name(root: &PathBuf) -> String {
    root.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| root.to_string_lossy().into_owned())
}

pub fn device_records(devices: &[SeenDevice]) -> Vec<LanPanelDeviceRecord> {
    devices.iter().cloned().map(device_to_record).collect()
}

fn device_to_record(device: SeenDevice) -> LanPanelDeviceRecord {
    let now = Local::now();
    let online = now.signed_duration_since(device.last_seen_at)
        <= Duration::minutes(DEVICE_ONLINE_WINDOW_MINUTES);

    LanPanelDeviceRecord {
        id: device.id,
        ip: device.ip,
        label: device.label,
        first_seen_at: device.first_seen_at.to_rfc3339(),
        last_seen_at: device.last_seen_at.to_rfc3339(),
        online,
    }
}
