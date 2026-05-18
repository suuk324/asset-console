use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::Local;
use serde::Serialize;

use crate::lan_panel_state::{
    device_records, LanPanelDeviceRecord, LanPanelSharedState, LAN_PANEL_AUTH_MODE,
};

const IMAGE_PREVIEW_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];
const TEXT_PREVIEW_EXTENSIONS: &[&str] = &[
    "txt", "md", "json", "csv", "html", "css", "js", "ts", "tsx", "jsx",
];
const SEARCH_LIMIT: usize = 200;
const WINDOWS_RESERVED_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];
const INVALID_NAME_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

pub const TEXT_PREVIEW_MAX_BYTES: u64 = 2 * 1024 * 1024;
pub const UPLOAD_MAX_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSuccess<T> {
    pub ok: bool,
    pub data: T,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiFailure {
    pub ok: bool,
    pub error: ApiErrorBody,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorBody {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct LanApiError {
    status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl LanApiError {
    pub fn workspace_not_ready(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "WORKSPACE_NOT_READY", message.into())
    }

    pub fn path_forbidden(message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "PATH_FORBIDDEN", message.into())
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", message.into())
    }

    pub fn not_a_file(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "NOT_A_FILE", message.into())
    }

    pub fn not_a_directory(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "NOT_A_DIRECTORY", message.into())
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", message.into())
    }

    pub fn invalid_code(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "INVALID_CODE", message.into())
    }

    pub fn invalid_name(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "INVALID_NAME", message.into())
    }

    pub fn name_conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "NAME_CONFLICT", message.into())
    }

    pub fn file_too_large(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::PAYLOAD_TOO_LARGE,
            "FILE_TOO_LARGE",
            message.into(),
        )
    }

    pub fn invalid_upload(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "INVALID_UPLOAD", message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            message.into(),
        )
    }

    fn new(status: StatusCode, code: &'static str, message: String) -> Self {
        Self {
            status,
            code,
            message,
        }
    }
}

impl IntoResponse for LanApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiFailure {
                ok: false,
                error: ApiErrorBody {
                    code: self.code,
                    message: self.message,
                },
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiStatusData {
    pub server_enabled: bool,
    pub workspace_name: Option<String>,
    pub auth_mode: &'static str,
    pub has_code: bool,
    pub addresses: Vec<String>,
    pub devices: Vec<LanPanelDeviceRecord>,
    pub session_authed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiFilesData {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub items: Vec<LanApiFileItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiSearchData {
    pub query: String,
    pub items: Vec<LanApiFileItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiFileItem {
    pub name: String,
    pub relative_path: String,
    pub kind: &'static str,
    pub size: Option<u64>,
    pub modified_at: String,
    pub previewable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum LanApiPreviewData {
    #[serde(rename = "url")]
    Url {
        #[serde(rename = "previewUrl")]
        preview_url: String,
        #[serde(rename = "contentType")]
        content_type: String,
    },
    #[serde(rename = "text")]
    Text { content: String, truncated: bool },
    #[serde(rename = "too_large")]
    TooLarge { message: String },
    #[serde(rename = "unsupported")]
    Unsupported { message: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiUploadData {
    pub name: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanApiRenameData {
    pub old_path: String,
    pub new_path: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct SafeResolvedPath {
    pub absolute_path: PathBuf,
    pub relative_path: String,
}

#[derive(Debug, Clone)]
pub struct LanUploadTarget {
    pub absolute_path: PathBuf,
    pub relative_path: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct LanDownloadSpec {
    pub absolute_path: PathBuf,
    pub content_type: String,
    pub content_length: u64,
    pub content_disposition: String,
}

pub fn api_success<T>(data: T) -> Json<ApiSuccess<T>>
where
    T: Serialize,
{
    Json(ApiSuccess { ok: true, data })
}

pub fn status_data_from_shared(
    shared: &LanPanelSharedState,
    session_authed: bool,
) -> LanApiStatusData {
    LanApiStatusData {
        server_enabled: shared.runtime.is_some(),
        workspace_name: shared
            .workspace_root
            .as_ref()
            .map(|root| workspace_name_from_root(root.as_path())),
        auth_mode: LAN_PANEL_AUTH_MODE,
        has_code: shared.access_code.is_some(),
        addresses: shared
            .runtime
            .as_ref()
            .map(|runtime| runtime.addresses.clone())
            .unwrap_or_default(),
        devices: device_records(&shared.devices),
        session_authed,
    }
}

pub fn list_directory(
    workspace_root: &Path,
    raw_relative_path: Option<&str>,
) -> Result<LanApiFilesData, LanApiError> {
    let resolved = safe_resolve_path(workspace_root, raw_relative_path.unwrap_or(""), true)?;
    if !resolved.absolute_path.is_dir() {
        return Err(LanApiError::not_a_directory(
            "The requested path is not a directory.",
        ));
    }

    let entries = fs::read_dir(&resolved.absolute_path)
        .map_err(|error| map_io_error(error, "Unable to read the requested directory."))?;

    let mut items = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|error| map_io_error(error, "Unable to read a directory entry."))?;
        let path = entry.path();
        let metadata = fs::metadata(&path)
            .map_err(|error| map_io_error(error, "Unable to read entry metadata."))?;
        items.push(file_item_from_path(workspace_root, &path, &metadata)?);
    }

    sort_items(&mut items);

    Ok(LanApiFilesData {
        current_path: resolved.relative_path.clone(),
        parent_path: parent_relative_path(&resolved.relative_path),
        items,
    })
}

pub fn search_entries(
    workspace_root: &Path,
    raw_query: Option<&str>,
) -> Result<LanApiSearchData, LanApiError> {
    let query = raw_query.unwrap_or("").trim().to_string();
    if query.is_empty() {
        return Ok(LanApiSearchData {
            query,
            items: Vec::new(),
        });
    }

    let mut items = Vec::new();
    let mut visited = HashSet::new();
    visited.insert(workspace_root.to_path_buf());
    walk_search_directory(
        workspace_root,
        workspace_root,
        &query.to_lowercase(),
        &mut visited,
        &mut items,
    )?;
    sort_items(&mut items);

    Ok(LanApiSearchData { query, items })
}

pub fn preview_file(
    workspace_root: &Path,
    raw_relative_path: &str,
) -> Result<LanApiPreviewData, LanApiError> {
    let resolved = safe_resolve_path(workspace_root, raw_relative_path, true)?;
    let metadata = fs::metadata(&resolved.absolute_path)
        .map_err(|error| map_io_error(error, "Unable to read the requested file."))?;
    if !metadata.is_file() {
        return Err(LanApiError::not_a_file("The requested path is not a file."));
    }

    let extension = extension_lowercase(&resolved.absolute_path);
    if TEXT_PREVIEW_EXTENSIONS.contains(&extension.as_str()) {
        if metadata.len() > TEXT_PREVIEW_MAX_BYTES {
            return Ok(LanApiPreviewData::TooLarge {
                message: "文本文件超过 2MB，不支持直接预览".into(),
            });
        }

        let bytes = fs::read(&resolved.absolute_path)
            .map_err(|error| map_io_error(error, "Unable to load the requested text file."))?;
        return Ok(LanApiPreviewData::Text {
            content: String::from_utf8_lossy(&bytes).into_owned(),
            truncated: false,
        });
    }

    if IMAGE_PREVIEW_EXTENSIONS.contains(&extension.as_str()) || extension == "pdf" {
        return Ok(LanApiPreviewData::Url {
            preview_url: build_inline_download_url(&resolved.relative_path),
            content_type: content_type_for_path(&resolved.absolute_path),
        });
    }

    Ok(LanApiPreviewData::Unsupported {
        message: "该文件类型暂不支持手机预览，请下载或在电脑端打开。".into(),
    })
}

pub fn prepare_download(
    workspace_root: &Path,
    raw_relative_path: &str,
    inline: bool,
) -> Result<LanDownloadSpec, LanApiError> {
    let resolved = safe_resolve_path(workspace_root, raw_relative_path, true)?;
    let metadata = fs::metadata(&resolved.absolute_path)
        .map_err(|error| map_io_error(error, "Unable to read the requested file."))?;
    if !metadata.is_file() {
        return Err(LanApiError::not_a_file("The requested path is not a file."));
    }

    let file_name = file_name_from_path(&resolved.absolute_path)?;
    let content_type = content_type_for_path(&resolved.absolute_path);
    Ok(LanDownloadSpec {
        absolute_path: resolved.absolute_path,
        content_type,
        content_length: metadata.len(),
        content_disposition: build_content_disposition(&file_name, inline),
    })
}

pub fn prepare_upload_target(
    workspace_root: &Path,
    raw_directory_path: Option<&str>,
    raw_file_name: &str,
) -> Result<LanUploadTarget, LanApiError> {
    let resolved_directory =
        safe_resolve_path(workspace_root, raw_directory_path.unwrap_or(""), true)?;
    if !resolved_directory.absolute_path.is_dir() {
        return Err(LanApiError::not_a_directory(
            "The upload target must be a directory.",
        ));
    }

    let file_name = validate_entry_name(raw_file_name)?;
    let relative_path = join_relative_path(&resolved_directory.relative_path, &file_name);
    let resolved_target = safe_resolve_path(workspace_root, &relative_path, false)?;
    if resolved_target.absolute_path.exists() {
        return Err(LanApiError::name_conflict("存在同名文件，操作未执行"));
    }

    Ok(LanUploadTarget {
        absolute_path: resolved_target.absolute_path,
        relative_path,
        name: file_name,
    })
}

pub fn rename_entry(
    workspace_root: &Path,
    raw_relative_path: &str,
    raw_new_name: &str,
) -> Result<LanApiRenameData, LanApiError> {
    let resolved_source = safe_resolve_path(workspace_root, raw_relative_path, true)?;
    if resolved_source.relative_path.is_empty() {
        return Err(LanApiError::path_forbidden(
            "The workspace root cannot be renamed from the LAN panel.",
        ));
    }

    let metadata = fs::metadata(&resolved_source.absolute_path)
        .map_err(|error| map_io_error(error, "Unable to read the requested entry."))?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(LanApiError::not_found(
            "The requested entry no longer exists.",
        ));
    }

    let new_name = validate_entry_name(raw_new_name)?;
    let parent_path = parent_relative_path(&resolved_source.relative_path).unwrap_or_default();
    let new_relative_path = join_relative_path(&parent_path, &new_name);
    if new_relative_path == resolved_source.relative_path {
        return Err(LanApiError::name_conflict("存在同名文件，操作未执行"));
    }

    let resolved_target = safe_resolve_path(workspace_root, &new_relative_path, false)?;
    if resolved_target.absolute_path.exists() {
        return Err(LanApiError::name_conflict("存在同名文件，操作未执行"));
    }

    fs::rename(
        &resolved_source.absolute_path,
        &resolved_target.absolute_path,
    )
    .map_err(|error| map_rename_error(error, "Unable to rename the requested entry."))?;

    Ok(LanApiRenameData {
        old_path: resolved_source.relative_path,
        new_path: new_relative_path,
        name: new_name,
    })
}

pub fn safe_resolve_path(
    workspace_root: &Path,
    raw_relative_path: &str,
    must_exist: bool,
) -> Result<SafeResolvedPath, LanApiError> {
    let trimmed = raw_relative_path.trim();
    if trimmed.is_empty() {
        return Ok(SafeResolvedPath {
            absolute_path: workspace_root.to_path_buf(),
            relative_path: String::new(),
        });
    }

    if trimmed.contains('\0') {
        return Err(LanApiError::path_forbidden(
            "The requested path is invalid.",
        ));
    }

    let input_path = Path::new(trimmed);
    if input_path.is_absolute() {
        return Err(LanApiError::path_forbidden(
            "Absolute paths are not allowed.",
        ));
    }

    let mut parts = Vec::new();
    for component in input_path.components() {
        match component {
            Component::Normal(part) => {
                parts.push(part.to_string_lossy().into_owned());
            }
            Component::CurDir | Component::ParentDir => {
                return Err(LanApiError::path_forbidden(
                    "Path traversal is not allowed.",
                ));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(LanApiError::path_forbidden(
                    "Only relative paths inside the workspace are allowed.",
                ));
            }
        }
    }

    let relative_path = parts.join("/");
    let candidate = workspace_root.join(Path::new(&relative_path));

    let absolute_path = if must_exist {
        let canonical = candidate.canonicalize().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                LanApiError::not_found("The requested path does not exist.")
            } else {
                map_io_error(error, "Unable to resolve the requested path.")
            }
        })?;
        ensure_within_workspace(workspace_root, &canonical)?;
        canonical
    } else {
        let parent = candidate.parent().ok_or_else(|| {
            LanApiError::path_forbidden("Unable to resolve the parent of the requested path.")
        })?;
        let canonical_parent = parent.canonicalize().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                LanApiError::not_found("The parent path does not exist.")
            } else {
                map_io_error(error, "Unable to resolve the parent path.")
            }
        })?;
        ensure_within_workspace(workspace_root, &canonical_parent)?;
        canonical_parent.join(
            candidate
                .file_name()
                .ok_or_else(|| LanApiError::path_forbidden("The requested path is invalid."))?,
        )
    };

    Ok(SafeResolvedPath {
        absolute_path,
        relative_path,
    })
}

fn walk_search_directory(
    workspace_root: &Path,
    current_dir: &Path,
    query_lower: &str,
    visited: &mut HashSet<PathBuf>,
    items: &mut Vec<LanApiFileItem>,
) -> Result<(), LanApiError> {
    if items.len() >= SEARCH_LIMIT {
        return Ok(());
    }

    let entries = fs::read_dir(current_dir)
        .map_err(|error| map_io_error(error, "Unable to search the requested directory."))?;
    for entry in entries {
        if items.len() >= SEARCH_LIMIT {
            break;
        }

        let entry =
            entry.map_err(|error| map_io_error(error, "Unable to read a directory entry."))?;
        let path = entry.path();
        let metadata = fs::metadata(&path)
            .map_err(|error| map_io_error(error, "Unable to read entry metadata."))?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.to_lowercase().contains(query_lower) {
            items.push(file_item_from_path(workspace_root, &path, &metadata)?);
            if items.len() >= SEARCH_LIMIT {
                break;
            }
        }

        if metadata.is_dir() {
            let canonical_dir = match path.canonicalize() {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("Skipping search directory {:?}: {error}", path);
                    continue;
                }
            };

            if ensure_within_workspace(workspace_root, &canonical_dir).is_err() {
                continue;
            }
            if !visited.insert(canonical_dir) {
                continue;
            }

            walk_search_directory(workspace_root, &path, query_lower, visited, items)?;
        }
    }

    Ok(())
}

fn ensure_within_workspace(workspace_root: &Path, path: &Path) -> Result<(), LanApiError> {
    if path.starts_with(workspace_root) {
        Ok(())
    } else {
        Err(LanApiError::path_forbidden(
            "The requested path is outside the workspace.",
        ))
    }
}

fn file_item_from_path(
    workspace_root: &Path,
    path: &Path,
    metadata: &fs::Metadata,
) -> Result<LanApiFileItem, LanApiError> {
    let name = file_name_from_path(path)?;
    let is_dir = metadata.is_dir();
    let relative_path = relative_to_root(workspace_root, path)?;
    let modified_at = format_system_time(metadata.modified().map_err(|error| {
        map_io_error(error, "Unable to read the modified time for this entry.")
    })?);

    Ok(LanApiFileItem {
        name,
        relative_path,
        kind: if is_dir { "dir" } else { "file" },
        size: if is_dir { None } else { Some(metadata.len()) },
        modified_at,
        previewable: !is_dir && is_previewable(path),
    })
}

fn validate_entry_name(raw_name: &str) -> Result<String, LanApiError> {
    let name = raw_name.trim();
    if name.is_empty() {
        return Err(LanApiError::invalid_name("名称不能为空"));
    }
    if name == "." || name == ".." || name.contains("..") {
        return Err(LanApiError::invalid_name("名称不能包含 .."));
    }
    if name.contains('/') || name.contains('\\') {
        return Err(LanApiError::invalid_name("名称不能包含路径分隔符"));
    }
    if name.contains('\0') {
        return Err(LanApiError::invalid_name("名称不合法"));
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return Err(LanApiError::invalid_name("名称不能以空格或句点结尾"));
    }
    if name
        .chars()
        .any(|character| character.is_control() || INVALID_NAME_CHARS.contains(&character))
    {
        return Err(LanApiError::invalid_name("名称包含系统非法字符"));
    }

    let reserved_candidate = name
        .split('.')
        .next()
        .unwrap_or(name)
        .trim()
        .to_ascii_lowercase();
    if WINDOWS_RESERVED_NAMES.contains(&reserved_candidate.as_str()) {
        return Err(LanApiError::invalid_name("名称不能使用系统保留设备名"));
    }

    Ok(name.to_string())
}

fn workspace_name_from_root(root: &Path) -> String {
    root.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| root.to_string_lossy().into_owned())
}

fn file_name_from_path(path: &Path) -> Result<String, LanApiError> {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| LanApiError::internal("Unable to resolve the file name."))
}

fn is_previewable(path: &Path) -> bool {
    let extension = extension_lowercase(path);
    IMAGE_PREVIEW_EXTENSIONS.contains(&extension.as_str())
        || TEXT_PREVIEW_EXTENSIONS.contains(&extension.as_str())
        || extension == "pdf"
}

fn extension_lowercase(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn content_type_for_path(path: &Path) -> String {
    mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string()
}

fn build_inline_download_url(relative_path: &str) -> String {
    format!(
        "/api/download?path={}&inline=1",
        urlencoding::encode(relative_path)
    )
}

fn build_content_disposition(file_name: &str, inline: bool) -> String {
    let fallback_name = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    let encoded_name = urlencoding::encode(file_name);
    let disposition = if inline { "inline" } else { "attachment" };

    format!(
        "{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{encoded}",
        fallback = if fallback_name.is_empty() {
            "download"
        } else {
            &fallback_name
        },
        encoded = encoded_name
    )
}

fn sort_items(items: &mut [LanApiFileItem]) {
    items.sort_by(|left, right| match (left.kind, right.kind) {
        ("dir", "file") => std::cmp::Ordering::Less,
        ("file", "dir") => std::cmp::Ordering::Greater,
        _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
    });
}

fn join_relative_path(parent: &str, name: &str) -> String {
    if parent.trim().is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

fn parent_relative_path(relative_path: &str) -> Option<String> {
    if relative_path.is_empty() {
        return None;
    }

    Some(
        Path::new(relative_path)
            .parent()
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default(),
    )
}

fn relative_to_root(workspace_root: &Path, path: &Path) -> Result<String, LanApiError> {
    path.strip_prefix(workspace_root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map_err(|_| LanApiError::path_forbidden("The requested path is outside the workspace."))
}

fn format_system_time(system_time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<Local> = system_time.into();
    datetime.to_rfc3339()
}

fn map_rename_error(error: std::io::Error, fallback: &str) -> LanApiError {
    if error.kind() == std::io::ErrorKind::AlreadyExists {
        LanApiError::name_conflict("存在同名文件，操作未执行")
    } else {
        map_io_error(error, fallback)
    }
}

fn map_io_error(error: std::io::Error, fallback: &str) -> LanApiError {
    log::warn!("LAN panel file API error: {error}");
    LanApiError::internal(fallback)
}

#[cfg(test)]
mod tests {
    use std::{env, fs, path::PathBuf};

    use super::{
        prepare_upload_target, preview_file, rename_entry, safe_resolve_path, LanApiPreviewData,
        TEXT_PREVIEW_MAX_BYTES,
    };

    fn make_workspace_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "fluxmint-lan-panel-{}-{}",
            label,
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ))
    }

    #[test]
    fn safe_resolve_path_returns_root_for_empty_input() {
        let root = make_workspace_root("root");
        fs::create_dir_all(&root).unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let resolved = safe_resolve_path(&canonical_root, "", true).unwrap();

        assert_eq!(resolved.absolute_path, canonical_root);
        assert_eq!(resolved.relative_path, "");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn safe_resolve_path_rejects_parent_segments() {
        let root = make_workspace_root("parent");
        fs::create_dir_all(&root).unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let error = safe_resolve_path(&canonical_root, "../secret.txt", true).unwrap_err();

        assert_eq!(error.code, "PATH_FORBIDDEN");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn safe_resolve_path_resolves_existing_nested_path() {
        let root = make_workspace_root("nested");
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::write(root.join("docs").join("readme.md"), b"hello").unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let resolved = safe_resolve_path(&canonical_root, "docs/readme.md", true).unwrap();

        assert!(resolved.absolute_path.ends_with("readme.md"));
        assert_eq!(resolved.relative_path, "docs/readme.md");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn safe_resolve_path_allows_missing_leaf_when_requested() {
        let root = make_workspace_root("missing");
        fs::create_dir_all(root.join("docs")).unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let resolved = safe_resolve_path(&canonical_root, "docs/new-file.txt", false).unwrap();

        assert!(resolved.absolute_path.ends_with("new-file.txt"));
        assert_eq!(resolved.relative_path, "docs/new-file.txt");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn preview_file_returns_too_large_for_big_text() {
        let root = make_workspace_root("preview-large");
        fs::create_dir_all(&root).unwrap();
        let content = vec![b'a'; TEXT_PREVIEW_MAX_BYTES as usize + 1];
        fs::write(root.join("big.txt"), content).unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let preview = preview_file(&canonical_root, "big.txt").unwrap();

        assert!(matches!(preview, LanApiPreviewData::TooLarge { .. }));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn prepare_upload_target_rejects_invalid_name() {
        let root = make_workspace_root("upload-name");
        fs::create_dir_all(&root).unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let error = prepare_upload_target(&canonical_root, Some(""), "../bad.txt").unwrap_err();

        assert_eq!(error.code, "INVALID_NAME");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rename_entry_rejects_same_name_conflict() {
        let root = make_workspace_root("rename-conflict");
        fs::create_dir_all(root.join("docs")).unwrap();
        fs::write(root.join("docs").join("readme.md"), b"hello").unwrap();
        let canonical_root = root.canonicalize().unwrap();

        let error = rename_entry(&canonical_root, "docs/readme.md", "readme.md").unwrap_err();

        assert_eq!(error.code, "NAME_CONFLICT");
        let _ = fs::remove_dir_all(root);
    }
}
