import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow, type DragDropEvent } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  AppSettings,
  Asset,
  AppTheme,
  ClassificationRule,
  ImportCandidate,
  ImportConflictStrategy,
  ImportWarning,
  ImportPreviewItem,
  Project,
  ProjectFolder,
  RecycleBinEntry,
  SupportedLanguage,
  LanPanelStatus,
  UndoImportRecord,
  UserAction,
} from '../types/domain'

export const isDesktopRuntime = isTauri()

export interface AssetRecord {
  id: string
  projectId: string
  folderId: string | null
  relativeFolderPath: string
  relativePath: string
  managedPath: string
  name: string
  format: string
  kind: Asset['kind']
  previewMode: Asset['previewMode']
  tags: string[]
  fileSizeBytes: number
  fileSizeLabel: string
  originalPath: string
  receivedAt: string
  importedAt: string
  lastModifiedAt: string
  fingerprint: string
}

export interface ProjectRecord {
  id: string
  name: string
  discipline: Project['discipline']
  status: Project['status']
  rootPath: string
  lastOpenedAt: string
  createdAt: string
}

export interface FolderRecord {
  id: string
  projectId: string
  name: string
  relativePath: string
  parentId: string | null
  sortOrder: number
}

export interface RuleRecord {
  id: string
  name: string
  enabled: boolean
  keywords: string[]
  formats: string[]
  targetProjectId: string
  targetFolderId: string | null
  targetRelativePath: string
  suggestedTags: string[]
  confidence: number
  note: string
  needsAttention: boolean
}

export interface SettingsRecord {
  language: SupportedLanguage
  theme?: AppTheme
  defaultImportMode: AppSettings['defaultImportMode']
  favoriteFolders: AppSettings['favoriteFolders']
  recentTargetFolders: AppSettings['recentTargetFolders']
}

export interface LibrarySnapshotResponse {
  projects: ProjectRecord[]
  folders: FolderRecord[]
  assets: AssetRecord[]
  rules: RuleRecord[]
  settings: SettingsRecord
}

export interface OperationHistoryItemRecord {
  id: string
  actionType: UserAction['type']
  detail: string
  timestamp: string
  reversible: boolean
}

export interface OperationHistoryResponse {
  actions: OperationHistoryItemRecord[]
}

export interface UndoActionResponse {
  undone: OperationHistoryItemRecord | null
}

export interface ImportCandidateRecord {
  id: string
  sourcePath: string
  name: string
  extension: string
  kind: ImportCandidate['kind']
  previewMode: ImportCandidate['previewMode']
  fileSizeBytes: number
  fileSizeLabel: string
}

export interface ImportAssignmentRecord {
  candidateId: string
  sourcePath: string
  targetProjectId: string
  targetFolderId: string | null
  targetRelativePath: string
  conflictStrategy: ImportConflictStrategy
  suggestedTags: string[]
  reason: string
  confidence: number
  requiresConfirmation: boolean
  warnings: ImportWarning[]
}

export interface AnalyzeImportResponse {
  candidates: ImportCandidateRecord[]
  assignments: ImportAssignmentRecord[]
}

export interface CommitImportRequest {
  assignments: ImportAssignmentRecord[]
}

export interface CommitImportResponse {
  assets: AssetRecord[]
}

export interface MoveAssetRequest {
  assetIds: string[]
  targetFolderId: string
}

export interface DeleteAssetsRequest {
  assetIds: string[]
}

export interface AssetMutationResponse {
  assets: AssetRecord[]
}

export interface CreateProjectRequest {
  name: string
  rootPath: string
  discipline: Project['discipline']
  status: Project['status']
}

export interface CreateProjectResponse {
  project: ProjectRecord
  folders: FolderRecord[]
  assets: AssetRecord[]
}

export interface RenameAssetResponse {
  asset: AssetRecord
}

export interface SaveRuleResponse {
  rule: RuleRecord
}

export interface FolderMutationResponse {
  folders: FolderRecord[]
  assets: AssetRecord[]
  rules: RuleRecord[]
}

export interface OpenProjectFolderResponse {
  folders: FolderRecord[]
  assets: AssetRecord[]
  rules: RuleRecord[]
}

export interface WorkspaceChangedPayload {
  projectIds: string[]
}

export interface UndoImportResponse {
  assets: AssetRecord[]
  restored: UndoImportRecord | null
}

export interface RecycleEntryRecord {
  id: string
  projectId: string | null
  name: string
  kind: RecycleBinEntry['kind']
  originalPath: string
  recyclePath: string
  deletedAt: string
  sizeLabel: string
}

export interface RecycleBinResponse {
  entries: RecycleEntryRecord[]
}

export interface LanPanelDeviceRecord {
  id: string
  ip: string
  label: string
  firstSeenAt: string
  lastSeenAt: string
  online: boolean
}

export interface LanPanelStatusRecord {
  serverEnabled: boolean
  workspaceSelected: boolean
  workspaceName: string | null
  workspacePath: string | null
  authMode: LanPanelStatus['authMode']
  hasCode: boolean
  accessCode: string | null
  port: number | null
  addresses: string[]
  devices: LanPanelDeviceRecord[]
}

export interface RecycleBinMutationRequest {
  entryIds: string[]
}

export interface NativeFileDragRequest {
  managedPaths: string[]
}

export interface ManagedPathRequest {
  path: string
}

export interface ExternalTargetRequest {
  target: string
}

export function toDomainProject(record: ProjectRecord): Project {
  return { ...record }
}

export function toDomainFolder(record: FolderRecord): ProjectFolder {
  return { ...record }
}

export function toDomainRule(record: RuleRecord): ClassificationRule {
  return { ...record }
}

function normalizeTheme(theme?: string): AppTheme {
  switch (theme) {
    case 'light':
    case 'dark':
    case 'system':
      return theme
    default:
      return 'system'
  }
}

export function toDomainSettings(record: SettingsRecord): AppSettings {
  return {
    language: record.language,
    theme: normalizeTheme(record.theme),
    defaultImportMode: record.defaultImportMode,
    favoriteFolders: record.favoriteFolders,
    recentTargetFolders: record.recentTargetFolders,
  }
}

export function toDomainAsset(record: AssetRecord): Asset {
  const previewUrl =
    record.previewMode === 'image' ||
    record.previewMode === 'pdf' ||
    record.previewMode === 'video' ||
    record.previewMode === 'three_d_thumbnail'
      ? convertFileSrc(record.managedPath)
      : null

  return {
    id: record.id,
    projectId: record.projectId,
    folderId: record.folderId,
    relativeFolderPath: record.relativeFolderPath,
    relativePath: record.relativePath,
    managedPath: record.managedPath,
    name: record.name,
    format: record.format,
    kind: record.kind,
    previewMode: record.previewMode,
    previewUrl,
    thumbnail: record.previewMode === 'image' ? previewUrl : null,
    tags: record.tags,
    meta: {
      fileSize: record.fileSizeLabel,
      fileSizeBytes: record.fileSizeBytes,
      notes: `Imported at ${record.importedAt}`,
    },
    source: {
      originalPath: record.originalPath,
      receivedAt: record.receivedAt,
    },
    lastModifiedAt: record.lastModifiedAt,
    fingerprint: record.fingerprint,
  }
}

export function toDomainAction(record: OperationHistoryItemRecord): UserAction {
  return {
    id: record.id,
    assetId: null,
    type: record.actionType,
    detail: record.detail,
    timestamp: record.timestamp,
    reversible: record.reversible,
  }
}

export function mergeImportPreview(
  candidates: ImportCandidateRecord[],
  assignments: ImportAssignmentRecord[],
): ImportPreviewItem[] {
  return candidates.map((candidate) => ({
    ...candidate,
    assignment: assignments.find((assignment) => assignment.candidateId === candidate.id) ?? null,
    warnings: assignments.find((assignment) => assignment.candidateId === candidate.id)?.warnings ?? [],
  }))
}

export function toDomainRecycleEntry(record: RecycleEntryRecord): RecycleBinEntry {
  return { ...record }
}

export function toDomainLanPanelStatus(record: LanPanelStatusRecord): LanPanelStatus {
  return { ...record }
}

export async function loadWorkspace() {
  return invoke<LibrarySnapshotResponse>('load_workspace')
}

export async function loadLanPanelStatus() {
  return invoke<LanPanelStatusRecord>('get_lan_panel_status')
}

export async function loadOperationHistory() {
  return invoke<OperationHistoryResponse>('load_operation_history')
}

export async function createProject(request: CreateProjectRequest) {
  return invoke<CreateProjectResponse>('create_project', { request })
}

export async function unbindProject(projectId: string) {
  return invoke<LibrarySnapshotResponse>('unbind_project', {
    request: { projectId },
  })
}

export async function openProjectRoot() {
  const selected = await open({
    title: 'Select Project Folder',
    directory: true,
    multiple: false,
  })

  if (!selected || Array.isArray(selected)) {
    return null
  }

  return selected
}

export async function chooseLanPanelWorkspace() {
  const selected = await open({
    title: 'Select LAN Workspace Folder',
    directory: true,
    multiple: false,
  })

  if (!selected || Array.isArray(selected)) {
    return null
  }

  return selected
}

export async function chooseFilesForImport() {
  const selected = await open({
    title: 'Select Files',
    multiple: true,
  })

  if (!selected) {
    return []
  }

  return Array.isArray(selected) ? selected : [selected]
}

export async function analyzeImport(
  paths: string[],
  mode: AppSettings['defaultImportMode'],
  currentProjectId: string | null,
  currentFolderId: string | null,
) {
  return invoke<AnalyzeImportResponse>('analyze_import', {
    request: {
      paths,
      mode,
      currentProjectId,
      currentFolderId,
    },
  })
}

export async function commitImport(request: CommitImportRequest) {
  return invoke<CommitImportResponse>('commit_import', { request })
}

export async function moveAssets(request: MoveAssetRequest) {
  return invoke<AssetMutationResponse>('move_assets', { request })
}

export async function deleteAssets(request: DeleteAssetsRequest) {
  return invoke<AssetMutationResponse>('delete_assets', { request })
}

export async function undoLastImport() {
  return invoke<UndoImportResponse>('undo_last_import')
}

export async function undoLastAction() {
  return invoke<UndoActionResponse>('undo_last_action')
}

export async function loadRecycleBin() {
  return invoke<RecycleBinResponse>('load_recycle_bin')
}

export async function restoreRecycleEntries(request: RecycleBinMutationRequest) {
  return invoke<RecycleBinResponse>('restore_recycle_entries', { request })
}

export async function emptyRecycleBin(request?: Partial<RecycleBinMutationRequest>) {
  return invoke<RecycleBinResponse>('empty_recycle_bin', {
    request: {
      entryIds: request?.entryIds ?? [],
    },
  })
}

export async function resolveNativePreview(managedPath: string, fingerprint: string, format: string) {
  const previewPath = await invoke<string | null>('resolve_native_preview', {
    request: {
      managedPath,
      fingerprint,
      format,
    },
  })

  return previewPath ? convertFileSrc(previewPath) : null
}

export async function startNativeFileDrag(managedPaths: string[]) {
  return invoke<void>('start_native_file_drag', {
    request: {
      managedPaths,
    } satisfies NativeFileDragRequest,
  })
}

export async function renameAsset(assetId: string, nextName: string) {
  return invoke<RenameAssetResponse>('rename_asset', {
    request: {
      assetId,
      nextName,
    },
  })
}

export async function saveRule(rule: ClassificationRule) {
  return invoke<SaveRuleResponse>('save_rule', {
    request: { rule },
  })
}

export async function deleteRule(ruleId: string) {
  return invoke<LibrarySnapshotResponse>('delete_rule', {
    request: { ruleId },
  })
}

export async function saveSettings(settings: AppSettings) {
  return invoke<SettingsRecord>('save_settings', {
    request: settings,
  })
}

export async function createFolder(projectId: string, parentId: string | null, name: string) {
  return invoke<FolderMutationResponse>('create_folder', {
    request: { projectId, parentId, name },
  })
}

export async function renameFolder(folderId: string, name: string) {
  return invoke<FolderMutationResponse>('rename_folder', {
    request: { folderId, name },
  })
}

export async function deleteFolder(folderId: string) {
  return invoke<FolderMutationResponse>('delete_folder', {
    request: { folderId },
  })
}

export async function rescanProject(projectId: string) {
  return invoke<OpenProjectFolderResponse>('rescan_project', {
    request: { projectId },
  })
}

export async function setLanPanelWorkspace(path: string) {
  return invoke<LanPanelStatusRecord>('set_lan_panel_workspace', {
    request: { path },
  })
}

export async function startLanPanelServer() {
  return invoke<LanPanelStatusRecord>('start_lan_panel_server')
}

export async function stopLanPanelServer() {
  return invoke<LanPanelStatusRecord>('stop_lan_panel_server')
}

export async function regenerateLanPanelCode() {
  return invoke<LanPanelStatusRecord>('regenerate_lan_panel_code')
}

export async function subscribeToDesktopDragDrop(
  handler: (event: { payload: DragDropEvent }) => void,
): Promise<UnlistenFn> {
  return getCurrentWindow().onDragDropEvent(handler)
}

export async function subscribeToWorkspaceChanges(
  handler: (payload: WorkspaceChangedPayload) => void,
): Promise<UnlistenFn> {
  return listen<WorkspaceChangedPayload>('workspace-changed', (event) => {
    handler(event.payload)
  })
}

export async function openManagedPath(path: string) {
  return invoke<void>('open_managed_path', {
    request: {
      path,
    } satisfies ManagedPathRequest,
  })
}

export async function revealManagedPath(path: string) {
  return invoke<void>('reveal_managed_path', {
    request: {
      path,
    } satisfies ManagedPathRequest,
  })
}

export async function openExternalTarget(target: string) {
  if (!isDesktopRuntime) {
    window.open(target, '_blank', 'noopener,noreferrer')
    return
  }

  return invoke<void>('open_external_target', {
    request: {
      target,
    } satisfies ExternalTargetRequest,
  })
}
