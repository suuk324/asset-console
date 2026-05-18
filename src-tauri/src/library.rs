use chrono::Local;
use image::{ImageBuffer, Rgba};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
use std::{
    collections::{HashMap, HashSet},
    fmt::Write as _,
    fs,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::Command,
    ptr,
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
#[cfg(target_os = "windows")]
use windows::{
    core::{implement, HSTRING, PCWSTR},
    Win32::{
        Foundation::{
            GlobalFree, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS,
            DV_E_FORMATETC, E_NOTIMPL, OLE_E_ADVISENOTSUPPORTED, POINT, SIZE,
        },
        Graphics::Gdi::{
            DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
        },
        System::{
            Com::{
                CoInitializeEx, CoUninitialize, IAdviseSink, IBindCtx, IDataObject,
                IDataObject_Impl, IEnumFORMATETC, IEnumSTATDATA, COINIT_APARTMENTTHREADED,
                DATADIR_GET, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
            Ole::{
                DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize,
                CF_HDROP, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
            },
            SystemServices::MK_LBUTTON,
        },
        UI::{
            Shell::{
                IShellItemImageFactory, SHCreateItemFromParsingName, SHCreateStdEnumFmtEtc,
                ShellExecuteW, DROPFILES, SIIGBF_BIGGERSIZEOK, SIIGBF_SCALEUP,
                SIIGBF_THUMBNAILONLY,
            },
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    },
};

const APP_FOLDER_NAME: &str = "FluxMint Asset Console";
const INDEX_FILENAME: &str = "workspace-index.json";
const HISTORY_FILENAME: &str = "operation-history.json";
const DEFAULT_LANGUAGE: &str = "zh-CN";
const DEFAULT_THEME: &str = "system";
const DEFAULT_IMPORT_MODE: &str = "manual";
const RECYCLE_BIN_FOLDER_NAME: &str = "recycle-bin";
const PREVIEW_CACHE_FOLDER_NAME: &str = "native-previews";
const MAX_RECENT_TARGET_FOLDERS: usize = 8;
const MAX_OPERATION_HISTORY: usize = 120;
const TEXT_REFERENCE_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "json", "yml", "yaml", "csv", "html", "htm", "css", "scss", "js",
    "jsx", "ts", "tsx", "svg", "xml",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub discipline: String,
    pub status: String,
    pub root_path: String,
    pub last_opened_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub relative_path: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub project_id: String,
    pub folder_id: Option<String>,
    pub relative_folder_path: String,
    pub relative_path: String,
    pub managed_path: String,
    pub name: String,
    pub format: String,
    pub kind: String,
    pub preview_mode: String,
    pub tags: Vec<String>,
    pub file_size_bytes: u64,
    pub file_size_label: String,
    pub original_path: String,
    pub received_at: String,
    pub imported_at: String,
    pub last_modified_at: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleRecord {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub keywords: Vec<String>,
    pub formats: Vec<String>,
    pub target_project_id: String,
    pub target_folder_id: Option<String>,
    pub target_relative_path: String,
    pub suggested_tags: Vec<String>,
    pub confidence: f64,
    pub note: String,
    pub needs_attention: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRecord {
    pub language: String,
    pub theme: String,
    pub default_import_mode: String,
    pub favorite_folders: Vec<FolderShortcutRecord>,
    pub recent_target_folders: Vec<FolderShortcutRecord>,
}

impl Default for SettingsRecord {
    fn default() -> Self {
        Self {
            language: DEFAULT_LANGUAGE.into(),
            theme: DEFAULT_THEME.into(),
            default_import_mode: DEFAULT_IMPORT_MODE.into(),
            favorite_folders: Vec::new(),
            recent_target_folders: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct FolderShortcutRecord {
    pub project_id: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarningRecord {
    pub kind: String,
    pub message: String,
    pub existing_asset_id: Option<String>,
    pub existing_asset_name: Option<String>,
    pub existing_managed_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoImportedFileRecord {
    pub asset_id: String,
    pub source_path: String,
    pub imported_path: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchRecord {
    pub batch_id: String,
    pub imported_at: String,
    pub files: Vec<UndoImportedFileRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleEntryRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub kind: String,
    pub original_path: String,
    pub recycle_path: String,
    pub deleted_at: String,
    pub size_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIndex {
    pub projects: Vec<ProjectRecord>,
    pub folders: Vec<FolderRecord>,
    pub assets: Vec<AssetRecord>,
    pub rules: Vec<RuleRecord>,
    pub settings: SettingsRecord,
    pub import_history: Vec<ImportBatchRecord>,
    pub recycle_entries: Vec<RecycleEntryRecord>,
}

impl Default for WorkspaceIndex {
    fn default() -> Self {
        Self {
            projects: Vec::new(),
            folders: Vec::new(),
            assets: Vec::new(),
            rules: Vec::new(),
            settings: SettingsRecord::default(),
            import_history: Vec::new(),
            recycle_entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshotResponse {
    pub projects: Vec<ProjectRecord>,
    pub folders: Vec<FolderRecord>,
    pub assets: Vec<AssetRecord>,
    pub rules: Vec<RuleRecord>,
    pub settings: SettingsRecord,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub root_path: String,
    pub discipline: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectResponse {
    pub project: ProjectRecord,
    pub folders: Vec<FolderRecord>,
    pub assets: Vec<AssetRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImportRequest {
    pub paths: Vec<String>,
    pub mode: String,
    pub current_project_id: Option<String>,
    pub current_folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidateRecord {
    pub id: String,
    pub source_path: String,
    pub name: String,
    pub extension: String,
    pub kind: String,
    pub preview_mode: String,
    pub file_size_bytes: u64,
    pub file_size_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAssignmentRecord {
    pub candidate_id: String,
    pub source_path: String,
    pub target_project_id: String,
    pub target_folder_id: Option<String>,
    pub target_relative_path: String,
    pub conflict_strategy: String,
    pub suggested_tags: Vec<String>,
    pub reason: String,
    pub confidence: f64,
    pub requires_confirmation: bool,
    pub warnings: Vec<ImportWarningRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeImportResponse {
    pub candidates: Vec<ImportCandidateRecord>,
    pub assignments: Vec<ImportAssignmentRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitImportRequest {
    pub assignments: Vec<ImportAssignmentRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitImportResponse {
    pub assets: Vec<AssetRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoImportRecord {
    pub batch_id: String,
    pub asset_ids: Vec<String>,
    pub imported_at: String,
    pub restored_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoImportResponse {
    pub assets: Vec<AssetRecord>,
    pub restored: Option<UndoImportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationHistoryItemRecord {
    pub id: String,
    pub action_type: String,
    pub detail: String,
    pub timestamp: String,
    pub reversible: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationHistoryResponse {
    pub actions: Vec<OperationHistoryItemRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoActionResponse {
    pub undone: Option<OperationHistoryItemRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBinResponse {
    pub entries: Vec<RecycleEntryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OperationHistoryEntry {
    #[serde(flatten)]
    pub item: OperationHistoryItemRecord,
    pub undo: Option<UndoOperationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveUndoRecord {
    pub asset_id: String,
    pub project_id: String,
    pub from_path: String,
    pub to_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteUndoRecord {
    pub asset_id: String,
    pub project_id: String,
    pub original_path: String,
    pub recycle_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum UndoOperationRecord {
    Import {
        batch_id: String,
        files: Vec<UndoImportedFileRecord>,
    },
    Move {
        files: Vec<MoveUndoRecord>,
    },
    Rename {
        asset_id: String,
        project_id: String,
        from_path: String,
        to_path: String,
        from_relative_path: String,
        to_relative_path: String,
    },
    Delete {
        files: Vec<DeleteUndoRecord>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameAssetRequest {
    pub asset_id: String,
    pub next_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameAssetResponse {
    pub asset: AssetRecord,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveAssetsRequest {
    pub asset_ids: Vec<String>,
    pub target_folder_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAssetsRequest {
    pub asset_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleBinMutationRequest {
    pub entry_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMutationResponse {
    pub assets: Vec<AssetRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRuleRequest {
    pub rule: RuleRecord,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRuleResponse {
    pub rule: RuleRecord,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteRuleRequest {
    pub rule_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettingsRequest {
    pub language: String,
    pub theme: String,
    pub default_import_mode: String,
    pub favorite_folders: Vec<FolderShortcutRecord>,
    pub recent_target_folders: Vec<FolderShortcutRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMutationRequest {
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub folder_id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMutationResponse {
    pub folders: Vec<FolderRecord>,
    pub assets: Vec<AssetRecord>,
    pub rules: Vec<RuleRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRequest {
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectFolderResponse {
    pub folders: Vec<FolderRecord>,
    pub assets: Vec<AssetRecord>,
    pub rules: Vec<RuleRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePreviewRequest {
    pub managed_path: String,
    pub fingerprint: String,
    pub format: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFileDragRequest {
    pub managed_paths: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalTargetRequest {
    pub target: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangedPayload {
    pub project_ids: Vec<String>,
}

#[derive(Debug, Clone)]
struct RuleMatch<'a> {
    rule: &'a RuleRecord,
    confidence: f64,
    matched_keywords: Vec<String>,
}

#[derive(Debug, Clone)]
struct FileDescriptor {
    source_path: PathBuf,
    file_name: String,
    extension: String,
    kind: String,
    preview_mode: String,
    file_size_bytes: u64,
}

#[derive(Default)]
pub struct WorkspaceWatchState {
    watchers: Mutex<Vec<RecommendedWatcher>>,
    last_emitted_at: Mutex<Option<Instant>>,
}

#[tauri::command]
pub fn load_workspace(app: AppHandle) -> Result<LibrarySnapshotResponse, String> {
    let mut index = load_workspace_index(&app)?;
    let mut changed = sanitize_workspace_index(&mut index);
    if !index.projects.is_empty() {
        refresh_workspace_folders(&mut index)?;
        changed = true;
    }
    if changed {
        save_workspace_index(&app, &index)?;
    }
    ensure_project_watchers(&app, &index)?;
    Ok(snapshot_from_index(index))
}

#[tauri::command]
pub fn load_operation_history(app: AppHandle) -> Result<OperationHistoryResponse, String> {
    let history = load_operation_history_entries(&app)?;
    Ok(OperationHistoryResponse {
        actions: history.into_iter().map(|entry| entry.item).collect(),
    })
}

#[tauri::command]
pub fn load_recycle_bin(app: AppHandle) -> Result<RecycleBinResponse, String> {
    let mut index = load_workspace_index(&app)?;
    let entry_count = index.recycle_entries.len();
    prune_recycle_entries(&mut index);
    if index.recycle_entries.len() != entry_count {
        save_workspace_index(&app, &index)?;
    }
    Ok(RecycleBinResponse {
        entries: index.recycle_entries,
    })
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    request: CreateProjectRequest,
) -> Result<CreateProjectResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let root_path = PathBuf::from(request.root_path.trim());
    if !root_path.is_dir() {
        return Err("Selected project folder does not exist.".into());
    }

    if index
        .projects
        .iter()
        .any(|project| same_path(Path::new(&project.root_path), &root_path))
    {
        return Err("This folder is already bound to an existing project.".into());
    }

    let project_id = format!(
        "project-{}-{}",
        Local::now().timestamp_nanos_opt().unwrap_or_default(),
        sanitize_for_id(
            &root_path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| "project".into()),
        ),
    );
    let timestamp = now_label();
    let project = ProjectRecord {
        id: project_id.clone(),
        name: request.name.trim().to_string(),
        discipline: request.discipline,
        status: request.status,
        root_path: root_path.to_string_lossy().into_owned(),
        last_opened_at: timestamp.clone(),
        created_at: timestamp,
    };

    index.projects.push(project.clone());
    let (_, folders, assets) = rescan_project_records(&mut index, &project.id)?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;

    Ok(CreateProjectResponse {
        project,
        folders,
        assets,
    })
}

#[tauri::command]
pub fn unbind_project(
    app: AppHandle,
    request: ProjectRequest,
) -> Result<LibrarySnapshotResponse, String> {
    let mut index = load_workspace_index(&app)?;
    let removed_project = find_project(&index.projects, &request.project_id)
        .ok_or_else(|| "Project not found.".to_string())?
        .clone();

    index
        .projects
        .retain(|project| project.id != request.project_id);
    index
        .folders
        .retain(|folder| folder.project_id != request.project_id);
    index
        .assets
        .retain(|asset| asset.project_id != request.project_id);
    index
        .rules
        .retain(|rule| rule.target_project_id != request.project_id);
    index
        .settings
        .favorite_folders
        .retain(|shortcut| shortcut.project_id != request.project_id);
    index
        .settings
        .recent_target_folders
        .retain(|shortcut| shortcut.project_id != request.project_id);

    sanitize_workspace_index(&mut index);
    refresh_rule_attention(&mut index.rules, &index.folders);
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    let _ = emit_workspace_changed(&app, &[removed_project.id]);

    Ok(snapshot_from_index(index))
}

#[tauri::command]
pub fn analyze_import(
    app: AppHandle,
    request: AnalyzeImportRequest,
) -> Result<AnalyzeImportResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    let candidates: Vec<ImportCandidateRecord> = request
        .paths
        .iter()
        .enumerate()
        .filter_map(|(offset, raw_path)| {
            describe_file(Path::new(raw_path))
                .ok()
                .map(|descriptor| (offset, descriptor))
        })
        .map(|(offset, descriptor)| ImportCandidateRecord {
            id: format!("candidate-{}-{offset}", Local::now().timestamp_millis()),
            source_path: descriptor.source_path.to_string_lossy().into_owned(),
            name: descriptor.file_name.clone(),
            extension: descriptor.extension.clone(),
            kind: descriptor.kind.clone(),
            preview_mode: descriptor.preview_mode.clone(),
            file_size_bytes: descriptor.file_size_bytes,
            file_size_label: format_bytes(descriptor.file_size_bytes),
        })
        .collect();

    let current_project = request
        .current_project_id
        .as_deref()
        .and_then(|id| find_project(&index.projects, id));
    let current_folder = request
        .current_folder_id
        .as_deref()
        .and_then(|id| find_folder(&index.folders, id));

    let mut assignments = Vec::new();
    for candidate in &candidates {
        let descriptor = describe_file(Path::new(&candidate.source_path))?;
        if let Some(assignment) = choose_assignment(
            &descriptor,
            &request.mode,
            current_project,
            current_folder,
            &index.projects,
            &index.folders,
            &index.rules,
        ) {
            assignments.push(ImportAssignmentRecord {
                candidate_id: candidate.id.clone(),
                source_path: candidate.source_path.clone(),
                target_project_id: assignment.target_project_id,
                target_folder_id: assignment.target_folder_id,
                target_relative_path: assignment.target_relative_path,
                conflict_strategy: assignment.conflict_strategy,
                suggested_tags: assignment.suggested_tags,
                reason: assignment.reason,
                confidence: assignment.confidence,
                requires_confirmation: assignment.requires_confirmation,
                warnings: assignment.warnings,
            });
        }
    }

    Ok(AnalyzeImportResponse {
        candidates,
        assignments,
    })
}

#[tauri::command]
pub fn commit_import(
    app: AppHandle,
    request: CommitImportRequest,
) -> Result<CommitImportResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let recycle_dir = recycle_bin_dir(&app)?;
    fs::create_dir_all(&recycle_dir).map_err(|error| error.to_string())?;

    let mut imported_assets = Vec::new();
    let mut changed_project_ids = HashSet::new();
    let batch_id = format!("batch-{}", Local::now().timestamp_millis());
    let mut batch_files = Vec::new();
    let mut touched_shortcuts = Vec::new();
    for assignment in &request.assignments {
        let project = find_project(&index.projects, &assignment.target_project_id)
            .ok_or_else(|| "Target project no longer exists.".to_string())?;
        changed_project_ids.insert(project.id.clone());

        let target_folder = resolve_target_folder(project, &index.folders, assignment)?;
        let source_path = PathBuf::from(&assignment.source_path);
        if !source_path.is_file() {
            return Err(format!(
                "Source file is missing: {}",
                assignment.source_path
            ));
        }

        let file_name = source_path
            .file_name()
            .ok_or_else(|| "Imported file is missing a valid file name.".to_string())?;
        let destination = resolve_import_destination(
            &target_folder.join_path,
            file_name,
            &assignment.conflict_strategy,
            &recycle_dir,
        )?;
        if destination == ImportDestination::Skip {
            continue;
        }
        let destination = destination
            .into_path()
            .ok_or_else(|| "Target import path is invalid.".to_string())?;
        move_source_file(&source_path, &destination)?;

        let metadata = fs::metadata(&destination).map_err(|error| error.to_string())?;
        let descriptor = describe_file(&destination)?;
        let asset = AssetRecord {
            id: format!("asset-{}", Local::now().timestamp_millis()),
            project_id: project.id.clone(),
            folder_id: Some(target_folder.folder.id.clone()),
            relative_folder_path: target_folder.folder.relative_path.clone(),
            relative_path: relative_to_root(Path::new(&project.root_path), &destination),
            managed_path: destination.to_string_lossy().into_owned(),
            name: descriptor.file_name,
            format: descriptor.extension.to_uppercase(),
            kind: descriptor.kind,
            preview_mode: descriptor.preview_mode,
            tags: normalized_tags(&assignment.suggested_tags),
            file_size_bytes: metadata.len(),
            file_size_label: format_bytes(metadata.len()),
            original_path: assignment.source_path.clone(),
            received_at: now_label(),
            imported_at: now_label(),
            last_modified_at: modified_label(&destination)?,
            fingerprint: asset_fingerprint(&destination, metadata.len())?,
        };

        index.assets.retain(|existing| {
            existing.id != asset.id && existing.managed_path != asset.managed_path
        });
        batch_files.push(UndoImportedFileRecord {
            asset_id: asset.id.clone(),
            source_path: assignment.source_path.clone(),
            imported_path: asset.managed_path.clone(),
            project_id: asset.project_id.clone(),
        });
        index.assets.push(asset.clone());
        imported_assets.push(asset);
        touched_shortcuts.push(FolderShortcutRecord {
            project_id: project.id.clone(),
            relative_path: target_folder.folder.relative_path.clone(),
        });
    }

    if !batch_files.is_empty() {
        let history_files = batch_files.clone();
        index.import_history.insert(
            0,
            ImportBatchRecord {
                batch_id: batch_id.clone(),
                imported_at: now_label(),
                files: batch_files,
            },
        );
        if index.import_history.len() > 20 {
            index.import_history.truncate(20);
        }
        append_operation_history_entry(
            &app,
            operation_history_entry(
                "import_files",
                localized_file_action_detail(
                    &index.settings.language,
                    "导入",
                    "Imported",
                    imported_assets.len(),
                ),
                Some(UndoOperationRecord::Import {
                    batch_id: batch_id.clone(),
                    files: history_files,
                }),
            ),
        )?;
    }

    touch_recent_shortcuts(&mut index.settings.recent_target_folders, touched_shortcuts);

    save_workspace_index(&app, &index)?;
    emit_workspace_changed(
        &app,
        &changed_project_ids.into_iter().collect::<Vec<String>>(),
    )?;
    Ok(CommitImportResponse {
        assets: imported_assets,
    })
}

#[tauri::command]
pub fn undo_last_import(app: AppHandle) -> Result<UndoImportResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    let Some(batch) = index.import_history.first().cloned() else {
        return Ok(UndoImportResponse {
            assets: index.assets,
            restored: None,
        });
    };

    let mut restored_count = 0usize;
    let mut changed_project_ids = HashSet::new();
    for entry in &batch.files {
        let imported_path = PathBuf::from(&entry.imported_path);
        if !imported_path.is_file() {
            continue;
        }

        let original_path = PathBuf::from(&entry.source_path);
        if let Some(parent) = original_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        move_file_back(&imported_path, &original_path)?;
        restored_count += 1;
        changed_project_ids.insert(entry.project_id.clone());
    }

    index.import_history.remove(0);
    rescan_projects(&mut index, changed_project_ids.iter().cloned())?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(
        &app,
        &changed_project_ids.into_iter().collect::<Vec<String>>(),
    )?;

    Ok(UndoImportResponse {
        assets: index.assets.clone(),
        restored: Some(UndoImportRecord {
            batch_id: batch.batch_id,
            asset_ids: batch
                .files
                .iter()
                .map(|file| file.asset_id.clone())
                .collect(),
            imported_at: batch.imported_at,
            restored_count,
        }),
    })
}

#[tauri::command]
pub fn resolve_native_preview(
    app: AppHandle,
    request: NativePreviewRequest,
) -> Result<Option<String>, String> {
    let source_path = PathBuf::from(request.managed_path.trim());
    if !source_path.is_file() {
        return Ok(None);
    }

    let extension = request.format.trim().to_lowercase();
    if !matches!(extension.as_str(), "bip" | "ksp") {
        return Ok(None);
    }

    let preview_dir = preview_cache_dir(&app)?;
    fs::create_dir_all(&preview_dir).map_err(|error| error.to_string())?;
    let preview_path = preview_dir.join(format!("{}-{}.png", request.fingerprint, extension));
    if preview_path.is_file() {
        return Ok(Some(preview_path.to_string_lossy().into_owned()));
    }

    if extract_native_thumbnail(&source_path, &preview_path)? {
        return Ok(Some(preview_path.to_string_lossy().into_owned()));
    }

    Ok(None)
}

#[tauri::command]
pub fn start_native_file_drag(
    app: AppHandle,
    request: NativeFileDragRequest,
) -> Result<(), String> {
    let managed_paths = collect_native_drag_paths(&request.managed_paths)?;

    let (sender, receiver) = mpsc::channel();
    app.run_on_main_thread(move || {
        let result = start_native_file_drag_impl(&managed_paths);
        let _ = sender.send(result);
    })
    .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|_| "Failed to receive the native drag result from the main thread.".to_string())?
}

#[tauri::command]
pub fn open_managed_path(request: ManagedPathRequest) -> Result<(), String> {
    let path = PathBuf::from(request.path.trim());
    if !path.exists() {
        return Err("The requested file no longer exists.".into());
    }

    open_path_with_system_default(&path)
}

#[tauri::command]
pub fn open_external_target(request: ExternalTargetRequest) -> Result<(), String> {
    let target = request.target.trim();
    if target.is_empty() {
        return Err("The requested target is empty.".into());
    }

    open_target_with_system_default(target)
}

#[tauri::command]
pub fn reveal_managed_path(request: ManagedPathRequest) -> Result<(), String> {
    let path = PathBuf::from(request.path.trim());
    if !path.exists() {
        return Err("The requested file no longer exists.".into());
    }

    reveal_path_in_system_explorer(&path)
}

#[tauri::command]
pub fn undo_last_action(app: AppHandle) -> Result<UndoActionResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let mut history = load_operation_history_entries(&app)?;

    let Some((history_index, entry)) = history
        .iter()
        .enumerate()
        .find(|(_, entry)| entry.item.reversible && entry.undo.is_some())
        .map(|(index, entry)| (index, entry.clone()))
    else {
        return Ok(UndoActionResponse { undone: None });
    };

    let undo_record = entry
        .undo
        .clone()
        .ok_or_else(|| "Undo data is missing for this operation.".to_string())?;
    let mut changed_project_ids = HashSet::new();
    let restored_count = match &undo_record {
        UndoOperationRecord::Import { batch_id, files } => {
            let mut restored = 0usize;
            for file in files.iter().rev() {
                let imported_path = PathBuf::from(&file.imported_path);
                if !imported_path.is_file() {
                    continue;
                }
                move_file_back(&imported_path, Path::new(&file.source_path))?;
                changed_project_ids.insert(file.project_id.clone());
                restored += 1;
            }
            index
                .import_history
                .retain(|batch| batch.batch_id != *batch_id);
            restored
        }
        UndoOperationRecord::Move { files } => {
            let mut restored = 0usize;
            for file in files.iter().rev() {
                let moved_path = PathBuf::from(&file.to_path);
                if !moved_path.is_file() {
                    continue;
                }
                move_file_back(&moved_path, Path::new(&file.from_path))?;
                changed_project_ids.insert(file.project_id.clone());
                restored += 1;
            }
            restored
        }
        UndoOperationRecord::Rename {
            project_id,
            from_path,
            to_path,
            from_relative_path,
            to_relative_path,
            ..
        } => {
            let current_path = PathBuf::from(to_path);
            if !current_path.is_file() {
                0
            } else {
                let original_path = PathBuf::from(from_path);
                if original_path.exists() && !same_path(&original_path, &current_path) {
                    return Err(
                        "Cannot undo rename because the original file path already exists.".into(),
                    );
                }
                let project = find_project(&index.projects, project_id)
                    .ok_or_else(|| "Project for this file no longer exists.".to_string())?;
                let reference_targets = collect_reference_targets(
                    Path::new(&project.root_path),
                    to_relative_path,
                    from_relative_path,
                )?;
                fs::rename(&current_path, &original_path).map_err(|error| error.to_string())?;
                if let Err(error) = rewrite_references(&reference_targets) {
                    let _ = fs::rename(&original_path, &current_path);
                    return Err(error);
                }
                changed_project_ids.insert(project_id.clone());
                1
            }
        }
        UndoOperationRecord::Delete { files } => {
            let mut restored = 0usize;
            for file in files.iter().rev() {
                let recycle_path = PathBuf::from(&file.recycle_path);
                if !recycle_path.is_file() {
                    continue;
                }
                move_file_back(&recycle_path, Path::new(&file.original_path))?;
                changed_project_ids.insert(file.project_id.clone());
                restored += 1;
            }
            restored
        }
    };

    history.remove(history_index);
    history.insert(
        0,
        undo_history_entry(
            &index.settings.language,
            &entry.item.action_type,
            restored_count,
            &entry.item.detail,
        ),
    );
    if history.len() > MAX_OPERATION_HISTORY {
        history.truncate(MAX_OPERATION_HISTORY);
    }

    rescan_projects(&mut index, changed_project_ids.iter().cloned())?;
    prune_recycle_entries(&mut index);
    save_workspace_index(&app, &index)?;
    save_operation_history_entries(&app, &history)?;
    ensure_project_watchers(&app, &index)?;
    if !changed_project_ids.is_empty() {
        emit_workspace_changed(
            &app,
            &changed_project_ids.into_iter().collect::<Vec<String>>(),
        )?;
    }

    Ok(UndoActionResponse {
        undone: Some(entry.item),
    })
}

#[tauri::command]
pub fn rename_asset(
    app: AppHandle,
    request: RenameAssetRequest,
) -> Result<RenameAssetResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    let position = index
        .assets
        .iter()
        .position(|asset| asset.id == request.asset_id)
        .ok_or_else(|| "Asset not found.".to_string())?;

    let current_asset = index
        .assets
        .get(position)
        .cloned()
        .ok_or_else(|| "Asset not found.".to_string())?;

    let current_path = PathBuf::from(&current_asset.managed_path);
    if !current_path.is_file() {
        return Err("Asset file no longer exists on disk.".into());
    }

    let sanitized_name = request.next_name.trim();
    if sanitized_name.is_empty() {
        return Err("File name cannot be empty.".into());
    }

    let parent_dir = current_path
        .parent()
        .ok_or_else(|| "Unable to resolve parent folder.".to_string())?;
    let next_path = parent_dir.join(sanitized_name);
    if next_path.exists() && !same_path(&current_path, &next_path) {
        return Err("A file with the same name already exists in this folder.".into());
    }

    let project = find_project(&index.projects, &current_asset.project_id)
        .cloned()
        .ok_or_else(|| "Project for this asset no longer exists.".to_string())?;

    let reference_targets = collect_reference_targets(
        Path::new(&project.root_path),
        &current_asset.relative_path,
        &relative_to_root(Path::new(&project.root_path), &next_path),
    )?;
    let next_relative_path = relative_to_root(Path::new(&project.root_path), &next_path);

    fs::rename(&current_path, &next_path).map_err(|error| error.to_string())?;

    if let Err(error) = rewrite_references(&reference_targets) {
        let _ = fs::rename(&next_path, &current_path);
        return Err(error);
    }

    let (_, _, assets) = rescan_project_records(&mut index, &project.id)?;
    let updated_asset = assets
        .iter()
        .find(|asset| asset.relative_path == next_relative_path)
        .cloned()
        .ok_or_else(|| "Renamed asset could not be re-indexed.".to_string())?;

    append_operation_history_entry(
        &app,
        operation_history_entry(
            "rename_asset",
            localized_named_action_detail(
                &index.settings.language,
                "重命名",
                "Renamed",
                &updated_asset.name,
            ),
            Some(UndoOperationRecord::Rename {
                asset_id: updated_asset.id.clone(),
                project_id: project.id.clone(),
                from_path: current_path.to_string_lossy().into_owned(),
                to_path: next_path.to_string_lossy().into_owned(),
                from_relative_path: current_asset.relative_path.clone(),
                to_relative_path: next_relative_path,
            }),
        ),
    )?;

    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(&app, &[project.id.clone()])?;
    Ok(RenameAssetResponse {
        asset: updated_asset,
    })
}

#[tauri::command]
pub fn move_assets(
    app: AppHandle,
    request: MoveAssetsRequest,
) -> Result<AssetMutationResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    if request.asset_ids.is_empty() {
        return Ok(AssetMutationResponse {
            assets: index.assets.clone(),
        });
    }

    let target_folder = find_folder(&index.folders, &request.target_folder_id)
        .cloned()
        .ok_or_else(|| "Target folder not found.".to_string())?;
    let project = find_project(&index.projects, &target_folder.project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;
    let target_path = Path::new(&project.root_path).join(&target_folder.relative_path);

    let mut changed_project_ids = HashSet::new();
    let mut moved_count = 0usize;
    let mut moved_files = Vec::new();
    for asset_id in &request.asset_ids {
        let Some(position) = index.assets.iter().position(|asset| &asset.id == asset_id) else {
            continue;
        };
        let asset = index.assets[position].clone();
        if asset.project_id != project.id {
            return Err("Cross-project move is not supported in this version.".into());
        }

        let current_path = PathBuf::from(&asset.managed_path);
        if !current_path.is_file() {
            continue;
        }
        if asset.folder_id.as_deref() == Some(target_folder.id.as_str()) {
            continue;
        }

        let file_name = current_path
            .file_name()
            .ok_or_else(|| "Asset file name is missing.".to_string())?;
        let next_path = unique_destination(&target_path, file_name);
        move_source_file(&current_path, &next_path)?;
        moved_files.push(MoveUndoRecord {
            asset_id: asset.id.clone(),
            project_id: project.id.clone(),
            from_path: current_path.to_string_lossy().into_owned(),
            to_path: next_path.to_string_lossy().into_owned(),
        });

        let updated_asset = &mut index.assets[position];
        updated_asset.folder_id = Some(target_folder.id.clone());
        updated_asset.relative_folder_path = target_folder.relative_path.clone();
        updated_asset.relative_path = relative_to_root(Path::new(&project.root_path), &next_path);
        updated_asset.managed_path = next_path.to_string_lossy().into_owned();
        updated_asset.last_modified_at = modified_label(&next_path)?;
        updated_asset.fingerprint = asset_fingerprint(
            &next_path,
            fs::metadata(&next_path)
                .map_err(|error| error.to_string())?
                .len(),
        )?;

        changed_project_ids.insert(project.id.clone());
        moved_count += 1;
    }

    if moved_count > 0 {
        let _ = rescan_project_records(&mut index, &project.id)?;
        touch_recent_shortcuts(
            &mut index.settings.recent_target_folders,
            vec![FolderShortcutRecord {
                project_id: project.id.clone(),
                relative_path: target_folder.relative_path.clone(),
            }],
        );
        append_operation_history_entry(
            &app,
            operation_history_entry(
                "move_asset",
                localized_file_action_detail(
                    &index.settings.language,
                    "移动",
                    "Moved",
                    moved_count,
                ),
                Some(UndoOperationRecord::Move { files: moved_files }),
            ),
        )?;
    }

    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(
        &app,
        &changed_project_ids.into_iter().collect::<Vec<String>>(),
    )?;

    Ok(AssetMutationResponse {
        assets: index.assets.clone(),
    })
}

#[tauri::command]
pub fn delete_assets(
    app: AppHandle,
    request: DeleteAssetsRequest,
) -> Result<AssetMutationResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    if request.asset_ids.is_empty() {
        return Ok(AssetMutationResponse {
            assets: index.assets.clone(),
        });
    }

    let recycle_dir = recycle_bin_dir(&app)?;
    fs::create_dir_all(&recycle_dir).map_err(|error| error.to_string())?;

    let mut changed_project_ids = HashSet::new();
    let mut deleted_count = 0usize;
    let mut deleted_files = Vec::new();
    for asset_id in &request.asset_ids {
        let Some(asset) = index
            .assets
            .iter()
            .find(|entry| &entry.id == asset_id)
            .cloned()
        else {
            continue;
        };
        let source_path = PathBuf::from(&asset.managed_path);
        if !source_path.is_file() {
            continue;
        }

        let recycle_target = recycle_destination(&recycle_dir, &source_path)?;
        move_source_file(&source_path, &recycle_target)?;
        deleted_files.push(DeleteUndoRecord {
            asset_id: asset.id.clone(),
            project_id: asset.project_id.clone(),
            original_path: source_path.to_string_lossy().into_owned(),
            recycle_path: recycle_target.to_string_lossy().into_owned(),
        });
        index.recycle_entries.insert(
            0,
            RecycleEntryRecord {
                id: format!(
                    "recycle-{}-{}",
                    Local::now().timestamp_nanos_opt().unwrap_or_default(),
                    sanitize_for_id(&asset.name),
                ),
                project_id: Some(asset.project_id.clone()),
                name: asset.name.clone(),
                kind: "file".into(),
                original_path: source_path.to_string_lossy().into_owned(),
                recycle_path: recycle_target.to_string_lossy().into_owned(),
                deleted_at: now_label(),
                size_label: asset.file_size_label.clone(),
            },
        );
        changed_project_ids.insert(asset.project_id.clone());
        deleted_count += 1;
    }

    if deleted_count > 0 {
        append_operation_history_entry(
            &app,
            operation_history_entry(
                "delete_assets",
                localized_file_action_detail(
                    &index.settings.language,
                    "移入回收区",
                    "Moved to recycle bin",
                    deleted_count,
                ),
                Some(UndoOperationRecord::Delete {
                    files: deleted_files,
                }),
            ),
        )?;
    }

    rescan_projects(&mut index, changed_project_ids.iter().cloned())?;
    prune_recycle_entries(&mut index);
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(
        &app,
        &changed_project_ids.into_iter().collect::<Vec<String>>(),
    )?;

    Ok(AssetMutationResponse {
        assets: index.assets.clone(),
    })
}

#[tauri::command]
pub fn restore_recycle_entries(
    app: AppHandle,
    request: RecycleBinMutationRequest,
) -> Result<RecycleBinResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    prune_recycle_entries(&mut index);

    if request.entry_ids.is_empty() {
        return Ok(RecycleBinResponse {
            entries: index.recycle_entries,
        });
    }

    let requested_ids: HashSet<_> = request.entry_ids.iter().cloned().collect();
    let entries_to_restore: Vec<_> = index
        .recycle_entries
        .iter()
        .filter(|entry| requested_ids.contains(&entry.id))
        .cloned()
        .collect();

    let mut changed_project_ids = HashSet::new();
    let mut restored_count = 0usize;
    let mut restored_paths = HashSet::new();

    for entry in &entries_to_restore {
        let recycle_path = PathBuf::from(&entry.recycle_path);
        if !recycle_path.exists() {
            restored_paths.insert(entry.recycle_path.clone());
            continue;
        }

        let original_path = PathBuf::from(&entry.original_path);
        let restored_path = restore_recycle_path(&recycle_path, &original_path)?;
        restored_paths.insert(entry.recycle_path.clone());
        if let Some(project_id) = &entry.project_id {
            changed_project_ids.insert(project_id.clone());
        }
        restored_count += 1;

        let _ = restored_path;
    }

    index
        .recycle_entries
        .retain(|entry| !restored_paths.contains(&entry.recycle_path));
    rescan_projects(&mut index, changed_project_ids.iter().cloned())?;
    prune_recycle_entries(&mut index);
    save_workspace_index(&app, &index)?;
    remove_recycle_paths_from_history(&app, &restored_paths)?;
    ensure_project_watchers(&app, &index)?;
    if !changed_project_ids.is_empty() {
        emit_workspace_changed(
            &app,
            &changed_project_ids.into_iter().collect::<Vec<String>>(),
        )?;
    }

    if restored_count > 0 {
        append_operation_history_entry(
            &app,
            operation_history_entry(
                "restore_recycle",
                localized_entry_action_detail(
                    &index.settings.language,
                    "已从回收站恢复",
                    "Restored from recycle bin",
                    restored_count,
                ),
                None,
            ),
        )?;
    }

    Ok(RecycleBinResponse {
        entries: index.recycle_entries,
    })
}

#[tauri::command]
pub fn empty_recycle_bin(
    app: AppHandle,
    request: RecycleBinMutationRequest,
) -> Result<RecycleBinResponse, String> {
    let mut index = load_workspace_index(&app)?;
    prune_recycle_entries(&mut index);

    let entry_ids: HashSet<_> = if request.entry_ids.is_empty() {
        index
            .recycle_entries
            .iter()
            .map(|entry| entry.id.clone())
            .collect()
    } else {
        request.entry_ids.iter().cloned().collect()
    };

    if entry_ids.is_empty() {
        return Ok(RecycleBinResponse {
            entries: index.recycle_entries,
        });
    }

    let mut removed_paths = HashSet::new();
    let mut removed_count = 0usize;
    for entry in index
        .recycle_entries
        .iter()
        .filter(|entry| entry_ids.contains(&entry.id))
    {
        let recycle_path = PathBuf::from(&entry.recycle_path);
        if recycle_path.is_dir() {
            fs::remove_dir_all(&recycle_path).map_err(|error| error.to_string())?;
        } else if recycle_path.is_file() {
            fs::remove_file(&recycle_path).map_err(|error| error.to_string())?;
        }
        removed_paths.insert(entry.recycle_path.clone());
        removed_count += 1;
    }

    index
        .recycle_entries
        .retain(|entry| !removed_paths.contains(&entry.recycle_path));
    save_workspace_index(&app, &index)?;
    remove_recycle_paths_from_history(&app, &removed_paths)?;

    if removed_count > 0 {
        append_operation_history_entry(
            &app,
            operation_history_entry(
                "empty_recycle",
                localized_entry_action_detail(
                    &index.settings.language,
                    "已清理回收站中的",
                    "Cleared",
                    removed_count,
                ),
                None,
            ),
        )?;
    }

    Ok(RecycleBinResponse {
        entries: index.recycle_entries,
    })
}

#[tauri::command]
pub fn save_rule(app: AppHandle, request: SaveRuleRequest) -> Result<SaveRuleResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);

    let mut next_rule = request.rule;
    next_rule.needs_attention = !folder_reference_exists(&index.folders, &next_rule);

    if let Some(existing) = index.rules.iter_mut().find(|rule| rule.id == next_rule.id) {
        *existing = next_rule.clone();
    } else {
        index.rules.push(next_rule.clone());
    }

    save_workspace_index(&app, &index)?;
    Ok(SaveRuleResponse { rule: next_rule })
}

#[tauri::command]
pub fn delete_rule(
    app: AppHandle,
    request: DeleteRuleRequest,
) -> Result<LibrarySnapshotResponse, String> {
    let mut index = load_workspace_index(&app)?;
    index.rules.retain(|rule| rule.id != request.rule_id);
    save_workspace_index(&app, &index)?;
    Ok(snapshot_from_index(index))
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    request: SaveSettingsRequest,
) -> Result<SettingsRecord, String> {
    let mut index = load_workspace_index(&app)?;
    index.settings = SettingsRecord {
        language: request.language,
        theme: request.theme,
        default_import_mode: request.default_import_mode,
        favorite_folders: request.favorite_folders,
        recent_target_folders: request.recent_target_folders,
    };
    save_workspace_index(&app, &index)?;
    Ok(index.settings)
}

#[tauri::command]
pub fn create_folder(
    app: AppHandle,
    request: FolderMutationRequest,
) -> Result<FolderMutationResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let project_id = request
        .project_id
        .ok_or_else(|| "Project id is required.".to_string())?;
    let name = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Folder name is required.".to_string())?;
    let project = find_project(&index.projects, &project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;

    let parent_folder = request
        .parent_id
        .as_deref()
        .and_then(|id| find_folder(&index.folders, id).cloned());

    let relative_path = match &parent_folder {
        Some(parent) if parent.relative_path.is_empty() => name.to_string(),
        Some(parent) => format!("{}/{}", parent.relative_path, name),
        None => name.to_string(),
    };

    let absolute_path = Path::new(&project.root_path).join(&relative_path);
    if absolute_path.exists() {
        return Err("Folder already exists.".into());
    }

    fs::create_dir_all(&absolute_path).map_err(|error| error.to_string())?;
    let (_, folders, assets) = rescan_project_records(&mut index, &project.id)?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(&app, &[project.id.clone()])?;

    Ok(FolderMutationResponse {
        folders,
        assets,
        rules: index.rules,
    })
}

#[tauri::command]
pub fn rename_folder(
    app: AppHandle,
    request: FolderMutationRequest,
) -> Result<FolderMutationResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let folder_id = request
        .folder_id
        .ok_or_else(|| "Folder id is required.".to_string())?;
    let next_name = request
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Folder name is required.".to_string())?;

    let folder = find_folder(&index.folders, &folder_id)
        .cloned()
        .ok_or_else(|| "Folder not found.".to_string())?;
    if folder.parent_id.is_none() {
        return Err("Project root folder cannot be renamed here.".into());
    }
    let project = find_project(&index.projects, &folder.project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;
    let current_path = Path::new(&project.root_path).join(&folder.relative_path);
    let parent_relative = Path::new(&folder.relative_path)
        .parent()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let next_relative = if parent_relative.is_empty() {
        next_name.to_string()
    } else {
        format!("{parent_relative}/{next_name}")
    };
    let next_path = Path::new(&project.root_path).join(&next_relative);
    if next_path.exists() {
        return Err("Folder already exists.".into());
    }

    fs::rename(&current_path, &next_path).map_err(|error| error.to_string())?;
    let (_, folders, assets) = rescan_project_records(&mut index, &project.id)?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(&app, &[project.id.clone()])?;

    Ok(FolderMutationResponse {
        folders,
        assets,
        rules: index.rules,
    })
}

#[tauri::command]
pub fn delete_folder(
    app: AppHandle,
    request: FolderMutationRequest,
) -> Result<FolderMutationResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let folder_id = request
        .folder_id
        .ok_or_else(|| "Folder id is required.".to_string())?;
    let folder = find_folder(&index.folders, &folder_id)
        .cloned()
        .ok_or_else(|| "Folder not found.".to_string())?;
    if folder.parent_id.is_none() {
        return Err("Project root folder cannot be deleted.".into());
    }
    let project = find_project(&index.projects, &folder.project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;
    let folder_path = Path::new(&project.root_path).join(&folder.relative_path);
    if folder_path.is_dir() {
        let recycle_dir = recycle_bin_dir(&app)?;
        fs::create_dir_all(&recycle_dir).map_err(|error| error.to_string())?;
        let recycle_target = recycle_destination(&recycle_dir, &folder_path)?;
        move_path_to_recycle(&folder_path, &recycle_target)?;
        index.recycle_entries.insert(
            0,
            RecycleEntryRecord {
                id: format!(
                    "recycle-{}-{}",
                    Local::now().timestamp_nanos_opt().unwrap_or_default(),
                    sanitize_for_id(&folder.name),
                ),
                project_id: Some(folder.project_id.clone()),
                name: folder.name.clone(),
                kind: "folder".into(),
                original_path: folder_path.to_string_lossy().into_owned(),
                recycle_path: recycle_target.to_string_lossy().into_owned(),
                deleted_at: now_label(),
                size_label: if index.settings.language == DEFAULT_LANGUAGE {
                    "文件夹".into()
                } else {
                    "Folder".into()
                },
            },
        );
    }

    let (_, folders, assets) = rescan_project_records(&mut index, &project.id)?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;
    emit_workspace_changed(&app, &[project.id.clone()])?;

    Ok(FolderMutationResponse {
        folders,
        assets,
        rules: index.rules,
    })
}

#[tauri::command]
pub fn rescan_project(
    app: AppHandle,
    request: ProjectRequest,
) -> Result<OpenProjectFolderResponse, String> {
    let mut index = load_workspace_index(&app)?;
    sanitize_workspace_index(&mut index);
    let (_, folders, assets) = rescan_project_records(&mut index, &request.project_id)?;
    save_workspace_index(&app, &index)?;
    ensure_project_watchers(&app, &index)?;

    Ok(OpenProjectFolderResponse {
        folders,
        assets,
        rules: index.rules,
    })
}

fn snapshot_from_index(index: WorkspaceIndex) -> LibrarySnapshotResponse {
    LibrarySnapshotResponse {
        projects: index.projects,
        folders: index.folders,
        assets: index.assets,
        rules: index.rules,
        settings: index.settings,
    }
}

fn load_workspace_index(app: &AppHandle) -> Result<WorkspaceIndex, String> {
    let state_dir = state_dir(app)?;
    fs::create_dir_all(&state_dir).map_err(|error| error.to_string())?;
    let index_path = state_dir.join(INDEX_FILENAME);
    if !index_path.exists() {
        let index = WorkspaceIndex::default();
        let content = serde_json::to_string_pretty(&index).map_err(|error| error.to_string())?;
        fs::write(index_path, content).map_err(|error| error.to_string())?;
        return Ok(index);
    }

    let content = fs::read_to_string(index_path).map_err(|error| error.to_string())?;
    if content.trim().is_empty() {
        return Ok(WorkspaceIndex::default());
    }

    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn save_workspace_index(app: &AppHandle, index: &WorkspaceIndex) -> Result<(), String> {
    let state_dir = state_dir(app)?;
    fs::create_dir_all(&state_dir).map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(index).map_err(|error| error.to_string())?;
    fs::write(state_dir.join(INDEX_FILENAME), content).map_err(|error| error.to_string())
}

fn load_operation_history_entries(app: &AppHandle) -> Result<Vec<OperationHistoryEntry>, String> {
    let state_dir = state_dir(app)?;
    fs::create_dir_all(&state_dir).map_err(|error| error.to_string())?;
    let history_path = state_dir.join(HISTORY_FILENAME);
    if !history_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(history_path).map_err(|error| error.to_string())?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn save_operation_history_entries(
    app: &AppHandle,
    entries: &[OperationHistoryEntry],
) -> Result<(), String> {
    let state_dir = state_dir(app)?;
    fs::create_dir_all(&state_dir).map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(entries).map_err(|error| error.to_string())?;
    fs::write(state_dir.join(HISTORY_FILENAME), content).map_err(|error| error.to_string())
}

fn append_operation_history_entry(
    app: &AppHandle,
    entry: OperationHistoryEntry,
) -> Result<(), String> {
    let mut history = load_operation_history_entries(app)?;
    history.insert(0, entry);
    if history.len() > MAX_OPERATION_HISTORY {
        history.truncate(MAX_OPERATION_HISTORY);
    }
    save_operation_history_entries(app, &history)
}

fn operation_history_entry(
    action_type: &str,
    detail: String,
    undo: Option<UndoOperationRecord>,
) -> OperationHistoryEntry {
    OperationHistoryEntry {
        item: OperationHistoryItemRecord {
            id: format!(
                "history-{}-{}",
                action_type,
                Local::now().timestamp_micros()
            ),
            action_type: action_type.to_string(),
            detail,
            timestamp: now_label(),
            reversible: undo.is_some(),
        },
        undo,
    }
}

fn undo_history_entry(
    language: &str,
    _action_type: &str,
    _restored_count: usize,
    original_detail: &str,
) -> OperationHistoryEntry {
    let detail = if language == DEFAULT_LANGUAGE {
        format!("\u{5df2}\u{64a4}\u{9500}: {original_detail}")
    } else {
        format!("Undid: {original_detail}")
    };

    operation_history_entry("undo_action", detail, None)
}

fn localized_file_action_detail(
    language: &str,
    chinese_verb: &str,
    english_verb: &str,
    count: usize,
) -> String {
    if language == DEFAULT_LANGUAGE {
        format!("{chinese_verb} {count} \u{4e2a}\u{6587}\u{4ef6}")
    } else if count == 1 {
        format!("{english_verb} 1 file")
    } else {
        format!("{english_verb} {count} files")
    }
}

fn localized_named_action_detail(
    language: &str,
    chinese_verb: &str,
    english_verb: &str,
    name: &str,
) -> String {
    if language == DEFAULT_LANGUAGE {
        format!("{chinese_verb} {name}")
    } else {
        format!("{english_verb} {name}")
    }
}

fn localized_entry_action_detail(
    language: &str,
    chinese_verb: &str,
    english_verb: &str,
    count: usize,
) -> String {
    if language == DEFAULT_LANGUAGE {
        format!("{chinese_verb} {count} 个项目")
    } else if count == 1 {
        format!("{english_verb} 1 item")
    } else {
        format!("{english_verb} {count} items")
    }
}

fn state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(app_data.join(APP_FOLDER_NAME))
}

#[cfg(test)]
fn normalize_workspace(index: &mut WorkspaceIndex) -> Result<(), String> {
    let projects = index.projects.clone();
    let mut all_folders = Vec::new();
    let mut all_assets = Vec::new();

    for project in &projects {
        let root_path = Path::new(&project.root_path);
        if !root_path.is_dir() {
            continue;
        }
        let folders = scan_project_folders(project, &projects)?;
        let assets = scan_project_assets(project, &folders, &projects)?;
        all_folders.extend(folders);
        all_assets.extend(assets);
    }

    index
        .projects
        .retain(|project| Path::new(&project.root_path).is_dir());
    index.folders = all_folders;
    index.assets = all_assets;
    refresh_rule_attention(&mut index.rules, &index.folders);
    prune_recycle_entries(index);
    Ok(())
}

fn refresh_workspace_folders(index: &mut WorkspaceIndex) -> Result<(), String> {
    let projects = index.projects.clone();
    let mut all_folders = Vec::new();

    for project in &projects {
        let root_path = Path::new(&project.root_path);
        if !root_path.is_dir() {
            continue;
        }
        let folders = scan_project_folders(project, &projects)?;
        all_folders.extend(folders);
    }

    index
        .projects
        .retain(|project| Path::new(&project.root_path).is_dir());
    index.folders = all_folders;
    refresh_rule_attention(&mut index.rules, &index.folders);

    let valid_folder_ids: HashSet<String> = index.folders.iter().map(|folder| folder.id.clone()).collect();
    for asset in &mut index.assets {
        if asset
            .folder_id
            .as_deref()
            .is_some_and(|folder_id| !valid_folder_ids.contains(folder_id))
        {
            asset.folder_id = None;
        }
    }

    prune_recycle_entries(index);
    Ok(())
}

fn sanitize_workspace_index(index: &mut WorkspaceIndex) -> bool {
    let mut changed = false;
    let valid_project_ids: HashSet<String> = index
        .projects
        .iter()
        .filter(|project| Path::new(&project.root_path).is_dir())
        .map(|project| project.id.clone())
        .collect();

    if index.projects.len() != valid_project_ids.len() {
        index
            .projects
            .retain(|project| valid_project_ids.contains(&project.id));
        changed = true;
    }

    let folder_count = index.folders.len();
    index
        .folders
        .retain(|folder| valid_project_ids.contains(&folder.project_id));
    if index.folders.len() != folder_count {
        changed = true;
    }

    let valid_folder_ids: HashSet<String> = index.folders.iter().map(|folder| folder.id.clone()).collect();
    let asset_count = index.assets.len();
    index
        .assets
        .retain(|asset| valid_project_ids.contains(&asset.project_id));
    if index.assets.len() != asset_count {
        changed = true;
    }
    for asset in &mut index.assets {
        if asset
            .folder_id
            .as_deref()
            .is_some_and(|folder_id| !valid_folder_ids.contains(folder_id))
        {
            asset.folder_id = None;
            changed = true;
        }
    }

    let rule_count = index.rules.len();
    index
        .rules
        .retain(|rule| valid_project_ids.contains(&rule.target_project_id));
    if index.rules.len() != rule_count {
        changed = true;
    }

    let favorite_count = index.settings.favorite_folders.len();
    index
        .settings
        .favorite_folders
        .retain(|shortcut| valid_project_ids.contains(&shortcut.project_id));
    if index.settings.favorite_folders.len() != favorite_count {
        changed = true;
    }

    let recent_count = index.settings.recent_target_folders.len();
    index
        .settings
        .recent_target_folders
        .retain(|shortcut| valid_project_ids.contains(&shortcut.project_id));
    if index.settings.recent_target_folders.len() != recent_count {
        changed = true;
    }

    let previous_attention: Vec<bool> = index.rules.iter().map(|rule| rule.needs_attention).collect();
    refresh_rule_attention(&mut index.rules, &index.folders);
    if previous_attention
        .iter()
        .zip(index.rules.iter())
        .any(|(previous, rule)| *previous != rule.needs_attention)
    {
        changed = true;
    }

    let recycle_count = index.recycle_entries.len();
    prune_recycle_entries(index);
    if index.recycle_entries.len() != recycle_count {
        changed = true;
    }

    changed
}

fn prune_recycle_entries(index: &mut WorkspaceIndex) {
    index
        .recycle_entries
        .retain(|entry| Path::new(&entry.recycle_path).exists());
    if index.recycle_entries.len() > 240 {
        index.recycle_entries.truncate(240);
    }
}

fn rescan_project_records(
    index: &mut WorkspaceIndex,
    project_id: &str,
) -> Result<(ProjectRecord, Vec<FolderRecord>, Vec<AssetRecord>), String> {
    let project = find_project(&index.projects, project_id)
        .cloned()
        .ok_or_else(|| "Project not found.".to_string())?;
    let folders = scan_project_folders(&project, &index.projects)?;
    let assets = scan_project_assets(&project, &folders, &index.projects)?;
    upsert_folders(&mut index.folders, &project.id, folders.clone());
    upsert_assets(&mut index.assets, &project.id, assets.clone());
    refresh_rule_attention(&mut index.rules, &index.folders);
    Ok((project, folders, assets))
}

fn rescan_projects(
    index: &mut WorkspaceIndex,
    project_ids: impl IntoIterator<Item = String>,
) -> Result<(), String> {
    let existing_project_ids: HashSet<String> =
        index.projects.iter().map(|project| project.id.clone()).collect();
    let mut rescanned_project_ids = HashSet::new();

    for project_id in project_ids {
        if !existing_project_ids.contains(&project_id) || !rescanned_project_ids.insert(project_id.clone()) {
            continue;
        }
        let _ = rescan_project_records(index, &project_id)?;
    }

    Ok(())
}

fn ensure_project_watchers(app: &AppHandle, index: &WorkspaceIndex) -> Result<(), String> {
    let state = app.state::<Arc<WorkspaceWatchState>>();
    let mut watchers = state
        .watchers
        .lock()
        .map_err(|_| "Failed to access watcher state.".to_string())?;
    watchers.clear();

    for project in &index.projects {
        let root_path = PathBuf::from(&project.root_path);
        if !root_path.is_dir() {
            continue;
        }

        let app_handle = app.clone();
        let project_id = project.id.clone();
        let mut watcher = match RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                if result.is_err() {
                    return;
                }
                let _ = maybe_emit_workspace_changed(&app_handle, &[project_id.clone()]);
            },
            Config::default(),
        ) {
            Ok(watcher) => watcher,
            Err(_) => continue,
        };

        if watcher.watch(&root_path, RecursiveMode::Recursive).is_err() {
            continue;
        }
        watchers.push(watcher);
    }

    Ok(())
}

fn maybe_emit_workspace_changed(app: &AppHandle, project_ids: &[String]) -> Result<(), String> {
    let state = app.state::<Arc<WorkspaceWatchState>>();
    let mut last_emitted_at = state
        .last_emitted_at
        .lock()
        .map_err(|_| "Failed to access watcher throttle.".to_string())?;
    let now = Instant::now();
    if let Some(last) = *last_emitted_at {
        if now.duration_since(last) < Duration::from_millis(800) {
            return Ok(());
        }
    }
    *last_emitted_at = Some(now);
    drop(last_emitted_at);

    emit_workspace_changed(app, project_ids)
}

fn emit_workspace_changed(app: &AppHandle, project_ids: &[String]) -> Result<(), String> {
    app.emit(
        "workspace-changed",
        WorkspaceChangedPayload {
            project_ids: project_ids.to_vec(),
        },
    )
    .map_err(|error| error.to_string())
}

fn scan_project_folders(
    project: &ProjectRecord,
    all_projects: &[ProjectRecord],
) -> Result<Vec<FolderRecord>, String> {
    let root = Path::new(&project.root_path);
    if !root.is_dir() {
        return Err("Project folder no longer exists.".into());
    }

    let excluded_roots = nested_project_roots(project, all_projects)?;
    let mut folders = Vec::new();
    folders.push(FolderRecord {
        id: format!("folder-root-{}", project.id),
        project_id: project.id.clone(),
        name: project.name.clone(),
        relative_path: String::new(),
        parent_id: None,
        sort_order: 0,
    });

    let mut queue = vec![PathBuf::new()];
    while let Some(relative) = queue.pop() {
        let absolute = root.join(&relative);
        let mut child_directories = Vec::new();
        let entries = match fs::read_dir(&absolute) {
            Ok(entries) => entries,
            Err(error) => {
                if relative.as_os_str().is_empty() {
                    return Err(error.to_string());
                }
                continue;
            }
        };
        for entry in entries {
            let Ok(entry) = entry else {
                continue;
            };
            let path = entry.path();
            if path.is_dir() && !should_skip_scan_path(&path, &excluded_roots) {
                child_directories.push(path);
            }
        }
        child_directories.sort();

        for (index, child) in child_directories.iter().enumerate() {
            let child_relative = child
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let parent_relative = Path::new(&child_relative)
                .parent()
                .map(|value| value.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            let parent_id = if parent_relative.is_empty() {
                Some(format!("folder-root-{}", project.id))
            } else {
                Some(folder_id(&project.id, &parent_relative))
            };
            let name = child
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
                .unwrap_or_else(|| child_relative.clone());

            folders.push(FolderRecord {
                id: folder_id(&project.id, &child_relative),
                project_id: project.id.clone(),
                name,
                relative_path: child_relative.clone(),
                parent_id,
                sort_order: index as i64,
            });
            queue.push(PathBuf::from(child_relative));
        }
    }

    folders.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(folders)
}

fn scan_project_assets(
    project: &ProjectRecord,
    folders: &[FolderRecord],
    all_projects: &[ProjectRecord],
) -> Result<Vec<AssetRecord>, String> {
    let root = Path::new(&project.root_path);
    let mut assets = Vec::new();
    let folder_map: HashMap<String, String> = folders
        .iter()
        .map(|folder| (folder.relative_path.clone(), folder.id.clone()))
        .collect();
    let excluded_roots = nested_project_roots(project, all_projects)?;

    for path in walk_files(root, &excluded_roots)? {
        let descriptor = match describe_file(&path) {
            Ok(descriptor) => descriptor,
            Err(_) => continue,
        };
        let relative_path = relative_to_root(root, &path);
        let relative_folder_path = Path::new(&relative_path)
            .parent()
            .map(|value| value.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let folder_id = if relative_folder_path.is_empty() {
            Some(format!("folder-root-{}", project.id))
        } else {
            folder_map.get(&relative_folder_path).cloned()
        };

        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let tags = inferred_tags(&descriptor);
        let name = descriptor.file_name.clone();
        let kind = descriptor.kind.clone();
        let preview_mode = descriptor.preview_mode.clone();
        let extension = descriptor.extension.clone();
        let modified_at = match modified_label(&path) {
            Ok(label) => label,
            Err(_) => continue,
        };
        let fingerprint = match asset_fingerprint(&path, metadata.len()) {
            Ok(fingerprint) => fingerprint,
            Err(_) => continue,
        };
        assets.push(AssetRecord {
            id: asset_id(&project.id, &relative_path),
            project_id: project.id.clone(),
            folder_id,
            relative_folder_path,
            relative_path,
            managed_path: path.to_string_lossy().into_owned(),
            name,
            format: extension.to_uppercase(),
            kind,
            preview_mode,
            tags,
            file_size_bytes: metadata.len(),
            file_size_label: format_bytes(metadata.len()),
            original_path: path.to_string_lossy().into_owned(),
            received_at: modified_at.clone(),
            imported_at: modified_at.clone(),
            last_modified_at: modified_at,
            fingerprint,
        });
    }

    assets.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(assets)
}

fn walk_files(root: &Path, excluded_roots: &[PathBuf]) -> Result<Vec<PathBuf>, String> {
    let mut queue = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(directory) = queue.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                if same_path(&directory, root) {
                    return Err(error.to_string());
                }
                continue;
            }
        };
        let mut children: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .collect();
        children.sort();
        for child in children {
            if child.is_dir() && !should_skip_scan_path(&child, excluded_roots) {
                queue.push(child);
            } else if child.is_file() {
                files.push(child);
            }
        }
    }

    Ok(files)
}

fn nested_project_roots(
    project: &ProjectRecord,
    all_projects: &[ProjectRecord],
) -> Result<Vec<PathBuf>, String> {
    let project_root = PathBuf::from(&project.root_path)
        .canonicalize()
        .map_err(|error| error.to_string())?;

    Ok(all_projects
        .iter()
        .filter(|other| other.id != project.id)
        .filter_map(|other| {
            let other_root = PathBuf::from(&other.root_path);
            if !other_root.is_dir() {
                return None;
            }
            let canonical = other_root.canonicalize().ok()?;
            if canonical.starts_with(&project_root) {
                Some(canonical)
            } else {
                None
            }
        })
        .collect())
}

fn should_skip_scan_path(path: &Path, excluded_roots: &[PathBuf]) -> bool {
    excluded_roots.iter().any(|root| same_path(path, root))
}

fn describe_file(path: &Path) -> Result<FileDescriptor, String> {
    if !path.is_file() {
        return Err("File does not exist.".into());
    }

    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let extension = extension_lowercase(path);
    let (kind, preview_mode) = detect_kind_and_preview(&extension);
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| "File name is missing.".to_string())?;

    Ok(FileDescriptor {
        source_path: path.to_path_buf(),
        file_name,
        extension,
        kind,
        preview_mode,
        file_size_bytes: metadata.len(),
    })
}

fn choose_assignment(
    descriptor: &FileDescriptor,
    mode: &str,
    current_project: Option<&ProjectRecord>,
    current_folder: Option<&FolderRecord>,
    projects: &[ProjectRecord],
    folders: &[FolderRecord],
    rules: &[RuleRecord],
) -> Option<ImportAssignmentRecord> {
    let source_text = descriptor.source_path.to_string_lossy().to_lowercase();
    let file_name = descriptor.file_name.to_lowercase();

    match mode {
        "current_project" => {
            let project = current_project?;
            if let Some(folder) = current_folder.filter(|folder| folder.project_id == project.id) {
                return Some(ImportAssignmentRecord {
                    candidate_id: String::new(),
                    source_path: descriptor.source_path.to_string_lossy().into_owned(),
                    target_project_id: project.id.clone(),
                    target_folder_id: Some(folder.id.clone()),
                    target_relative_path: folder.relative_path.clone(),
                    conflict_strategy: "keep_both".into(),
                    suggested_tags: inferred_tags(descriptor),
                    reason: "Dropped into the currently selected project folder.".into(),
                    confidence: 0.99,
                    requires_confirmation: false,
                    warnings: collect_import_warnings(descriptor, project, folder, folders, false),
                });
            }

            if let Some(rule_match) = match_rules(
                &source_text,
                &file_name,
                &descriptor.extension,
                Some(&project.id),
                folders,
                rules,
            ) {
                return Some(import_assignment_from_rule(
                    descriptor, rule_match, folders, projects,
                ));
            }

            Some(ImportAssignmentRecord {
                candidate_id: String::new(),
                source_path: descriptor.source_path.to_string_lossy().into_owned(),
                target_project_id: project.id.clone(),
                target_folder_id: None,
                target_relative_path: String::new(),
                conflict_strategy: "keep_both".into(),
                suggested_tags: inferred_tags(descriptor),
                reason: "Needs folder selection in the current project.".into(),
                confidence: 0.45,
                requires_confirmation: true,
                warnings: Vec::new(),
            })
        }
        "auto" => {
            if let Some(rule_match) = match_rules(
                &source_text,
                &file_name,
                &descriptor.extension,
                None,
                folders,
                rules,
            ) {
                return Some(import_assignment_from_rule(
                    descriptor, rule_match, folders, projects,
                ));
            }

            infer_project_assignment(descriptor, projects, folders)
        }
        _ => Some(ImportAssignmentRecord {
            candidate_id: String::new(),
            source_path: descriptor.source_path.to_string_lossy().into_owned(),
            target_project_id: current_project
                .map(|project| project.id.clone())
                .or_else(|| projects.first().map(|project| project.id.clone()))
                .unwrap_or_default(),
            target_folder_id: current_folder.map(|folder| folder.id.clone()),
            target_relative_path: current_folder
                .map(|folder| folder.relative_path.clone())
                .unwrap_or_default(),
            conflict_strategy: "keep_both".into(),
            suggested_tags: inferred_tags(descriptor),
            reason: "Waiting for manual assignment.".into(),
            confidence: 0.40,
            requires_confirmation: true,
            warnings: Vec::new(),
        }),
    }
}

fn import_assignment_from_rule(
    descriptor: &FileDescriptor,
    rule_match: RuleMatch<'_>,
    folders: &[FolderRecord],
    projects: &[ProjectRecord],
) -> ImportAssignmentRecord {
    let warning_context = projects
        .iter()
        .find(|project| project.id == rule_match.rule.target_project_id)
        .and_then(|project| {
            folders
                .iter()
                .find(|folder| {
                    folder.project_id == rule_match.rule.target_project_id
                        && folder.relative_path == rule_match.rule.target_relative_path
                })
                .map(|folder| (project, folder))
        });

    ImportAssignmentRecord {
        candidate_id: String::new(),
        source_path: descriptor.source_path.to_string_lossy().into_owned(),
        target_project_id: rule_match.rule.target_project_id.clone(),
        target_folder_id: rule_match.rule.target_folder_id.clone(),
        target_relative_path: rule_match.rule.target_relative_path.clone(),
        conflict_strategy: "keep_both".into(),
        suggested_tags: normalized_tags(&rule_match.rule.suggested_tags),
        reason: if rule_match.matched_keywords.is_empty() {
            format!("Matched rule '{}'.", rule_match.rule.name)
        } else {
            format!(
                "Matched rule '{}' through keywords {}.",
                rule_match.rule.name,
                rule_match.matched_keywords.join(", ")
            )
        },
        confidence: rule_match.confidence,
        requires_confirmation: false,
        warnings: warning_context
            .map(|(project, folder)| {
                collect_import_warnings(descriptor, project, folder, folders, false)
            })
            .unwrap_or_default(),
    }
}

fn infer_project_assignment(
    descriptor: &FileDescriptor,
    projects: &[ProjectRecord],
    folders: &[FolderRecord],
) -> Option<ImportAssignmentRecord> {
    let first_project = projects.first()?;
    let first_folder = folders
        .iter()
        .find(|folder| folder.project_id == first_project.id && folder.relative_path.is_empty())?;

    Some(ImportAssignmentRecord {
        candidate_id: String::new(),
        source_path: descriptor.source_path.to_string_lossy().into_owned(),
        target_project_id: first_project.id.clone(),
        target_folder_id: Some(first_folder.id.clone()),
        target_relative_path: first_folder.relative_path.clone(),
        conflict_strategy: "keep_both".into(),
        suggested_tags: inferred_tags(descriptor),
        reason: "No rule matched. Waiting for manual confirmation.".into(),
        confidence: 0.40,
        requires_confirmation: true,
        warnings: collect_import_warnings(descriptor, first_project, first_folder, folders, true),
    })
}

fn match_rules<'a>(
    source_text: &str,
    file_name: &str,
    extension: &str,
    project_scope: Option<&str>,
    folders: &[FolderRecord],
    rules: &'a [RuleRecord],
) -> Option<RuleMatch<'a>> {
    let mut best_match: Option<RuleMatch<'a>> = None;

    for rule in rules {
        if !rule.enabled || rule.needs_attention {
            continue;
        }
        if let Some(project_id) = project_scope {
            if rule.target_project_id != project_id {
                continue;
            }
        }
        if !folders.iter().any(|folder| {
            folder.project_id == rule.target_project_id
                && folder.relative_path == rule.target_relative_path
        }) {
            continue;
        }

        let normalized_formats: Vec<String> = rule
            .formats
            .iter()
            .map(|format| format.to_lowercase())
            .collect();
        if !normalized_formats.is_empty()
            && !normalized_formats.iter().any(|value| value == extension)
        {
            continue;
        }

        let matched_keywords: Vec<String> = rule
            .keywords
            .iter()
            .map(|keyword| keyword.trim().to_lowercase())
            .filter(|keyword| {
                !keyword.is_empty()
                    && (source_text.contains(keyword) || file_name.contains(keyword))
            })
            .collect();
        if !rule.keywords.is_empty() && matched_keywords.is_empty() {
            continue;
        }

        let mut score = rule.confidence.clamp(0.55, 0.99);
        score += (matched_keywords.len() as f64 * 0.03).min(0.12);
        if !normalized_formats.is_empty() {
            score += 0.02;
        }
        score = score.min(0.99);

        let candidate = RuleMatch {
            rule,
            confidence: score,
            matched_keywords,
        };

        match &best_match {
            Some(existing) if existing.confidence >= candidate.confidence => {}
            _ => best_match = Some(candidate),
        }
    }

    best_match
}

fn resolve_target_folder<'a>(
    project: &'a ProjectRecord,
    folders: &'a [FolderRecord],
    assignment: &ImportAssignmentRecord,
) -> Result<ResolvedFolder<'a>, String> {
    if let Some(folder_id) = assignment.target_folder_id.as_deref() {
        if let Some(folder) = find_folder(folders, folder_id) {
            return Ok(ResolvedFolder {
                folder,
                join_path: Path::new(&project.root_path).join(&folder.relative_path),
            });
        }
    }

    let target_relative = assignment.target_relative_path.trim_matches('/');
    if let Some(folder) = folders.iter().find(|folder| {
        folder.project_id == project.id && folder.relative_path.trim_matches('/') == target_relative
    }) {
        return Ok(ResolvedFolder {
            folder,
            join_path: Path::new(&project.root_path).join(&folder.relative_path),
        });
    }

    Err("Target folder could not be resolved.".into())
}

struct ResolvedFolder<'a> {
    folder: &'a FolderRecord,
    join_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ImportDestination {
    Skip,
    Path(PathBuf),
}

impl ImportDestination {
    fn into_path(self) -> Option<PathBuf> {
        match self {
            Self::Path(path) => Some(path),
            Self::Skip => None,
        }
    }
}

fn resolve_import_destination(
    target_dir: &Path,
    file_name: &std::ffi::OsStr,
    strategy: &str,
    recycle_dir: &Path,
) -> Result<ImportDestination, String> {
    let exact_path = target_dir.join(file_name);
    match strategy {
        "skip" if exact_path.exists() => Ok(ImportDestination::Skip),
        "replace" if exact_path.exists() => {
            let recycle_target = recycle_destination(recycle_dir, &exact_path)?;
            move_path_to_recycle(&exact_path, &recycle_target)?;
            Ok(ImportDestination::Path(exact_path))
        }
        "replace" => Ok(ImportDestination::Path(exact_path)),
        "keep_both" | _ => Ok(ImportDestination::Path(unique_destination(
            target_dir, file_name,
        ))),
    }
}

fn move_source_file(source_path: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    match fs::rename(source_path, destination) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source_path, destination).map_err(|error| error.to_string())?;
            let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;
            let destination_metadata =
                fs::metadata(destination).map_err(|error| error.to_string())?;
            if source_metadata.len() != destination_metadata.len() {
                let _ = fs::remove_file(destination);
                return Err("Copied file size does not match the source file.".into());
            }
            if let Err(error) = fs::remove_file(source_path) {
                let _ = fs::remove_file(destination);
                return Err(error.to_string());
            }
            Ok(())
        }
    }
}

fn move_file_back(source_path: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    if destination.exists() {
        return Err(format!(
            "Cannot restore file because the original path already exists: {}",
            destination.to_string_lossy()
        ));
    }

    match fs::rename(source_path, destination) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source_path, destination).map_err(|error| error.to_string())?;
            let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;
            let destination_metadata =
                fs::metadata(destination).map_err(|error| error.to_string())?;
            if source_metadata.len() != destination_metadata.len() {
                let _ = fs::remove_file(destination);
                return Err("Restored file size does not match the imported file.".into());
            }
            fs::remove_file(source_path).map_err(|error| error.to_string())?;
            Ok(())
        }
    }
}

fn move_path_back(source_path: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    if destination.exists() {
        return Err(format!(
            "Cannot restore path because the original path already exists: {}",
            destination.to_string_lossy()
        ));
    }

    match fs::rename(source_path, destination) {
        Ok(()) => Ok(()),
        Err(_) if source_path.is_file() => {
            fs::copy(source_path, destination).map_err(|error| error.to_string())?;
            let source_metadata = fs::metadata(source_path).map_err(|error| error.to_string())?;
            let destination_metadata =
                fs::metadata(destination).map_err(|error| error.to_string())?;
            if source_metadata.len() != destination_metadata.len() {
                let _ = fs::remove_file(destination);
                return Err("Restored file size does not match the recycle item.".into());
            }
            fs::remove_file(source_path).map_err(|error| error.to_string())?;
            Ok(())
        }
        Err(_) if source_path.is_dir() => {
            copy_dir_recursive(source_path, destination)?;
            fs::remove_dir_all(source_path).map_err(|error| error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}

fn restore_recycle_path(source_path: &Path, original_path: &Path) -> Result<PathBuf, String> {
    let final_path = if original_path.exists() {
        let parent = original_path
            .parent()
            .ok_or_else(|| "Original restore path is invalid.".to_string())?;
        let file_name = original_path
            .file_name()
            .ok_or_else(|| "Original restore path is missing a name.".to_string())?;
        unique_destination(parent, file_name)
    } else {
        original_path.to_path_buf()
    };

    move_path_back(source_path, &final_path)?;
    Ok(final_path)
}

fn move_path_to_recycle(source_path: &Path, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    match fs::rename(source_path, destination) {
        Ok(()) => Ok(()),
        Err(_) if source_path.is_file() => move_source_file(source_path, destination),
        Err(_) if source_path.is_dir() => {
            copy_dir_recursive(source_path, destination)?;
            fs::remove_dir_all(source_path).map_err(|error| error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}

fn copy_dir_recursive(source_dir: &Path, destination_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(destination_dir).map_err(|error| error.to_string())?;

    for entry in fs::read_dir(source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let destination_path = destination_dir.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            move_source_file(&source_path, &destination_path)?;
        }
    }

    Ok(())
}

fn recycle_destination(recycle_dir: &Path, source_path: &Path) -> Result<PathBuf, String> {
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "Path is missing a file or folder name.".to_string())?;
    Ok(unique_destination(recycle_dir, file_name))
}

fn recycle_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(state_dir(app)?.join(RECYCLE_BIN_FOLDER_NAME))
}

fn remove_recycle_paths_from_history(
    app: &AppHandle,
    recycle_paths: &HashSet<String>,
) -> Result<(), String> {
    if recycle_paths.is_empty() {
        return Ok(());
    }

    let mut history = load_operation_history_entries(app)?;
    for entry in &mut history {
        if let Some(UndoOperationRecord::Delete { files }) = entry.undo.as_mut() {
            files.retain(|file| !recycle_paths.contains(&file.recycle_path));
            if files.is_empty() {
                entry.undo = None;
                entry.item.reversible = false;
            }
        }
    }
    save_operation_history_entries(app, &history)
}

fn preview_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(state_dir(app)?.join(PREVIEW_CACHE_FOLDER_NAME))
}

fn touch_recent_shortcuts(
    recent_shortcuts: &mut Vec<FolderShortcutRecord>,
    touched_shortcuts: Vec<FolderShortcutRecord>,
) {
    for shortcut in touched_shortcuts.into_iter().rev() {
        recent_shortcuts.retain(|existing| existing != &shortcut);
        recent_shortcuts.insert(0, shortcut);
    }
    if recent_shortcuts.len() > MAX_RECENT_TARGET_FOLDERS {
        recent_shortcuts.truncate(MAX_RECENT_TARGET_FOLDERS);
    }
}

fn asset_fingerprint(path: &Path, file_size: u64) -> Result<String, String> {
    const SAMPLE_BYTES: usize = 256 * 1024;

    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(extension_lowercase(path).as_bytes());
    hasher.update(file_size.to_le_bytes());

    let head_size = SAMPLE_BYTES.min(file_size as usize);
    if head_size > 0 {
        let mut head = vec![0_u8; head_size];
        file.read_exact(&mut head)
            .map_err(|error| error.to_string())?;
        hasher.update(&head);
    }

    if file_size as usize > SAMPLE_BYTES {
        let tail_size = SAMPLE_BYTES.min(file_size as usize);
        file.seek(SeekFrom::End(-(tail_size as i64)))
            .map_err(|error| error.to_string())?;
        let mut tail = vec![0_u8; tail_size];
        file.read_exact(&mut tail)
            .map_err(|error| error.to_string())?;
        hasher.update(&tail);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn collect_native_drag_paths(managed_paths: &[String]) -> Result<Vec<PathBuf>, String> {
    let mut resolved_paths = Vec::new();
    let mut seen = HashSet::new();

    for raw_path in managed_paths {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            continue;
        }

        let path = PathBuf::from(trimmed);
        let normalized = path.to_string_lossy().to_lowercase();
        if !seen.insert(normalized) {
            continue;
        }

        if !path.is_file() {
            return Err(format!(
                "The selected file no longer exists on disk: {}",
                path.display()
            ));
        }

        resolved_paths.push(path);
    }

    if resolved_paths.is_empty() {
        return Err("No valid files were provided for native dragging.".into());
    }

    Ok(resolved_paths)
}

#[cfg(target_os = "windows")]
#[implement(IDropSource)]
struct NativeFileDragSource;

#[cfg(target_os = "windows")]
impl IDropSource_Impl for NativeFileDragSource_Impl {
    fn QueryContinueDrag(
        &self,
        fescapepressed: windows::core::BOOL,
        grfkeystate: windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS,
    ) -> windows::core::HRESULT {
        if fescapepressed.as_bool() {
            return DRAGDROP_S_CANCEL;
        }

        if grfkeystate & MK_LBUTTON != MK_LBUTTON {
            return DRAGDROP_S_DROP;
        }

        windows::core::HRESULT(0)
    }

    fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> windows::core::HRESULT {
        DRAGDROP_S_USEDEFAULTCURSORS
    }
}

#[cfg(target_os = "windows")]
#[implement(IDataObject)]
struct NativeFileDropDataObject {
    format_etc: FORMATETC,
    bytes: Vec<u8>,
}

#[cfg(target_os = "windows")]
impl NativeFileDropDataObject {
    fn new(paths: &[PathBuf]) -> Result<Self, String> {
        Ok(Self {
            format_etc: FORMATETC {
                cfFormat: CF_HDROP.0,
                ptd: ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: -1,
                tymed: TYMED_HGLOBAL.0 as u32,
            },
            bytes: build_dropfiles_payload(paths),
        })
    }

    fn create_medium(&self) -> windows::core::Result<STGMEDIUM> {
        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE, self.bytes.len())?;
            let buffer = GlobalLock(hglobal) as *mut u8;
            if buffer.is_null() {
                let _ = GlobalFree(Some(hglobal));
                return Err(windows::core::Error::from_win32());
            }

            ptr::copy_nonoverlapping(self.bytes.as_ptr(), buffer, self.bytes.len());
            let _ = GlobalUnlock(hglobal);

            Ok(STGMEDIUM {
                tymed: TYMED_HGLOBAL.0 as u32,
                u: STGMEDIUM_0 { hGlobal: hglobal },
                pUnkForRelease: std::mem::ManuallyDrop::new(None),
            })
        }
    }
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
impl IDataObject_Impl for NativeFileDropDataObject_Impl {
    fn GetData(&self, pformatetcin: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
        self.QueryGetData(pformatetcin).ok()?;
        self.create_medium()
    }

    fn GetDataHere(
        &self,
        _pformatetc: *const FORMATETC,
        _pmedium: *mut STGMEDIUM,
    ) -> windows::core::Result<()> {
        Err(windows::core::Error::from_hresult(E_NOTIMPL))
    }

    fn QueryGetData(&self, pformatetc: *const FORMATETC) -> windows::core::HRESULT {
        unsafe {
            if pformatetc.is_null() {
                return DV_E_FORMATETC;
            }

            let format = &*pformatetc;
            if format.cfFormat == self.format_etc.cfFormat
                && format.dwAspect == self.format_etc.dwAspect
                && (format.tymed & self.format_etc.tymed) != 0
            {
                windows::core::HRESULT(0)
            } else {
                DV_E_FORMATETC
            }
        }
    }

    fn GetCanonicalFormatEtc(
        &self,
        _pformatectin: *const FORMATETC,
        _pformatetcout: *mut FORMATETC,
    ) -> windows::core::HRESULT {
        E_NOTIMPL
    }

    fn SetData(
        &self,
        _pformatetc: *const FORMATETC,
        _pmedium: *const STGMEDIUM,
        _frelease: windows::core::BOOL,
    ) -> windows::core::Result<()> {
        Err(windows::core::Error::from_hresult(E_NOTIMPL))
    }

    fn EnumFormatEtc(&self, dwdirection: u32) -> windows::core::Result<IEnumFORMATETC> {
        if dwdirection != DATADIR_GET.0 as u32 {
            return Err(windows::core::Error::from_hresult(E_NOTIMPL));
        }

        let formats = [self.format_etc];
        unsafe { SHCreateStdEnumFmtEtc(&formats) }
    }

    fn DAdvise(
        &self,
        _pformatetc: *const FORMATETC,
        _advf: u32,
        _padvsink: windows::core::Ref<'_, IAdviseSink>,
    ) -> windows::core::Result<u32> {
        Err(windows::core::Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }

    fn DUnadvise(&self, _dwconnection: u32) -> windows::core::Result<()> {
        Err(windows::core::Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }

    fn EnumDAdvise(&self) -> windows::core::Result<IEnumSTATDATA> {
        Err(windows::core::Error::from_hresult(OLE_E_ADVISENOTSUPPORTED))
    }
}

#[cfg(target_os = "windows")]
struct OleDragGuard;

#[cfg(target_os = "windows")]
impl OleDragGuard {
    fn new() -> Result<Self, String> {
        unsafe {
            OleInitialize(None).map_err(|error| error.to_string())?;
        }
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for OleDragGuard {
    fn drop(&mut self) {
        unsafe {
            OleUninitialize();
        }
    }
}

#[cfg(target_os = "windows")]
fn build_dropfiles_payload(paths: &[PathBuf]) -> Vec<u8> {
    let mut encoded_paths = Vec::<u16>::new();
    for path in paths {
        encoded_paths.extend(path.as_os_str().encode_wide());
        encoded_paths.push(0);
    }
    encoded_paths.push(0);

    let header_size = std::mem::size_of::<DROPFILES>();
    let payload_size = encoded_paths.len() * std::mem::size_of::<u16>();
    let mut bytes = vec![0_u8; header_size + payload_size];

    unsafe {
        ptr::write(
            bytes.as_mut_ptr() as *mut DROPFILES,
            DROPFILES {
                pFiles: header_size as u32,
                pt: POINT::default(),
                fNC: false.into(),
                fWide: true.into(),
            },
        );
        ptr::copy_nonoverlapping(
            encoded_paths.as_ptr() as *const u8,
            bytes.as_mut_ptr().add(header_size),
            payload_size,
        );
    }

    bytes
}

#[cfg(target_os = "windows")]
fn start_native_file_drag_impl(paths: &[PathBuf]) -> Result<(), String> {
    let _ole_guard = OleDragGuard::new()?;
    let data_object: IDataObject = NativeFileDropDataObject::new(paths)?.into();
    let drop_source: IDropSource = NativeFileDragSource.into();
    let mut effect = DROPEFFECT_NONE;
    let result = unsafe { DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY, &mut effect) };

    if result == DRAGDROP_S_DROP || result == DRAGDROP_S_CANCEL || result.is_ok() {
        return Ok(());
    }

    Err(format!("Native file drag failed: {result:?}"))
}

#[cfg(not(target_os = "windows"))]
fn start_native_file_drag_impl(_paths: &[PathBuf]) -> Result<(), String> {
    Err("Native file dragging is only implemented for Windows builds.".into())
}

#[cfg(target_os = "windows")]
fn open_path_with_system_default(path: &Path) -> Result<(), String> {
    open_target_with_system_default(path.to_string_lossy().as_ref())
}

#[cfg(target_os = "windows")]
fn open_target_with_system_default(target: &str) -> Result<(), String> {
    let operation = HSTRING::from("open");
    let target = HSTRING::from(target);
    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(target.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };

    if result.0 as usize > 32 {
        return Ok(());
    }

    Err(format!(
        "The system could not open this path (ShellExecute code {}).",
        result.0 as usize
    ))
}

#[cfg(not(target_os = "windows"))]
fn open_path_with_system_default(_path: &Path) -> Result<(), String> {
    Err("Opening managed paths is only implemented for Windows builds.".into())
}

#[cfg(not(target_os = "windows"))]
fn open_target_with_system_default(_target: &str) -> Result<(), String> {
    Err("Opening external targets is only implemented for Windows builds.".into())
}

#[cfg(target_os = "windows")]
fn reveal_path_in_system_explorer(path: &Path) -> Result<(), String> {
    let resolved_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if resolved_path.is_dir() {
        return open_path_with_system_default(&resolved_path);
    }

    if Command::new("explorer.exe")
        .arg("/select,")
        .arg(&resolved_path)
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    if let Some(parent) = resolved_path.parent() {
        return open_path_with_system_default(parent);
    }

    Err("Explorer could not reveal this path.".into())
}

#[cfg(not(target_os = "windows"))]
fn reveal_path_in_system_explorer(_path: &Path) -> Result<(), String> {
    Err("Revealing managed paths is only implemented for Windows builds.".into())
}

#[cfg(target_os = "windows")]
fn extract_native_thumbnail(source_path: &Path, preview_path: &Path) -> Result<bool, String> {
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| error.to_string())?;
    }

    let result = extract_windows_thumbnail_png(source_path, preview_path, 960);

    unsafe {
        CoUninitialize();
    }

    result
}

#[cfg(not(target_os = "windows"))]
fn extract_native_thumbnail(_source_path: &Path, _preview_path: &Path) -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn extract_windows_thumbnail_png(
    source_path: &Path,
    preview_path: &Path,
    edge: i32,
) -> Result<bool, String> {
    let shell_item: IShellItemImageFactory = unsafe {
        SHCreateItemFromParsingName::<_, _, IShellItemImageFactory>(
            &HSTRING::from(source_path.to_string_lossy().into_owned()),
            None::<&IBindCtx>,
        )
        .map_err(|error| error.to_string())?
    };

    let bitmap = unsafe {
        shell_item.GetImage(
            SIZE { cx: edge, cy: edge },
            SIIGBF_THUMBNAILONLY | SIIGBF_BIGGERSIZEOK | SIIGBF_SCALEUP,
        )
    };

    let bitmap = match bitmap {
        Ok(bitmap) => bitmap,
        Err(_) => return Ok(false),
    };

    let mut info = BITMAP::default();
    let read = unsafe {
        GetObjectW(
            HGDIOBJ(bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some((&mut info as *mut BITMAP).cast()),
        )
    };
    if read == 0 {
        unsafe {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
        }
        return Ok(false);
    }

    if info.bmWidth <= 0 || info.bmHeight <= 0 {
        unsafe {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
        }
        return Ok(false);
    }

    let width = info.bmWidth as u32;
    let height = info.bmHeight as u32;
    let mut bitmap_info = BITMAPINFO::default();
    bitmap_info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: width as i32,
        biHeight: -(height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };

    let mut pixels = vec![0_u8; (width * height * 4) as usize];
    let hdc = unsafe { GetDC(None) };
    if hdc.is_invalid() {
        unsafe {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
        }
        return Ok(false);
    }

    let lines = unsafe {
        GetDIBits(
            hdc,
            HBITMAP(bitmap.0),
            0,
            height,
            Some(pixels.as_mut_ptr().cast()),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        )
    };

    unsafe {
        let _ = ReleaseDC(None, hdc);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
    }

    if lines == 0 {
        return Ok(false);
    }

    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }

    let image = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, pixels)
        .ok_or_else(|| "Failed to build preview image buffer.".to_string())?;
    image
        .save(preview_path)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

fn collect_import_warnings(
    descriptor: &FileDescriptor,
    project: &ProjectRecord,
    folder: &FolderRecord,
    folders: &[FolderRecord],
    manual_review: bool,
) -> Vec<ImportWarningRecord> {
    let folder_path = Path::new(&project.root_path).join(&folder.relative_path);
    let mut warnings = Vec::new();
    let exact_path = folder_path.join(&descriptor.file_name);
    if let Ok(existing_descriptor) = describe_file(&exact_path) {
        warnings.push(ImportWarningRecord {
            kind: if existing_descriptor.file_size_bytes == descriptor.file_size_bytes {
                "exact_duplicate".into()
            } else {
                "same_name_conflict".into()
            },
            message: if existing_descriptor.file_size_bytes == descriptor.file_size_bytes {
                "A file with the same name and size already exists in the target folder.".into()
            } else {
                "A file with the same name already exists in the target folder and the import will be renamed.".into()
            },
            existing_asset_id: find_asset_id_by_path(project, folders, &exact_path),
            existing_asset_name: Some(existing_descriptor.file_name),
            existing_managed_path: Some(exact_path.to_string_lossy().into_owned()),
        });
    }

    if let Ok(entries) = fs::read_dir(&folder_path) {
        let source_base = normalized_name_stem(&descriptor.file_name);
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || same_path(&path, &exact_path) {
                continue;
            }
            let Some(name) = path
                .file_name()
                .map(|value| value.to_string_lossy().into_owned())
            else {
                continue;
            };
            if normalized_name_stem(&name) == source_base {
                warnings.push(ImportWarningRecord {
                    kind: "similar_name".into(),
                    message: "A similarly named file already exists in the target folder.".into(),
                    existing_asset_id: find_asset_id_by_path(project, folders, &path),
                    existing_asset_name: Some(name),
                    existing_managed_path: Some(path.to_string_lossy().into_owned()),
                });
                break;
            }
        }
    }

    if manual_review && warnings.is_empty() {
        Vec::new()
    } else {
        warnings
    }
}

fn normalized_name_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| name.to_string());
    stem.to_lowercase()
        .chars()
        .filter(|character| {
            !character.is_ascii_whitespace() && *character != '-' && *character != '_'
        })
        .collect()
}

fn find_asset_id_by_path(
    project: &ProjectRecord,
    folders: &[FolderRecord],
    path: &Path,
) -> Option<String> {
    let relative_path = relative_to_root(Path::new(&project.root_path), path);
    let relative_folder_path = Path::new(&relative_path)
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let folder_id = if relative_folder_path.is_empty() {
        Some(format!("folder-root-{}", project.id))
    } else {
        folders
            .iter()
            .find(|folder| {
                folder.project_id == project.id && folder.relative_path == relative_folder_path
            })
            .map(|folder| folder.id.clone())
    };
    folder_id.map(|_| asset_id(&project.id, &relative_path))
}

fn collect_reference_targets(
    project_root: &Path,
    from_relative: &str,
    to_relative: &str,
) -> Result<Vec<ReferenceRewrite>, String> {
    let mut rewrites = Vec::new();
    for file_path in walk_files(project_root, &[])? {
        let extension = extension_lowercase(&file_path);
        if !TEXT_REFERENCE_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }
        let mut content = String::new();
        fs::File::open(&file_path)
            .map_err(|error| error.to_string())?
            .read_to_string(&mut content)
            .map_err(|error| error.to_string())?;
        if !content.contains(from_relative) && !content.contains(&from_relative.replace('/', "\\"))
        {
            continue;
        }

        let updated = content.replace(from_relative, to_relative).replace(
            &from_relative.replace('/', "\\"),
            &to_relative.replace('/', "\\"),
        );
        rewrites.push(ReferenceRewrite {
            path: file_path,
            updated_content: updated,
        });
    }

    Ok(rewrites)
}

struct ReferenceRewrite {
    path: PathBuf,
    updated_content: String,
}

fn rewrite_references(rewrites: &[ReferenceRewrite]) -> Result<(), String> {
    let mut written_paths = Vec::new();
    for rewrite in rewrites {
        match fs::File::create(&rewrite.path) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(rewrite.updated_content.as_bytes()) {
                    rollback_reference_writes(&written_paths)?;
                    return Err(error.to_string());
                }
                written_paths.push(rewrite.path.clone());
            }
            Err(error) => {
                rollback_reference_writes(&written_paths)?;
                return Err(error.to_string());
            }
        }
    }
    Ok(())
}

fn rollback_reference_writes(_written_paths: &[PathBuf]) -> Result<(), String> {
    Ok(())
}

fn refresh_rule_attention(rules: &mut [RuleRecord], folders: &[FolderRecord]) {
    for rule in rules {
        rule.needs_attention = !folder_reference_exists(folders, rule);
    }
}

fn folder_reference_exists(folders: &[FolderRecord], rule: &RuleRecord) -> bool {
    folders.iter().any(|folder| {
        folder.project_id == rule.target_project_id
            && (rule
                .target_folder_id
                .as_deref()
                .map(|folder_id| folder.id == folder_id)
                .unwrap_or(false)
                || folder.relative_path == rule.target_relative_path)
    })
}

fn upsert_folders(
    all_folders: &mut Vec<FolderRecord>,
    project_id: &str,
    folders: Vec<FolderRecord>,
) {
    all_folders.retain(|folder| folder.project_id != project_id);
    all_folders.extend(folders);
    all_folders.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
}

fn upsert_assets(all_assets: &mut Vec<AssetRecord>, project_id: &str, assets: Vec<AssetRecord>) {
    all_assets.retain(|asset| asset.project_id != project_id);
    all_assets.extend(assets);
    all_assets.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
}

fn detect_kind_and_preview(extension: &str) -> (String, String) {
    match extension {
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif" | "tiff" => {
            ("image".into(), "image".into())
        }
        "pdf" => ("pdf".into(), "pdf".into()),
        "mp4" | "mov" | "m4v" | "webm" | "avi" | "mkv" => ("video".into(), "video".into()),
        "fbx" | "obj" | "stl" | "glb" | "gltf" | "blend" | "3dm" | "step" | "stp" | "bip"
        | "ksp" => ("three_d".into(), "three_d_thumbnail".into()),
        _ => ("document".into(), "unsupported".into()),
    }
}

fn inferred_tags(descriptor: &FileDescriptor) -> Vec<String> {
    let mut tags = HashSet::new();
    tags.insert(descriptor.extension.clone());
    match descriptor.kind.as_str() {
        "image" => {
            tags.insert("image".into());
        }
        "pdf" => {
            tags.insert("document".into());
        }
        "video" => {
            tags.insert("video".into());
        }
        "three_d" => {
            tags.insert("3d".into());
        }
        _ => {
            tags.insert("file".into());
        }
    }

    let lower_name = descriptor.file_name.to_lowercase();
    if lower_name.contains("final") {
        tags.insert("final".into());
    }
    if lower_name.contains("render") {
        tags.insert("render".into());
    }
    if lower_name.contains("reference") || lower_name.contains("ref") {
        tags.insert("reference".into());
    }

    let mut result: Vec<String> = tags.into_iter().collect();
    result.sort();
    result
}

fn normalized_tags(tags: &[String]) -> Vec<String> {
    let mut unique = HashSet::new();
    for tag in tags {
        let trimmed = tag.trim();
        if !trimmed.is_empty() {
            unique.insert(trimmed.to_lowercase());
        }
    }
    let mut result: Vec<String> = unique.into_iter().collect();
    result.sort();
    result
}

fn find_project<'a>(projects: &'a [ProjectRecord], id: &str) -> Option<&'a ProjectRecord> {
    projects.iter().find(|project| project.id == id)
}

fn find_folder<'a>(folders: &'a [FolderRecord], id: &str) -> Option<&'a FolderRecord> {
    folders.iter().find(|folder| folder.id == id)
}

fn folder_id(project_id: &str, relative_path: &str) -> String {
    format!("folder-{project_id}-{}", sanitize_for_id(relative_path))
}

fn asset_id(project_id: &str, relative_path: &str) -> String {
    format!("asset-{project_id}-{}", sanitize_for_id(relative_path))
}

fn sanitize_for_id(value: &str) -> String {
    if value.is_empty() {
        return "root".into();
    }

    let mut result = String::with_capacity(value.len() * 3);
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() {
            result.push(char::from(*byte).to_ascii_lowercase());
        } else {
            let _ = write!(&mut result, "-{byte:02x}");
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::{
        asset_id, choose_assignment, collect_native_drag_paths, describe_file, folder_id,
        normalize_workspace, rescan_project_records, scan_project_assets, scan_project_folders,
        ProjectRecord, WorkspaceIndex,
    };
    use chrono::Local;
    use std::{env, fs, path::PathBuf};

    fn make_test_project(root_path: PathBuf) -> ProjectRecord {
        ProjectRecord {
            id: "project-demo".into(),
            name: "测试项目".into(),
            discipline: "Product Design".into(),
            status: "Active".into(),
            root_path: root_path.to_string_lossy().into_owned(),
            last_opened_at: "2026-05-06 00:00".into(),
            created_at: "2026-05-06 00:00".into(),
        }
    }

    #[test]
    fn folder_ids_do_not_collide_for_same_length_chinese_names() {
        let project_id = "project-demo";
        let folder_a = folder_id(project_id, "其他");
        let folder_b = folder_id(project_id, "动画");
        let folder_c = folder_id(project_id, "建模");

        assert_ne!(folder_a, folder_b);
        assert_ne!(folder_a, folder_c);
        assert_ne!(folder_b, folder_c);
    }

    #[test]
    fn asset_ids_do_not_collide_for_same_length_chinese_file_names() {
        let project_id = "project-demo";
        let asset_a = asset_id(project_id, "建模/方案一.3dm");
        let asset_b = asset_id(project_id, "建模/方案二.3dm");

        assert_ne!(asset_a, asset_b);
    }

    #[test]
    fn scan_project_assets_keeps_same_length_chinese_sibling_folders_distinct() {
        let root = env::temp_dir().join(format!(
            "fluxmint-scan-test-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(root.join("其他")).unwrap();
        fs::create_dir_all(root.join("动画")).unwrap();
        fs::write(root.join("其他").join("参考图.png"), b"test").unwrap();
        fs::write(root.join("动画").join("镜头图.png"), b"test").unwrap();

        let project = make_test_project(root.clone());
        let projects = vec![project.clone()];
        let folders = scan_project_folders(&project, &projects).unwrap();
        let assets = scan_project_assets(&project, &folders, &projects).unwrap();

        let other_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "其他")
            .unwrap();
        let motion_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "动画")
            .unwrap();
        let other_asset = assets
            .iter()
            .find(|asset| asset.relative_path == "其他/参考图.png")
            .unwrap();
        let motion_asset = assets
            .iter()
            .find(|asset| asset.relative_path == "动画/镜头图.png")
            .unwrap();

        assert_eq!(
            other_asset.folder_id.as_deref(),
            Some(other_folder.id.as_str())
        );
        assert_eq!(other_asset.relative_folder_path, "其他");
        assert_eq!(
            motion_asset.folder_id.as_deref(),
            Some(motion_folder.id.as_str())
        );
        assert_eq!(motion_asset.relative_folder_path, "动画");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn normalize_workspace_keeps_projects_isolated_with_shared_folder_names() {
        let root = env::temp_dir().join(format!(
            "fluxmint-project-isolation-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let project_a_root = root.join("project-a");
        let project_b_root = root.join("project-b");
        fs::create_dir_all(project_a_root.join("Renders")).unwrap();
        fs::create_dir_all(project_b_root.join("Renders")).unwrap();
        fs::write(project_a_root.join("Renders").join("watch.png"), b"a").unwrap();
        fs::write(project_b_root.join("Renders").join("chair.png"), b"b").unwrap();

        let project_a = ProjectRecord {
            id: "project-a".into(),
            name: "Project A".into(),
            discipline: "Product Design".into(),
            status: "Active".into(),
            root_path: project_a_root.to_string_lossy().into_owned(),
            last_opened_at: "2026-05-07 10:00".into(),
            created_at: "2026-05-07 10:00".into(),
        };
        let project_b = ProjectRecord {
            id: "project-b".into(),
            name: "Project B".into(),
            discipline: "Product Design".into(),
            status: "Active".into(),
            root_path: project_b_root.to_string_lossy().into_owned(),
            last_opened_at: "2026-05-07 10:00".into(),
            created_at: "2026-05-07 10:00".into(),
        };

        let mut index = WorkspaceIndex {
            projects: vec![project_a.clone(), project_b.clone()],
            ..WorkspaceIndex::default()
        };

        normalize_workspace(&mut index).unwrap();

        let project_a_assets: Vec<_> = index
            .assets
            .iter()
            .filter(|asset| asset.project_id == project_a.id)
            .collect();
        let project_b_assets: Vec<_> = index
            .assets
            .iter()
            .filter(|asset| asset.project_id == project_b.id)
            .collect();

        assert_eq!(project_a_assets.len(), 1);
        assert_eq!(project_b_assets.len(), 1);
        assert_eq!(project_a_assets[0].relative_path, "Renders/watch.png");
        assert_eq!(project_b_assets[0].relative_path, "Renders/chair.png");
        assert_ne!(project_a_assets[0].id, project_b_assets[0].id);
        assert_ne!(project_a_assets[0].folder_id, project_b_assets[0].folder_id);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn nested_subfolders_keep_exact_folder_membership() {
        let root = env::temp_dir().join(format!(
            "fluxmint-folder-membership-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(root.join("Models").join("Shots")).unwrap();
        fs::write(root.join("Models").join("chair.obj"), b"mesh").unwrap();
        fs::write(root.join("Models").join("Shots").join("hero.png"), b"shot").unwrap();

        let project = make_test_project(root.clone());
        let projects = vec![project.clone()];
        let folders = scan_project_folders(&project, &projects).unwrap();
        let assets = scan_project_assets(&project, &folders, &projects).unwrap();

        let models_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "Models")
            .unwrap();
        let shots_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "Models/Shots")
            .unwrap();
        let models_asset = assets
            .iter()
            .find(|asset| asset.relative_path == "Models/chair.obj")
            .unwrap();
        let shots_asset = assets
            .iter()
            .find(|asset| asset.relative_path == "Models/Shots/hero.png")
            .unwrap();

        assert_eq!(
            models_asset.folder_id.as_deref(),
            Some(models_folder.id.as_str())
        );
        assert_eq!(models_asset.relative_folder_path, "Models");
        assert_eq!(
            shots_asset.folder_id.as_deref(),
            Some(shots_folder.id.as_str())
        );
        assert_eq!(shots_asset.relative_folder_path, "Models/Shots");
        assert_ne!(models_asset.folder_id, shots_asset.folder_id);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rescanning_after_move_refreshes_relative_paths_and_ids() {
        let root = env::temp_dir().join(format!(
            "fluxmint-move-rescan-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(root.join("Source")).unwrap();
        fs::create_dir_all(root.join("Target")).unwrap();
        fs::write(root.join("Source").join("sample.png"), b"asset").unwrap();

        let project = make_test_project(root.clone());
        let mut index = WorkspaceIndex {
            projects: vec![project.clone()],
            ..WorkspaceIndex::default()
        };
        normalize_workspace(&mut index).unwrap();

        let old_asset_id = asset_id(&project.id, "Source/sample.png");
        fs::rename(
            root.join("Source").join("sample.png"),
            root.join("Target").join("sample.png"),
        )
        .unwrap();

        let (_, folders, assets) = rescan_project_records(&mut index, &project.id).unwrap();
        let target_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "Target")
            .unwrap();
        let moved_asset = assets
            .iter()
            .find(|asset| asset.relative_path == "Target/sample.png")
            .unwrap();

        assert_eq!(assets.len(), 1);
        assert_eq!(
            moved_asset.folder_id.as_deref(),
            Some(target_folder.id.as_str())
        );
        assert_eq!(moved_asset.relative_folder_path, "Target");
        assert_eq!(moved_asset.id, asset_id(&project.id, "Target/sample.png"));
        assert_ne!(moved_asset.id, old_asset_id);
        assert!(!index.assets.iter().any(|asset| asset.id == old_asset_id));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn current_project_import_mode_prefers_selected_folder() {
        let root = env::temp_dir().join(format!(
            "fluxmint-import-current-project-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let source_root = env::temp_dir().join(format!(
            "fluxmint-import-source-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(root.join("References")).unwrap();
        fs::create_dir_all(&source_root).unwrap();
        let source_path = source_root.join("hero-reference.png");
        fs::write(&source_path, b"preview").unwrap();

        let project = make_test_project(root.clone());
        let projects = vec![project.clone()];
        let folders = scan_project_folders(&project, &projects).unwrap();
        let references_folder = folders
            .iter()
            .find(|folder| folder.relative_path == "References")
            .unwrap();
        let descriptor = describe_file(&source_path).unwrap();

        let assignment = choose_assignment(
            &descriptor,
            "current_project",
            Some(&project),
            Some(references_folder),
            &projects,
            &folders,
            &[],
        )
        .unwrap();

        assert_eq!(assignment.target_project_id, project.id);
        assert_eq!(
            assignment.target_folder_id.as_deref(),
            Some(references_folder.id.as_str())
        );
        assert_eq!(assignment.target_relative_path, "References");
        assert!(!assignment.requires_confirmation);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(source_root);
    }

    #[test]
    fn collect_native_drag_paths_rejects_empty_input() {
        let error = collect_native_drag_paths(&[]).unwrap_err();

        assert!(error.contains("No valid files were provided"));
    }

    #[test]
    fn collect_native_drag_paths_rejects_missing_files() {
        let missing_path = env::temp_dir().join(format!(
            "fluxmint-missing-drag-file-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let request = vec![missing_path.to_string_lossy().into_owned()];
        let error = collect_native_drag_paths(&request).unwrap_err();

        assert!(error.contains("no longer exists on disk"));
    }

    #[test]
    fn collect_native_drag_paths_deduplicates_case_insensitive_inputs() {
        let root = env::temp_dir().join(format!(
            "fluxmint-drag-path-dedupe-{}",
            Local::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        let file_path = root.join("Chair.obj");
        fs::write(&file_path, b"mesh").unwrap();

        let lower = file_path.to_string_lossy().to_lowercase();
        let upper = file_path.to_string_lossy().to_uppercase();
        let request = vec![
            "   ".into(),
            file_path.to_string_lossy().into_owned(),
            lower,
            upper,
        ];

        let resolved = collect_native_drag_paths(&request).unwrap();

        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0], file_path);

        let _ = fs::remove_dir_all(root);
    }
}

fn unique_destination(target_dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let original = Path::new(file_name);
    let stem = original
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "asset".into());
    let extension = original
        .extension()
        .map(|value| value.to_string_lossy().into_owned());

    let mut candidate = target_dir.join(file_name);
    let mut counter = 2;
    while candidate.exists() {
        let renamed = match &extension {
            Some(extension) if !extension.is_empty() => format!("{stem}-{counter}.{extension}"),
            _ => format!("{stem}-{counter}"),
        };
        candidate = target_dir.join(renamed);
        counter += 1;
    }
    candidate
}

fn relative_to_root(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"))
}

fn extension_lowercase(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "file".into())
}

fn modified_label(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = metadata.modified().map_err(|error| error.to_string())?;
    let datetime: chrono::DateTime<Local> = modified.into();
    Ok(datetime.format("%Y-%m-%d %H:%M").to_string())
}

fn now_label() -> String {
    Local::now().format("%Y-%m-%d %H:%M").to_string()
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;

    let bytes_f64 = bytes as f64;
    if bytes_f64 >= GB {
        format!("{:.1} GB", bytes_f64 / GB)
    } else if bytes_f64 >= MB {
        format!("{:.1} MB", bytes_f64 / MB)
    } else if bytes_f64 >= KB {
        format!("{:.1} KB", bytes_f64 / KB)
    } else {
        format!("{bytes} B")
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}
