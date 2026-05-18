use std::{
    collections::BTreeSet,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use axum::{
    async_trait,
    body::Body,
    extract::{
        ConnectInfo, DefaultBodyLimit, FromRequestParts, Json as AxumJson, Multipart,
        Path as AxumPath, Query, State as AxumState,
    },
    http::{
        header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE, USER_AGENT},
        request::Parts,
        HeaderMap, HeaderValue,
    },
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Local;
use local_ip_address::{list_afinet_netifas, local_ip};
use rand::{thread_rng, Rng};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use tokio::{io::AsyncWriteExt, sync::oneshot};
use tokio_util::io::ReaderStream;

use crate::lan_panel_auth::{
    apply_auth_cookie, authenticate_with_code, clear_sessions, resolve_session_from_headers,
    LanAuthData, LanAuthRequest,
};
use crate::lan_panel_fs::{
    api_success, list_directory, prepare_download, prepare_upload_target, preview_file,
    rename_entry, search_entries, status_data_from_shared, ApiSuccess, LanApiError,
    LanApiFilesData, LanApiPreviewData, LanApiRenameData, LanApiSearchData, LanApiStatusData,
    LanApiUploadData, UPLOAD_MAX_BYTES,
};
use crate::lan_panel_state::{
    snapshot_from_shared, LanPanelRuntime, LanPanelState, LanPanelStatusResponse, SeenDevice,
};

const DEFAULT_PORT: u16 = 38421;
const DEVICE_LIMIT: usize = 24;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPanelWorkspaceRequest {
    pub path: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct FilesQuery {
    pub path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct PreviewQuery {
    pub path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct DownloadQuery {
    pub path: Option<String>,
    pub inline: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRequest {
    pub path: String,
    pub new_name: String,
}

#[tauri::command]
pub fn get_lan_panel_status(app: AppHandle) -> Result<LanPanelStatusResponse, String> {
    app.state::<Arc<LanPanelState>>().snapshot()
}

#[tauri::command]
pub fn set_lan_panel_workspace(
    app: AppHandle,
    request: LanPanelWorkspaceRequest,
) -> Result<LanPanelStatusResponse, String> {
    let raw_path = request.path.trim();
    if raw_path.is_empty() {
        return Err("Workspace folder is required.".into());
    }

    let workspace_root = PathBuf::from(raw_path);
    if !workspace_root.is_dir() {
        return Err("Selected workspace folder does not exist.".into());
    }
    let workspace_root = workspace_root
        .canonicalize()
        .map_err(|error| error.to_string())?;

    let state = app.state::<Arc<LanPanelState>>();
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to update the workspace folder.".to_string())?;

    guard.workspace_root = Some(workspace_root);
    clear_sessions(&mut guard);
    if guard.access_code.is_none() {
        guard.access_code = Some(generate_access_code());
    }

    Ok(snapshot_from_shared(&guard))
}

#[tauri::command]
pub fn regenerate_lan_panel_code(app: AppHandle) -> Result<LanPanelStatusResponse, String> {
    let state = app.state::<Arc<LanPanelState>>();
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to regenerate the access code.".to_string())?;

    guard.access_code = Some(generate_access_code());
    clear_sessions(&mut guard);
    Ok(snapshot_from_shared(&guard))
}

#[tauri::command]
pub fn start_lan_panel_server(app: AppHandle) -> Result<LanPanelStatusResponse, String> {
    let state = app.state::<Arc<LanPanelState>>();

    {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| "Failed to start the LAN panel service.".to_string())?;

        if guard.runtime.is_some() {
            return Ok(snapshot_from_shared(&guard));
        }

        if guard.workspace_root.is_none() {
            return Err("Select a workspace folder before starting the LAN panel service.".into());
        }

        if guard.access_code.is_none() {
            guard.access_code = Some(generate_access_code());
        }
    }

    let (listener, port) = bind_listener()?;
    let addresses = build_access_addresses(port);
    let assets_root = resolve_mobile_assets_root(&app)?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let app_state = state.inner().clone();
    let router = build_router(app_state);
    let task = tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                log::error!("Failed to convert LAN panel listener: {error}");
                return;
            }
        };

        let server = axum::serve(
            listener,
            router.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });

        if let Err(error) = server.await {
            log::error!("LAN panel server exited with error: {error}");
        }
    });

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to store LAN panel runtime state.".to_string())?;

    if guard.runtime.is_some() {
        let _ = shutdown_tx.send(());
        task.abort();
        return Ok(snapshot_from_shared(&guard));
    }

    guard.runtime = Some(LanPanelRuntime {
        port,
        addresses,
        assets_root,
        shutdown_tx: Some(shutdown_tx),
        task: Some(task),
    });

    Ok(snapshot_from_shared(&guard))
}

#[tauri::command]
pub async fn stop_lan_panel_server(app: AppHandle) -> Result<LanPanelStatusResponse, String> {
    let state = app.state::<Arc<LanPanelState>>();
    let runtime = {
        let mut guard = state
            .inner
            .lock()
            .map_err(|_| "Failed to stop the LAN panel service.".to_string())?;
        clear_sessions(&mut guard);
        guard.runtime.take()
    };

    if let Some(mut runtime) = runtime {
        if let Some(shutdown_tx) = runtime.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }

        if let Some(task) = runtime.task.take() {
            let _ = task.await;
        }
    }

    state.snapshot()
}

fn build_router(state: Arc<LanPanelState>) -> Router {
    Router::new()
        .route("/", get(serve_mobile_entry))
        .route("/mobile.html", get(serve_mobile_entry))
        .route("/assets/*path", get(serve_mobile_asset))
        .route("/api/status", get(api_status))
        .route("/api/auth", post(api_auth))
        .route("/api/files", get(api_files))
        .route("/api/search", get(api_search))
        .route("/api/preview", get(api_preview))
        .route("/api/download", get(api_download))
        .route(
            "/api/upload",
            post(api_upload).layer(DefaultBodyLimit::max(
                (UPLOAD_MAX_BYTES + 1024 * 1024) as usize,
            )),
        )
        .route("/api/rename", post(api_rename))
        .with_state(state)
}

async fn serve_mobile_entry(
    AxumState(state): AxumState<Arc<LanPanelState>>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let _ = track_device(&state, remote_addr.ip(), headers.get(USER_AGENT));

    match serve_mobile_file(&state, Path::new("mobile.html")).await {
        Ok(response) => response,
        Err(_) => Html(render_mobile_assets_missing(&state)).into_response(),
    }
}

async fn serve_mobile_asset(
    AxumState(state): AxumState<Arc<LanPanelState>>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    AxumPath(path): AxumPath<String>,
) -> Result<Response, LanApiError> {
    let _ = track_device(&state, remote_addr.ip(), headers.get(USER_AGENT));
    let relative_path = sanitize_mobile_asset_path(&path)
        .ok_or_else(|| LanApiError::not_found("The requested asset does not exist."))?;
    serve_mobile_file(&state, &Path::new("assets").join(relative_path)).await
}

async fn api_status(
    AxumState(state): AxumState<Arc<LanPanelState>>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<ApiSuccess<LanApiStatusData>>, LanApiError> {
    let _ = track_device(&state, remote_addr.ip(), headers.get(USER_AGENT));
    let mut guard = state
        .inner
        .lock()
        .map_err(|_| LanApiError::internal("Failed to access the LAN panel state."))?;
    let session_authed = resolve_session_from_headers(&mut guard, &headers, false).is_some();
    Ok(api_success(status_data_from_shared(&guard, session_authed)))
}

async fn api_auth(
    AxumState(state): AxumState<Arc<LanPanelState>>,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    AxumJson(payload): AxumJson<LanAuthRequest>,
) -> Result<Response, LanApiError> {
    let device_label = summarize_user_agent(
        headers
            .get(USER_AGENT)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default(),
    );
    let device_id = device_id(&remote_addr.ip().to_string(), &device_label);
    let _ = track_device(&state, remote_addr.ip(), headers.get(USER_AGENT));

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| LanApiError::internal("Failed to access the LAN panel state."))?;
    let auth_data = authenticate_with_code(&mut guard, &payload.code, &device_id)?;
    let session = guard
        .sessions
        .values()
        .filter(|session| session.device_id == device_id)
        .max_by(|left, right| left.created_at.cmp(&right.created_at))
        .cloned()
        .ok_or_else(|| LanApiError::internal("Failed to resolve the authenticated session."))?;

    let mut response = api_success::<LanAuthData>(auth_data).into_response();
    apply_auth_cookie(&mut response, &session.id, session.expires_at)?;
    Ok(response)
}

async fn api_files(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    Query(query): Query<FilesQuery>,
) -> Result<Json<ApiSuccess<LanApiFilesData>>, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;

    Ok(api_success(list_directory(
        &workspace_root,
        query.path.as_deref(),
    )?))
}

async fn api_search(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiSuccess<LanApiSearchData>>, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;

    Ok(api_success(search_entries(
        &workspace_root,
        query.q.as_deref(),
    )?))
}

async fn api_preview(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    Query(query): Query<PreviewQuery>,
) -> Result<Json<ApiSuccess<LanApiPreviewData>>, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;

    Ok(api_success(preview_file(
        &workspace_root,
        query.path.as_deref().unwrap_or_default(),
    )?))
}

async fn api_download(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    Query(query): Query<DownloadQuery>,
) -> Result<Response, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;
    let download = prepare_download(
        &workspace_root,
        query.path.as_deref().unwrap_or_default(),
        query.inline.as_deref() == Some("1"),
    )?;
    let file = tokio::fs::File::open(&download.absolute_path)
        .await
        .map_err(|_| LanApiError::internal("Unable to open the requested file."))?;
    let stream = ReaderStream::new(file);
    let mut response = Response::new(Body::from_stream(stream));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&download.content_type)
            .map_err(|_| LanApiError::internal("Unable to build the download response."))?,
    );
    response.headers_mut().insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&download.content_length.to_string())
            .map_err(|_| LanApiError::internal("Unable to build the download response."))?,
    );
    response.headers_mut().insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&download.content_disposition)
            .map_err(|_| LanApiError::internal("Unable to build the download response."))?,
    );
    Ok(response)
}

async fn api_upload(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    mut multipart: Multipart,
) -> Result<Json<ApiSuccess<LanApiUploadData>>, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;
    let temp_path = workspace_root.join(format!(
        ".fluxmint-upload-{}-{}.part",
        Local::now().timestamp_millis(),
        thread_rng().r#gen::<u64>()
    ));

    let upload_result: Result<LanApiUploadData, LanApiError> = async {
        let mut relative_directory = String::new();
        let mut relative_directory_seen = false;
        let mut uploaded_file_name: Option<String> = None;
        let mut total_bytes = 0u64;

        while let Some(mut field) = multipart
            .next_field()
            .await
            .map_err(|_| LanApiError::invalid_upload("Unable to parse the upload request."))?
        {
            match field.name() {
                Some("path") => {
                    if relative_directory_seen {
                        return Err(LanApiError::invalid_upload(
                            "The upload path was provided more than once.",
                        ));
                    }
                    relative_directory = field.text().await.map_err(|_| {
                        LanApiError::invalid_upload("Unable to read the upload path.")
                    })?;
                    relative_directory_seen = true;
                }
                Some("file") => {
                    if uploaded_file_name.is_some() {
                        return Err(LanApiError::invalid_upload(
                            "Only one file can be uploaded at a time.",
                        ));
                    }

                    let file_name = field
                        .file_name()
                        .map(|value| value.to_string())
                        .ok_or_else(|| {
                            LanApiError::invalid_upload("The uploaded file is missing a file name.")
                        })?;
                    let mut temp_file =
                        tokio::fs::File::create(&temp_path).await.map_err(|_| {
                            LanApiError::internal("Unable to prepare the upload target.")
                        })?;
                    while let Some(chunk) = field.chunk().await.map_err(|_| {
                        LanApiError::invalid_upload("Unable to read the uploaded file.")
                    })? {
                        total_bytes += chunk.len() as u64;
                        if total_bytes > UPLOAD_MAX_BYTES {
                            return Err(LanApiError::file_too_large("上传文件超过 200MB 限制"));
                        }
                        temp_file.write_all(&chunk).await.map_err(|_| {
                            LanApiError::internal("Unable to write the uploaded file.")
                        })?;
                    }
                    temp_file.flush().await.map_err(|_| {
                        LanApiError::internal("Unable to finalize the uploaded file.")
                    })?;
                    drop(temp_file);
                    uploaded_file_name = Some(file_name);
                }
                _ => {}
            }
        }

        let raw_file_name = uploaded_file_name.ok_or_else(|| {
            LanApiError::invalid_upload("No file was provided in the upload request.")
        })?;
        let target = prepare_upload_target(
            &workspace_root,
            Some(relative_directory.as_str()),
            &raw_file_name,
        )?;
        tokio::fs::rename(&temp_path, &target.absolute_path)
            .await
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::AlreadyExists {
                    LanApiError::name_conflict("存在同名文件，操作未执行")
                } else {
                    LanApiError::internal("Unable to save the uploaded file.")
                }
            })?;

        Ok(LanApiUploadData {
            name: target.name,
            relative_path: target.relative_path,
        })
    }
    .await;

    if upload_result.is_err() {
        let _ = tokio::fs::remove_file(&temp_path).await;
    }

    Ok(api_success(upload_result?))
}

async fn api_rename(
    auth: AuthenticatedSession,
    AxumState(state): AxumState<Arc<LanPanelState>>,
    AxumJson(payload): AxumJson<RenameRequest>,
) -> Result<Json<ApiSuccess<LanApiRenameData>>, LanApiError> {
    log_authenticated_session(&auth);
    let workspace_root = workspace_root_from_state(&state)?;

    Ok(api_success(rename_entry(
        &workspace_root,
        &payload.path,
        &payload.new_name,
    )?))
}

#[derive(Debug, Clone)]
struct AuthenticatedSession {
    session_id: String,
    device_id: String,
}

#[async_trait]
impl FromRequestParts<Arc<LanPanelState>> for AuthenticatedSession {
    type Rejection = LanApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<LanPanelState>,
    ) -> Result<Self, Self::Rejection> {
        if let Some(connect_info) = parts.extensions.get::<ConnectInfo<SocketAddr>>() {
            let _ = track_device(state, connect_info.0.ip(), parts.headers.get(USER_AGENT));
        }

        let mut guard = state
            .inner
            .lock()
            .map_err(|_| LanApiError::internal("Failed to access the LAN panel state."))?;
        let validation = resolve_session_from_headers(&mut guard, &parts.headers, true)
            .ok_or_else(|| LanApiError::unauthorized("Authenticate with the access code first."))?;

        Ok(Self {
            session_id: validation.session_id,
            device_id: validation.device_id,
        })
    }
}

fn workspace_root_from_state(state: &LanPanelState) -> Result<PathBuf, LanApiError> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| LanApiError::internal("Failed to access the LAN panel state."))?;
    guard
        .workspace_root
        .clone()
        .ok_or_else(|| LanApiError::workspace_not_ready("Select a workspace folder first."))
}

fn log_authenticated_session(auth: &AuthenticatedSession) {
    log::debug!(
        "Authenticated LAN session {} for device {}",
        auth.session_id,
        auth.device_id
    );
}

fn resolve_mobile_assets_root(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    let mut seen = BTreeSet::new();
    let mut push_candidate = |path: PathBuf| {
        if seen.insert(path.clone()) {
            candidates.push(path);
        }
    };

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            push_candidate(exe_dir.join("_up_").join("dist"));
            if let Some(parent) = exe_dir.parent() {
                push_candidate(parent.join("_up_").join("dist"));
            }
        }
    }

    if cfg!(debug_assertions) {
        if let Ok(current_dir) = std::env::current_dir() {
            push_candidate(current_dir.join("dist"));
            if let Some(parent) = current_dir.parent() {
                push_candidate(parent.join("dist"));
            }
        }

        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        push_candidate(manifest_dir.join("../dist"));

        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(exe_dir) = current_exe.parent() {
                push_candidate(exe_dir.join("dist"));
                if let Some(parent) = exe_dir.parent() {
                    push_candidate(parent.join("dist"));
                }
            }
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        push_candidate(resource_dir.clone());
        push_candidate(resource_dir.join("dist"));
    }

    candidates
        .into_iter()
        .find(|path| path.join("mobile.html").is_file() && path.join("assets").is_dir())
        .ok_or_else(|| {
            "Mobile web assets are missing. Run `npm run build` before starting the LAN panel service."
                .to_string()
        })
}

fn mobile_assets_root_from_state(state: &LanPanelState) -> Result<PathBuf, LanApiError> {
    let guard = state
        .inner
        .lock()
        .map_err(|_| LanApiError::internal("Failed to access the LAN panel state."))?;
    guard
        .runtime
        .as_ref()
        .map(|runtime| runtime.assets_root.clone())
        .ok_or_else(|| LanApiError::internal("Mobile assets are not available."))
}

async fn serve_mobile_file(
    state: &LanPanelState,
    relative_path: &Path,
) -> Result<Response, LanApiError> {
    let assets_root = mobile_assets_root_from_state(state)?;
    let full_path = assets_root.join(relative_path);
    let bytes = tokio::fs::read(&full_path)
        .await
        .map_err(|_| LanApiError::not_found("The requested asset does not exist."))?;
    let content_type = mime_guess::from_path(relative_path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .map_err(|_| LanApiError::internal("Unable to build the asset response."))?,
    );
    response.headers_mut().insert(
        CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-store, must-revalidate"),
    );
    Ok(response)
}

fn sanitize_mobile_asset_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let input = Path::new(trimmed);
    if input.is_absolute() {
        return None;
    }

    let mut parts = PathBuf::new();
    for component in input.components() {
        match component {
            Component::Normal(part) => parts.push(part),
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return None;
            }
        }
    }

    if parts.as_os_str().is_empty() {
        None
    } else {
        Some(parts)
    }
}

fn render_mobile_assets_missing(state: &LanPanelState) -> String {
    let workspace_name = state
        .snapshot()
        .ok()
        .and_then(|snapshot| snapshot.workspace_name)
        .unwrap_or_else(|| "No workspace selected".into());

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FluxMint LAN Panel</title>
    <style>
      :root {{
        color-scheme: light;
        font-family: "Aptos", "PingFang SC", "Microsoft YaHei", sans-serif;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(31, 111, 235, 0.16), transparent 42%),
          linear-gradient(180deg, #f4f7fb 0%, #eef3f8 100%);
        color: #10213a;
      }}
      .shell {{
        width: min(92vw, 560px);
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(16, 33, 58, 0.08);
        border-radius: 24px;
        padding: 28px 24px;
        box-shadow: 0 18px 46px rgba(16, 33, 58, 0.12);
      }}
      .eyebrow {{
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #46628d;
      }}
      h1 {{
        margin: 0 0 10px;
        font-size: 28px;
        line-height: 1.15;
      }}
      p {{
        margin: 10px 0 0;
        line-height: 1.6;
        color: #42546f;
      }}
      code {{
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      }}
    </style>
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">FluxMint LAN Panel</p>
      <h1>Mobile assets are missing</h1>
      <p>Run <code>npm run build</code> so the LAN server can serve <code>mobile.html</code> and the compiled assets.</p>
      <p>Current workspace: {}</p>
    </main>
  </body>
</html>"#,
        escape_html(&workspace_name)
    )
}

fn bind_listener() -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, DEFAULT_PORT))
        .or_else(|_| TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)))
        .map_err(|error| error.to_string())?;

    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();

    Ok((listener, port))
}

fn build_access_addresses(port: u16) -> Vec<String> {
    if let Ok(IpAddr::V4(ipv4)) = local_ip() {
        if is_mobile_reachable_ipv4(ipv4) {
            return vec![format!("http://{ipv4}:{port}")];
        }
    }

    let mut private_addresses = BTreeSet::new();
    let mut fallback_addresses = BTreeSet::new();

    if let Ok(network_interfaces) = list_afinet_netifas() {
        for (_, ip) in network_interfaces {
            if let IpAddr::V4(ipv4) = ip {
                if !is_mobile_reachable_ipv4(ipv4) {
                    continue;
                }

                if ipv4.is_private() {
                    private_addresses.insert(format!("http://{ipv4}:{port}"));
                } else {
                    fallback_addresses.insert(format!("http://{ipv4}:{port}"));
                }
            }
        }
    }

    if !private_addresses.is_empty() {
        return private_addresses.into_iter().collect();
    }

    if !fallback_addresses.is_empty() {
        return fallback_addresses.into_iter().collect();
    }

    vec![format!("http://127.0.0.1:{port}")]
}

fn is_mobile_reachable_ipv4(ipv4: Ipv4Addr) -> bool {
    !ipv4.is_loopback() && !ipv4.is_link_local() && !ipv4.is_unspecified()
}

fn track_device(
    state: &LanPanelState,
    ip: IpAddr,
    user_agent: Option<&HeaderValue>,
) -> Result<(), String> {
    let label = summarize_user_agent(
        user_agent
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default(),
    );
    let now = Local::now();
    let device_id = device_id(&ip.to_string(), &label);

    let mut guard = state
        .inner
        .lock()
        .map_err(|_| "Failed to update connected devices.".to_string())?;

    if let Some(device) = guard
        .devices
        .iter_mut()
        .find(|device| device.id == device_id)
    {
        device.ip = ip.to_string();
        device.label = label;
        device.last_seen_at = now;
    } else {
        guard.devices.push(SeenDevice {
            id: device_id,
            ip: ip.to_string(),
            label,
            first_seen_at: now,
            last_seen_at: now,
        });
    }

    guard
        .devices
        .sort_by(|left, right| right.last_seen_at.cmp(&left.last_seen_at));
    guard.devices.truncate(DEVICE_LIMIT);

    Ok(())
}

fn summarize_user_agent(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Unknown Browser".into();
    }

    let mut summary = trimmed.chars().take(88).collect::<String>();
    if trimmed.chars().count() > 88 {
        summary.push_str("...");
    }
    summary
}

fn device_id(ip: &str, label: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(ip.as_bytes());
    hasher.update(b"|");
    hasher.update(label.as_bytes());
    let digest = hasher.finalize();
    format!("dev-{:x}", digest)[..16].to_string()
}

fn generate_access_code() -> String {
    let mut rng = thread_rng();
    let value: u32 = rng.gen_range(100_000..1_000_000);
    value.to_string()
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        env, fs,
        net::{Ipv4Addr, SocketAddr},
        path::PathBuf,
        sync::Arc,
    };

    use axum::{
        body::Body,
        http::{header, HeaderValue, Request, StatusCode},
        Router,
    };
    use chrono::Local;
    use http_body_util::BodyExt;
    use tokio::sync::oneshot;
    use tower::ServiceExt;

    use super::{build_router, is_mobile_reachable_ipv4, sanitize_mobile_asset_path};
    use crate::lan_panel_state::{LanPanelRuntime, LanPanelSharedState, LanPanelState};

    fn make_workspace_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "fluxmint-lan-panel-router-{}-{}",
            label,
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    fn make_assets_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "fluxmint-lan-panel-assets-{}-{}",
            label,
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ))
    }

    fn build_test_state(workspace_root: &PathBuf, assets_root: &PathBuf) -> Arc<LanPanelState> {
        fs::create_dir_all(assets_root.join("assets")).unwrap();
        fs::write(
            assets_root.join("mobile.html"),
            "<!doctype html><div>mobile</div>",
        )
        .unwrap();
        fs::write(
            assets_root.join("assets").join("mobile.js"),
            "console.log('ok')",
        )
        .unwrap();
        let canonical_workspace_root = workspace_root.canonicalize().unwrap();
        let canonical_assets_root = assets_root.canonicalize().unwrap();

        Arc::new(LanPanelState {
            inner: std::sync::Mutex::new(LanPanelSharedState {
                workspace_root: Some(canonical_workspace_root),
                access_code: Some("123456".into()),
                runtime: Some(LanPanelRuntime {
                    port: 38421,
                    addresses: vec!["http://127.0.0.1:38421".into()],
                    assets_root: canonical_assets_root,
                    shutdown_tx: Some(oneshot::channel::<()>().0),
                    task: None,
                }),
                devices: Vec::new(),
                sessions: HashMap::new(),
            }),
        })
    }

    fn build_request(method: &str, uri: &str, body: Body) -> Request<Body> {
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .body(body)
            .unwrap();
        request
            .extensions_mut()
            .insert(axum::extract::ConnectInfo(SocketAddr::from((
                [127, 0, 0, 1],
                55001,
            ))));
        request
    }

    async fn response_text(response: axum::response::Response) -> String {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    async fn authenticate(app: &Router, cookie_name_only: bool) -> String {
        let mut request = build_request(
            "POST",
            "/api/auth",
            Body::from(r#"{"code":"123456"}"#.as_bytes().to_vec()),
        );
        request.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );

        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let cookie_header = response
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();

        if cookie_name_only {
            cookie_header
                .split(';')
                .next()
                .unwrap_or_default()
                .to_string()
        } else {
            cookie_header
        }
    }

    fn multipart_body(path: &str, file_name: &str, content: &[u8], boundary: &str) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(b"Content-Disposition: form-data; name=\"path\"\r\n\r\n");
        body.extend_from_slice(path.as_bytes());
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\n")
                .as_bytes(),
        );
        body.extend_from_slice(b"Content-Type: text/plain\r\n\r\n");
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
        body
    }

    #[tokio::test]
    async fn api_files_requires_authentication() {
        let workspace_root = make_workspace_root("unauthorized");
        let assets_root = make_assets_root("unauthorized");
        fs::create_dir_all(&workspace_root).unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));

        let response = app
            .oneshot(build_request("GET", "/api/files?path=", Body::empty()))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = response_text(response).await;
        assert!(body.contains("\"code\":\"UNAUTHORIZED\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[tokio::test]
    async fn api_auth_then_files_and_status_work() {
        let workspace_root = make_workspace_root("auth");
        let assets_root = make_assets_root("auth");
        fs::create_dir_all(workspace_root.join("docs")).unwrap();
        fs::write(workspace_root.join("docs").join("readme.md"), b"hello").unwrap();
        fs::write(workspace_root.join("root.txt"), b"root").unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));

        let cookie = authenticate(&app, true).await;

        let mut status_request = build_request("GET", "/api/status", Body::empty());
        status_request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        let status_response = app.clone().oneshot(status_request).await.unwrap();
        assert_eq!(status_response.status(), StatusCode::OK);
        let status_body = response_text(status_response).await;
        assert!(status_body.contains("\"sessionAuthed\":true"));
        assert!(status_body.contains("\"addresses\":[\"http://127.0.0.1:38421\"]"));

        let mut files_request = build_request("GET", "/api/files?path=", Body::empty());
        files_request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        let files_response = app.clone().oneshot(files_request).await.unwrap();
        assert_eq!(files_response.status(), StatusCode::OK);
        let files_body = response_text(files_response).await;
        assert!(files_body.contains("\"relativePath\":\"docs\""));
        assert!(files_body.contains("\"relativePath\":\"root.txt\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[tokio::test]
    async fn api_preview_returns_too_large_for_big_text() {
        let workspace_root = make_workspace_root("preview");
        let assets_root = make_assets_root("preview");
        fs::create_dir_all(&workspace_root).unwrap();
        fs::write(
            workspace_root.join("big.txt"),
            vec![b'a'; (crate::lan_panel_fs::TEXT_PREVIEW_MAX_BYTES + 1) as usize],
        )
        .unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));
        let cookie = authenticate(&app, true).await;

        let mut request = build_request("GET", "/api/preview?path=big.txt", Body::empty());
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        let response = app.clone().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response_text(response).await;
        assert!(body.contains("\"kind\":\"too_large\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[tokio::test]
    async fn api_upload_conflict_is_rejected() {
        let workspace_root = make_workspace_root("upload-conflict");
        let assets_root = make_assets_root("upload-conflict");
        fs::create_dir_all(&workspace_root).unwrap();
        fs::write(workspace_root.join("sample.txt"), b"existing").unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));
        let cookie = authenticate(&app, true).await;
        let boundary = "----FluxMintBoundary";
        let body = multipart_body("", "sample.txt", b"new-content", boundary);

        let mut request = build_request("POST", "/api/upload", Body::from(body));
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        request.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_str(&format!("multipart/form-data; boundary={boundary}")).unwrap(),
        );
        let response = app.clone().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        let response_body = response_text(response).await;
        assert!(response_body.contains("\"code\":\"NAME_CONFLICT\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[tokio::test]
    async fn api_download_rejects_absolute_path() {
        let workspace_root = make_workspace_root("download-forbidden");
        let assets_root = make_assets_root("download-forbidden");
        fs::create_dir_all(&workspace_root).unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));
        let cookie = authenticate(&app, true).await;

        let mut request = build_request(
            "GET",
            "/api/download?path=C:%5CWindows%5Csystem32&inline=1",
            Body::empty(),
        );
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        let response = app.clone().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body = response_text(response).await;
        assert!(body.contains("\"code\":\"PATH_FORBIDDEN\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[tokio::test]
    async fn api_rename_rejects_invalid_name() {
        let workspace_root = make_workspace_root("rename-invalid");
        let assets_root = make_assets_root("rename-invalid");
        fs::create_dir_all(workspace_root.join("docs")).unwrap();
        fs::write(workspace_root.join("docs").join("readme.md"), b"hello").unwrap();
        let app = build_router(build_test_state(&workspace_root, &assets_root));
        let cookie = authenticate(&app, true).await;

        let mut request = build_request(
            "POST",
            "/api/rename",
            Body::from(
                r#"{"path":"docs/readme.md","newName":"../bad.md"}"#
                    .as_bytes()
                    .to_vec(),
            ),
        );
        request
            .headers_mut()
            .insert(header::COOKIE, HeaderValue::from_str(&cookie).unwrap());
        request.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        let response = app.clone().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = response_text(response).await;
        assert!(body.contains("\"code\":\"INVALID_NAME\""));

        let _ = fs::remove_dir_all(workspace_root);
        let _ = fs::remove_dir_all(assets_root);
    }

    #[test]
    fn mobile_asset_path_rejects_traversal() {
        assert!(sanitize_mobile_asset_path("../mobile.html").is_none());
        assert!(sanitize_mobile_asset_path("assets/../../secret.js").is_none());
        assert!(sanitize_mobile_asset_path("nested/mobile.js").is_some());
    }

    #[test]
    fn mobile_reachable_ipv4_rejects_link_local() {
        assert!(!is_mobile_reachable_ipv4(Ipv4Addr::new(169, 254, 10, 20)));
    }

    #[test]
    fn mobile_reachable_ipv4_accepts_private_lan() {
        assert!(is_mobile_reachable_ipv4(Ipv4Addr::new(192, 168, 1, 6)));
    }
}
