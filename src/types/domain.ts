export type Discipline =
  | 'Product Design'
  | 'Branding'
  | 'Spatial'
  | 'Motion'
  | 'Cross-disciplinary'

export type ProjectStatus = 'Active' | 'Review' | 'Archived'

export type AssetKind = 'image' | 'pdf' | 'video' | 'three_d' | 'document'

export type PreviewCapability =
  | 'image'
  | 'pdf'
  | 'video'
  | 'three_d_thumbnail'
  | 'unsupported'

export type SupportedLanguage = 'zh-CN' | 'en-US'

export type AppTheme = 'system' | 'light' | 'dark'

export type ImportMode = 'auto' | 'manual' | 'current_project'

export type ImportConflictStrategy = 'skip' | 'keep_both' | 'replace'

export type AssetKindFilter = 'all' | AssetKind

export type UserActionType =
  | 'create_project'
  | 'unbind_project'
  | 'create_folder'
  | 'rename_folder'
  | 'delete_folder'
  | 'import_files'
  | 'undo_import'
  | 'undo_action'
  | 'rename_asset'
  | 'move_asset'
  | 'delete_assets'
  | 'update_rule'
  | 'delete_rule'
  | 'open_external'
  | 'reveal_in_folder'
  | 'toggle_favorite'
  | 'restore_recycle'
  | 'empty_recycle'

export type ImportWarningKind = 'exact_duplicate' | 'same_name_conflict' | 'similar_name'

export interface ProjectFolder {
  id: string
  projectId: string
  name: string
  relativePath: string
  parentId: string | null
  sortOrder: number
}

export interface Project {
  id: string
  name: string
  discipline: Discipline
  status: ProjectStatus
  rootPath: string
  lastOpenedAt: string
  createdAt: string
}

export interface ProjectCreateInput {
  name: string
  rootPath: string
  discipline: Discipline
  status: ProjectStatus
}

export interface AssetMeta {
  dimensions?: string
  duration?: string
  pages?: number
  fileSize: string
  fileSizeBytes: number
  polygons?: string
  software?: string
  notes?: string
}

export interface AssetSource {
  originalPath: string
  receivedAt: string
}

export interface Asset {
  id: string
  projectId: string
  folderId: string | null
  relativeFolderPath: string
  relativePath: string
  managedPath: string
  name: string
  format: string
  kind: AssetKind
  previewMode: PreviewCapability
  previewUrl?: string | null
  thumbnail?: string | null
  tags: string[]
  meta: AssetMeta
  source: AssetSource
  lastModifiedAt: string
  fingerprint: string
}

export interface ClassificationRule {
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

export interface ImportCandidate {
  id: string
  sourcePath: string
  name: string
  extension: string
  kind: AssetKind
  previewMode: PreviewCapability
  fileSizeBytes: number
  fileSizeLabel: string
}

export interface ImportAssignment {
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
}

export interface ImportWarning {
  kind: ImportWarningKind
  message: string
  existingAssetId: string | null
  existingAssetName: string | null
  existingManagedPath: string | null
}

export interface ImportPreviewItem extends ImportCandidate {
  assignment: ImportAssignment | null
  warnings: ImportWarning[]
}

export interface FolderShortcut {
  projectId: string
  relativePath: string
}

export interface AppSettings {
  language: SupportedLanguage
  theme: AppTheme
  defaultImportMode: ImportMode
  favoriteFolders: FolderShortcut[]
  recentTargetFolders: FolderShortcut[]
}

export interface LanPanelDevice {
  id: string
  ip: string
  label: string
  firstSeenAt: string
  lastSeenAt: string
  online: boolean
}

export interface LanPanelStatus {
  serverEnabled: boolean
  workspaceSelected: boolean
  workspaceName: string | null
  workspacePath: string | null
  authMode: 'one_time_code'
  hasCode: boolean
  accessCode: string | null
  port: number | null
  addresses: string[]
  devices: LanPanelDevice[]
}

export interface RecycleBinEntry {
  id: string
  projectId: string | null
  name: string
  kind: 'file' | 'folder'
  originalPath: string
  recyclePath: string
  deletedAt: string
  sizeLabel: string
}

export interface UndoImportRecord {
  batchId: string
  assetIds: string[]
  importedAt: string
  restoredCount: number
}

export interface UserAction {
  id: string
  assetId: string | null
  type: UserActionType
  detail: string
  timestamp: string
  reversible?: boolean
}
