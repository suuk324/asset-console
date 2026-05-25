import { create } from 'zustand'
import {
  analyzeImport,
  chooseFilesForImport,
  chooseLanPanelWorkspace,
  commitImport,
  createFileVersion as createFileVersionRequest,
  createFolder,
  createProject as createProjectRequest,
  createProjectVersion as createProjectVersionRequest,
  deleteAssets as deleteAssetsRequest,
  deleteFolder,
  deleteRule,
  emptyRecycleBin as emptyRecycleBinRequest,
  isDesktopRuntime,
  loadLanPanelStatus,
  loadFileVersions,
  loadProjectVersions,
  loadRecycleBin,
  loadOperationHistory,
  loadWorkspace,
  moveAssets as moveAssetsRequest,
  openManagedPath,
  openProjectRoot,
  renameAsset as renameAssetRequest,
  renameFolder,
  rescanProject,
  revealManagedPath,
  restoreRecycleEntries as restoreRecycleEntriesRequest,
  restoreFileVersion as restoreFileVersionRequest,
  restoreProjectVersion as restoreProjectVersionRequest,
  saveRule as saveRuleRequest,
  saveSettings as saveSettingsRequest,
  setLanPanelWorkspace as setLanPanelWorkspaceRequest,
  startLanPanelServer as startLanPanelServerRequest,
  stopLanPanelServer as stopLanPanelServerRequest,
  regenerateLanPanelCode as regenerateLanPanelCodeRequest,
  subscribeToDesktopDragDrop,
  subscribeToWorkspaceChanges,
  toDomainAsset,
  toDomainAction,
  toDomainFileVersion,
  toDomainFolder,
  toDomainLanPanelStatus,
  toDomainProjectVersion,
  toDomainProject,
  toDomainRecycleEntry,
  toDomainRule,
  toDomainSettings,
  unbindProject as unbindProjectRequest,
  undoLastAction as undoLastActionRequest,
  undoLastImport as undoLastImportRequest,
  type ImportAssignmentRecord,
} from '../adapters/desktopBridge'
import { t } from '../i18n/translate'
import type {
  AppSettings,
  AppTheme,
  Asset,
  AssetKindFilter,
  ClassificationRule,
  FileVersion,
  FolderShortcut,
  ImportMode,
  ImportPreviewItem,
  LanPanelStatus,
  Project,
  ProjectCreateInput,
  ProjectFolder,
  ProjectVersion,
  RecycleBinEntry,
  SupportedLanguage,
  UserAction,
} from '../types/domain'

interface ToastState {
  title: string
  message: string
}

interface AssetConsoleState {
  runtimeReady: boolean
  loading: boolean
  lanPanelLoading: boolean
  projects: Project[]
  folders: ProjectFolder[]
  assets: Asset[]
  rules: ClassificationRule[]
  settings: AppSettings
  lanPanelStatus: LanPanelStatus
  selectedProjectId: string | null
  selectedFolderId: string | null
  selectedAssetId: string | null
  selectedAssetIds: string[]
  searchQuery: string
  assetKindFilter: AssetKindFilter
  sidebarCollapsed: boolean
  inspectorCollapsed: boolean
  projectFileViewMode: 'list' | 'grid'
  activePageContext: string | null
  actions: UserAction[]
  dropState: 'idle' | 'hovering' | 'importing'
  importPlan: ImportPreviewItem[]
  importPanelOpen: boolean
  recycleEntries: RecycleBinEntry[]
  assetVersions: Record<string, FileVersion[]>
  versionLoadingAssetId: string | null
  projectVersions: Record<string, ProjectVersion[]>
  projectVersionBackupPaths: Record<string, string>
  projectVersionLoadingId: string | null
  toast: ToastState | null
  dragSubscriptionReady: boolean
  workspaceWatchSubscriptionReady: boolean
  workspaceWatchEnabled: boolean
  boot: () => Promise<void>
  refreshLanPanelStatus: () => Promise<void>
  pickLanPanelWorkspace: () => Promise<void>
  startLanPanelServer: () => Promise<void>
  stopLanPanelServer: () => Promise<void>
  regenerateLanPanelCode: () => Promise<void>
  bindExistingProject: () => Promise<void>
  createProject: (input: ProjectCreateInput) => Promise<void>
  unbindProject: (projectId: string) => Promise<string | null>
  setSelectedProject: (projectId: string | null) => void
  setSelectedFolder: (folderId: string | null) => void
  setSelectedAsset: (assetId: string | null, additive?: boolean, range?: boolean) => void
  setAssetSelection: (assetIds: string[], activeAssetId?: string | null) => void
  clearAssetSelection: () => void
  setSearchQuery: (query: string) => void
  setAssetKindFilter: (kind: AssetKindFilter) => void
  toggleSidebarCollapsed: () => void
  toggleInspectorCollapsed: () => void
  setProjectFileViewMode: (mode: 'list' | 'grid') => void
  setActivePageContext: (context: string | null) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  importFromDialog: (preferredMode?: ImportMode) => Promise<void>
  handleDroppedPaths: (paths: string[], preferredMode?: ImportMode) => Promise<void>
  applyImportAssignments: (assignments: ImportAssignmentRecord[]) => Promise<void>
  closeImportPanel: () => void
  undoLastAction: () => Promise<void>
  undoLastImport: () => Promise<void>
  renameAsset: (assetId: string, nextName: string) => Promise<void>
  moveSelectedAssets: (targetFolderId: string, assetIds?: string[]) => Promise<void>
  deleteSelectedAssets: () => Promise<void>
  loadAssetVersions: (assetId: string) => Promise<void>
  createAssetVersion: (assetId: string, note?: string) => Promise<void>
  restoreAssetVersion: (assetId: string, versionId: string) => Promise<void>
  loadProjectVersions: (projectId: string) => Promise<void>
  createProjectVersion: (projectId: string, note?: string) => Promise<void>
  restoreProjectVersion: (projectId: string, versionId: string) => Promise<void>
  restoreRecycleEntries: (entryIds: string[]) => Promise<void>
  emptyRecycleBin: (entryIds?: string[]) => Promise<void>
  openAsset: (assetId: string) => Promise<void>
  revealAsset: (assetId: string) => Promise<void>
  saveRule: (rule: ClassificationRule) => Promise<void>
  removeRule: (ruleId: string) => Promise<void>
  createProjectFolder: (name: string, parentId: string | null) => Promise<void>
  renameProjectFolder: (folderId: string, name: string) => Promise<void>
  deleteProjectFolder: (folderId: string) => Promise<void>
  toggleFavoriteFolder: (shortcut: FolderShortcut) => Promise<void>
  refreshProject: (projectId: string) => Promise<void>
  showToast: (title: string, message: string) => void
  clearToast: () => void
}

const emptySettings: AppSettings = {
  language: 'zh-CN',
  theme: 'system',
  defaultImportMode: 'manual',
  favoriteFolders: [],
  recentTargetFolders: [],
}

const emptyLanPanelStatus: LanPanelStatus = {
  serverEnabled: false,
  workspaceSelected: false,
  workspaceName: null,
  workspacePath: null,
  authMode: 'one_time_code',
  hasCode: false,
  accessCode: null,
  port: null,
  addresses: [],
  devices: [],
}

const suppressedWorkspaceRefreshCounts = new Map<string, number>()

function nowTimestamp() {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function appendAction(actions: UserAction[], action: Omit<UserAction, 'id' | 'timestamp'>): UserAction[] {
  return [
    {
      ...action,
      id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: nowTimestamp(),
    },
    ...actions,
  ]
}

function currentLanguage(settings: AppSettings): SupportedLanguage {
  return settings.language
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}

function importSuccessMessage(language: SupportedLanguage, count: number) {
  return language === 'zh-CN'
    ? `\u5df2\u79fb\u52a8 ${count} \u4e2a\u6587\u4ef6\u5230\u9879\u76ee\u76ee\u5f55\u3002`
    : `${count} files moved into project folders.`
}

function moveSuccessMessage(language: SupportedLanguage, count: number) {
  return language === 'zh-CN'
    ? `\u5df2\u79fb\u52a8 ${count} \u4e2a\u6587\u4ef6\u5230\u76ee\u6807\u76ee\u5f55\u3002`
    : `${count} files moved into the selected folder.`
}

function deleteSuccessMessage(language: SupportedLanguage, count: number) {
  return language === 'zh-CN'
    ? `\u5df2\u5c06 ${count} \u4e2a\u6587\u4ef6\u79fb\u5165\u56de\u6536\u533a\u3002`
    : `${count} files were moved to the recycle bin.`
}

function themeModeSummary(language: SupportedLanguage, theme: AppTheme) {
  if (language === 'zh-CN') {
    switch (theme) {
      case 'light':
        return '浅色'
      case 'dark':
        return '深色'
      case 'system':
      default:
        return '跟随系统'
    }
  }

  switch (theme) {
    case 'light':
      return 'Light'
    case 'dark':
      return 'Dark'
    case 'system':
    default:
      return 'System'
  }
}

const persistedActionTypes: UserAction['type'][] = [
  'import_files',
  'rename_asset',
  'move_asset',
  'delete_assets',
  'undo_action',
  'create_version',
  'restore_version',
  'create_project_version',
  'restore_project_version',
]

function mergeVisibleActions(currentActions: UserAction[], persistedActions: UserAction[]) {
  const localActions = currentActions.filter((action) => !persistedActionTypes.includes(action.type))
  return [...persistedActions, ...localActions].slice(0, 120)
}

function mergeProjectSnapshot(
  state: Pick<AssetConsoleState, 'folders' | 'assets'>,
  projectId: string,
  folders: ProjectFolder[],
  assets: Asset[],
) {
  return {
    folders: [...state.folders.filter((folder) => folder.projectId !== projectId), ...folders].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    ),
    assets: [...state.assets.filter((asset) => asset.projectId !== projectId), ...assets].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    ),
  }
}

function replaceAssets(assets: Asset[]) {
  return [...assets].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function mergeImportedAssets(currentAssets: Asset[], importedAssets: Asset[]) {
  const importedIds = new Set(importedAssets.map((asset) => asset.id))
  const importedPaths = new Set(importedAssets.map((asset) => asset.managedPath))
  return replaceAssets(
    currentAssets
      .filter((asset) => !importedIds.has(asset.id) && !importedPaths.has(asset.managedPath))
      .concat(importedAssets),
  )
}

function suppressNextWorkspaceRefresh(projectIds: string[]) {
  for (const projectId of new Set(projectIds.filter(Boolean))) {
    suppressedWorkspaceRefreshCounts.set(projectId, (suppressedWorkspaceRefreshCounts.get(projectId) ?? 0) + 1)
  }
}

function consumeSuppressedWorkspaceRefresh(projectId: string) {
  const currentCount = suppressedWorkspaceRefreshCounts.get(projectId) ?? 0
  if (currentCount <= 0) {
    return false
  }
  if (currentCount === 1) {
    suppressedWorkspaceRefreshCounts.delete(projectId)
  } else {
    suppressedWorkspaceRefreshCounts.set(projectId, currentCount - 1)
  }
  return true
}

function applyWorkspaceSnapshot(
  state: Pick<
    AssetConsoleState,
    | 'projects'
    | 'folders'
    | 'assets'
    | 'rules'
    | 'settings'
    | 'selectedProjectId'
    | 'selectedFolderId'
    | 'selectedAssetId'
    | 'selectedAssetIds'
  >,
  snapshot: Awaited<ReturnType<typeof loadWorkspace>>,
) {
  const projects = snapshot.projects.map(toDomainProject)
  const folders = snapshot.folders.map(toDomainFolder)
  const assets = snapshot.assets.map(toDomainAsset)
  const rules = snapshot.rules.map(toDomainRule)
  const settings = toDomainSettings(snapshot.settings)
  const selectedProjectId = projects.some((project) => project.id === state.selectedProjectId)
    ? state.selectedProjectId
    : projects[0]?.id ?? null
  const scopedFolders = selectedProjectId
    ? folders.filter((folder) => folder.projectId === selectedProjectId)
    : folders
  const scopedAssets = selectedProjectId
    ? assets.filter((asset) => asset.projectId === selectedProjectId)
    : assets
  const selectedFolderId = scopedFolders.some((folder) => folder.id === state.selectedFolderId)
    ? state.selectedFolderId
    : null
  const retainedAssetIds = state.selectedAssetIds.filter((assetId) =>
    scopedAssets.some((asset) => asset.id === assetId),
  )
  const selectedAssetId = scopedAssets.some((asset) => asset.id === state.selectedAssetId)
    ? state.selectedAssetId
    : retainedAssetIds.at(-1) ?? scopedAssets[0]?.id ?? null
  const selectedAssetIds =
    retainedAssetIds.length > 0
      ? retainedAssetIds
      : selectedAssetId
        ? [selectedAssetId]
        : []

  return {
    projects,
    folders,
    assets,
    rules,
    settings,
    selectedProjectId,
    selectedFolderId,
    selectedAssetId,
    selectedAssetIds,
  }
}

function totalImportWarnings(importPlan: ImportPreviewItem[]) {
  return importPlan.reduce((sum, item) => sum + item.warnings.length, 0)
}

function resolveDropImportMode(
  preferredMode: ImportMode | undefined,
  state: Pick<AssetConsoleState, 'activePageContext' | 'selectedProjectId' | 'settings'>,
): ImportMode {
  if (preferredMode) {
    return preferredMode
  }

  if (state.activePageContext === 'project' && state.selectedProjectId) {
    return 'current_project'
  }

  if (state.activePageContext === 'overview') {
    return 'manual'
  }

  return state.settings.defaultImportMode
}

export const useAssetConsoleStore = create<AssetConsoleState>((set, get) => ({
  runtimeReady: false,
  loading: false,
  lanPanelLoading: false,
  projects: [],
  folders: [],
  assets: [],
  rules: [],
  settings: emptySettings,
  lanPanelStatus: emptyLanPanelStatus,
  selectedProjectId: null,
  selectedFolderId: null,
  selectedAssetId: null,
  selectedAssetIds: [],
  searchQuery: '',
  assetKindFilter: 'all',
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  projectFileViewMode: 'list',
  activePageContext: null,
  actions: [],
  dropState: 'idle',
  importPlan: [],
  importPanelOpen: false,
  recycleEntries: [],
  assetVersions: {},
  versionLoadingAssetId: null,
  projectVersions: {},
  projectVersionBackupPaths: {},
  projectVersionLoadingId: null,
  toast: null,
  dragSubscriptionReady: false,
  workspaceWatchSubscriptionReady: false,
  workspaceWatchEnabled: false,
  async boot() {
    if (!isDesktopRuntime) {
      set({
        runtimeReady: true,
        toast: {
          title: 'Desktop runtime required',
          message: 'This version is intended to run as a Tauri desktop app.',
        },
      })
      return
    }

    set({ loading: true })
    try {
      const lanPanelStatusPromise = loadLanPanelStatus().catch(() => null)
      const [snapshot, history, recycleBin] = await Promise.all([
        loadWorkspace(),
        loadOperationHistory(),
        loadRecycleBin(),
      ])
      const lanPanelStatus = await lanPanelStatusPromise
      set((state) => ({
        runtimeReady: true,
        loading: false,
        ...applyWorkspaceSnapshot(state, snapshot),
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        lanPanelStatus: lanPanelStatus ? toDomainLanPanelStatus(lanPanelStatus) : state.lanPanelStatus,
      }))

      if (!get().dragSubscriptionReady) {
        await subscribeToDesktopDragDrop((event) => {
          const payload = event.payload
          if (payload.type === 'enter' || payload.type === 'over') {
            set({ dropState: 'hovering' })
            return
          }
          if (payload.type === 'drop') {
            void get().handleDroppedPaths(payload.paths)
            return
          }
          set({ dropState: 'idle' })
        })
        set({ dragSubscriptionReady: true })
      }

      if (!get().workspaceWatchSubscriptionReady) {
        await subscribeToWorkspaceChanges((payload) => {
          const nextProjectIds = payload.projectIds.filter((projectId) =>
            get().projects.some((project) => project.id === projectId),
          )
          const refreshProjectIds = nextProjectIds.filter((projectId) => !consumeSuppressedWorkspaceRefresh(projectId))
          if (refreshProjectIds.length === 0) {
            return
          }

          void (async () => {
            try {
              for (const projectId of refreshProjectIds) {
                await get().refreshProject(projectId)
              }
              const language = currentLanguage(get().settings)
              set(() => ({
                workspaceWatchEnabled: true,
                toast: {
                  title: t(language, 'autoRefreshOn'),
                  message: t(language, 'autoRefreshDetected'),
                },
              }))
            } catch (error) {
              set({
                toast: {
                  title: 'Auto refresh failed',
                  message: readErrorMessage(error, 'Unable to refresh workspace changes.'),
                },
              })
            }
          })()
        })
        set({
          workspaceWatchSubscriptionReady: true,
          workspaceWatchEnabled: true,
        })
      }
    } catch (error) {
      set({
        loading: false,
        toast: {
          title: 'Workspace load failed',
          message: readErrorMessage(error, 'Unable to load workspace data.'),
        },
      })
    }
  },
  async refreshLanPanelStatus() {
    set({ lanPanelLoading: true })
    try {
      const status = await loadLanPanelStatus()
      set({
        lanPanelLoading: false,
        lanPanelStatus: toDomainLanPanelStatus(status),
      })
    } catch (error) {
      set({
        lanPanelLoading: false,
        toast: {
          title: 'LAN panel refresh failed',
          message: readErrorMessage(error, 'Unable to refresh the LAN panel status.'),
        },
      })
    }
  },
  async pickLanPanelWorkspace() {
    const selected = await chooseLanPanelWorkspace()
    if (!selected) {
      return
    }

    set({ lanPanelLoading: true })
    try {
      const status = await setLanPanelWorkspaceRequest(selected)
      const lanPanelStatus = toDomainLanPanelStatus(status)
      const language = currentLanguage(get().settings)
      set({
        lanPanelLoading: false,
        lanPanelStatus,
        toast: {
          title: language === 'zh-CN' ? '工作目录已设置' : 'Workspace selected',
          message: lanPanelStatus.workspacePath ?? selected,
        },
      })
    } catch (error) {
      set({
        lanPanelLoading: false,
        toast: {
          title: 'LAN workspace failed',
          message: readErrorMessage(error, 'Unable to set the LAN workspace folder.'),
        },
      })
    }
  },
  async startLanPanelServer() {
    set({ lanPanelLoading: true })
    try {
      const status = await startLanPanelServerRequest()
      const lanPanelStatus = toDomainLanPanelStatus(status)
      const language = currentLanguage(get().settings)
      set({
        lanPanelLoading: false,
        lanPanelStatus,
        toast: {
          title: language === 'zh-CN' ? '局域网服务已启动' : 'LAN service started',
          message: lanPanelStatus.addresses[0] ?? (language === 'zh-CN' ? '等待地址分配' : 'Waiting for address'),
        },
      })
    } catch (error) {
      set({
        lanPanelLoading: false,
        toast: {
          title: 'LAN service failed',
          message: readErrorMessage(error, 'Unable to start the LAN panel service.'),
        },
      })
    }
  },
  async stopLanPanelServer() {
    set({ lanPanelLoading: true })
    try {
      const status = await stopLanPanelServerRequest()
      const lanPanelStatus = toDomainLanPanelStatus(status)
      const language = currentLanguage(get().settings)
      set({
        lanPanelLoading: false,
        lanPanelStatus,
        toast: {
          title: language === 'zh-CN' ? '局域网服务已停止' : 'LAN service stopped',
          message: language === 'zh-CN' ? '服务已关闭。' : 'The service has been stopped.',
        },
      })
    } catch (error) {
      set({
        lanPanelLoading: false,
        toast: {
          title: 'LAN stop failed',
          message: readErrorMessage(error, 'Unable to stop the LAN panel service.'),
        },
      })
    }
  },
  async regenerateLanPanelCode() {
    set({ lanPanelLoading: true })
    try {
      const status = await regenerateLanPanelCodeRequest()
      const lanPanelStatus = toDomainLanPanelStatus(status)
      const language = currentLanguage(get().settings)
      set({
        lanPanelLoading: false,
        lanPanelStatus,
        toast: {
          title: language === 'zh-CN' ? '连接码已刷新' : 'Access code regenerated',
          message: lanPanelStatus.accessCode ?? '',
        },
      })
    } catch (error) {
      set({
        lanPanelLoading: false,
        toast: {
          title: 'Code refresh failed',
          message: readErrorMessage(error, 'Unable to regenerate the access code.'),
        },
      })
    }
  },
  async bindExistingProject() {
    const rootPath = await openProjectRoot()
    if (!rootPath) {
      return
    }

    const defaultName = rootPath.split(/[/\\]/).filter(Boolean).at(-1) ?? 'Project'
    await get().createProject({
      name: defaultName,
      rootPath,
      discipline: 'Product Design',
      status: 'Active',
    })
  },
  async createProject(input) {
    try {
      const response = await createProjectRequest({
        name: input.name,
        rootPath: input.rootPath,
        discipline: input.discipline,
        status: input.status,
      })

      const project = toDomainProject(response.project)
      const folders = response.folders.map(toDomainFolder)
      const assets = response.assets.map(toDomainAsset)
      const language = currentLanguage(get().settings)

      set((state) => ({
        projects: [project, ...state.projects],
        ...mergeProjectSnapshot(state, project.id, folders, assets),
        selectedProjectId: project.id,
        selectedFolderId: null,
        selectedAssetId: assets[0]?.id ?? null,
        selectedAssetIds: assets[0]?.id ? [assets[0].id] : [],
        actions: appendAction(state.actions, {
          assetId: null,
          type: 'create_project',
          detail: `${t(language, 'projectBound')}: ${project.name}`,
        }),
        toast: {
          title: t(language, 'projectBound'),
          message: project.rootPath,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Create project failed',
          message: readErrorMessage(error, 'Unable to bind the selected folder.'),
        },
      })
    }
  },
  async unbindProject(projectId) {
    try {
      const snapshot = await unbindProjectRequest(projectId)
      const language = currentLanguage(get().settings)
      let nextProjectId: string | null = null

      set((state) => {
        const applied = applyWorkspaceSnapshot(state, snapshot)
        nextProjectId = applied.selectedProjectId
        const removedProjectName =
          state.projects.find((project) => project.id === projectId)?.name ??
          (language === 'zh-CN' ? '已解绑项目' : 'Unbound project')

        return {
          ...applied,
          actions: appendAction(state.actions, {
            assetId: null,
            type: 'unbind_project',
            detail:
              language === 'zh-CN'
                ? `已解绑项目：${removedProjectName}`
                : `Project unbound: ${removedProjectName}`,
          }),
          toast: {
            title: language === 'zh-CN' ? '项目已解绑' : 'Project unbound',
            message: removedProjectName,
          },
        }
      })

      return nextProjectId
    } catch (error) {
      set({
        toast: {
          title: 'Unbind project failed',
          message: readErrorMessage(error, 'Unable to unbind this project folder.'),
        },
      })
      return get().selectedProjectId
    }
  },
  setSelectedProject(projectId) {
    set({
      selectedProjectId: projectId,
      selectedFolderId: null,
      selectedAssetId: null,
      selectedAssetIds: [],
    })
  },
  setSelectedFolder(folderId) {
    set({ selectedFolderId: folderId })
  },
  setSelectedAsset(assetId, additive = false) {
    set((state) => {
      if (!assetId) {
        return {
          selectedAssetId: null,
          selectedAssetIds: [],
        }
      }

      if (additive) {
        const exists = state.selectedAssetIds.includes(assetId)
        const selectedAssetIds = exists
          ? state.selectedAssetIds.filter((entry) => entry !== assetId)
          : [...state.selectedAssetIds, assetId]
        return {
          selectedAssetId: selectedAssetIds.at(-1) ?? null,
          selectedAssetIds,
        }
      }

      return {
        selectedAssetId: assetId,
        selectedAssetIds: [assetId],
      }
    })
  },
  setAssetSelection(assetIds, activeAssetId = assetIds.at(-1) ?? null) {
    set({
      selectedAssetId: activeAssetId,
      selectedAssetIds: assetIds,
    })
  },
  clearAssetSelection() {
    set({
      selectedAssetId: null,
      selectedAssetIds: [],
    })
  },
  setSearchQuery(query) {
    set({ searchQuery: query })
  },
  setAssetKindFilter(kind) {
    set({ assetKindFilter: kind })
  },
  toggleSidebarCollapsed() {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },
  toggleInspectorCollapsed() {
    set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed }))
  },
  setProjectFileViewMode(mode) {
    set({ projectFileViewMode: mode })
  },
  setActivePageContext(context) {
    set({ activePageContext: context })
  },
  async updateSettings(patch) {
    try {
      const nextSettings = { ...get().settings, ...patch }
      const persisted = await saveSettingsRequest(nextSettings)
      const settings = toDomainSettings(persisted)
      const language = currentLanguage(settings)
      set({
        settings,
        toast: {
          title: t(language, 'settingsSaved'),
          message:
            language === 'zh-CN'
              ? `${t(language, 'language')} / 主题 / ${t(language, 'defaultImportMode')} · ${themeModeSummary(language, settings.theme)}`
              : `${t(language, 'language')} / Theme / ${t(language, 'defaultImportMode')} · ${themeModeSummary(language, settings.theme)}`,
        },
      })
    } catch (error) {
      set({
        toast: {
          title: 'Settings update failed',
          message: readErrorMessage(error, 'Unable to save app settings.'),
        },
      })
    }
  },
  async importFromDialog(preferredMode) {
    const selected = await chooseFilesForImport()
    if (selected.length === 0) {
      return
    }
    await get().handleDroppedPaths(selected, preferredMode)
  },
  async handleDroppedPaths(paths, preferredMode) {
    if (paths.length === 0) {
      return
    }

    const state = get()
    const routeMode = resolveDropImportMode(preferredMode, state)

    set({ dropState: 'importing' })

    try {
      const response = await analyzeImport(paths, routeMode, state.selectedProjectId, state.selectedFolderId)

      const importPlan = response.candidates.map((candidate) => {
        const assignment = response.assignments.find((entry) => entry.sourcePath === candidate.sourcePath) ?? null
        return {
          ...candidate,
          assignment,
          warnings: assignment?.warnings ?? [],
        }
      })

      const requiresManual = importPlan.some((item) => item.assignment?.requiresConfirmation ?? true)
      const hasWarnings = totalImportWarnings(importPlan) > 0
      if (requiresManual || routeMode === 'manual' || hasWarnings) {
        set({
          dropState: 'idle',
          importPlan,
          importPanelOpen: true,
        })
        return
      }

      await get().applyImportAssignments(
        response.assignments.map((assignment, index) => ({
          ...assignment,
          candidateId: response.candidates[index]?.id ?? assignment.candidateId,
        })),
      )
    } catch (error) {
      set({
        dropState: 'idle',
        toast: {
          title: 'Import failed',
          message: readErrorMessage(error, 'Unable to prepare import.'),
        },
      })
    }
  },
  async applyImportAssignments(assignments) {
    if (assignments.length === 0) {
      set({ importPanelOpen: false, importPlan: [], dropState: 'idle' })
      return
    }

    try {
      const response = await commitImport({ assignments })
      const importedAssets = response.assets.map(toDomainAsset)
      suppressNextWorkspaceRefresh(assignments.map((assignment) => assignment.targetProjectId))
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      const importSuccessMessageSafe = importSuccessMessage(language, importedAssets.length)
      /*
      const importSuccessMessage =
        language === 'zh-CN'
          ? `已移动 ${importedAssets.length} 个文件到项目目录。`
          : `${importedAssets.length} files moved into project folders.`

      */
      set((state) => ({
        assets: mergeImportedAssets(state.assets, importedAssets),
          importPanelOpen: false,
          importPlan: [],
          dropState: 'idle',
          selectedAssetId: importedAssets.at(-1)?.id ?? state.selectedAssetId,
          selectedAssetIds: importedAssets.map((asset) => asset.id),
          actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
          toast: {
            /*
            title: t(language, 'importPlanSaved'),
            message:
              language === 'zh-CN'
                ? `已移动 ${importedAssets.length} 个文件到项目目录。`
                : `${importedAssets.length} files moved into project folders.`,
            */
            title: t(language, 'importPlanSaved'),
            message: importSuccessMessageSafe,
          },
      }))
    } catch (error) {
      set({
        dropState: 'idle',
        toast: {
          title: 'Import commit failed',
          message: readErrorMessage(error, 'Unable to move files into project folders.'),
        },
      })
    }
  },
  closeImportPanel() {
    set({ importPanelOpen: false, importPlan: [], dropState: 'idle' })
  },
  async undoLastAction() {
    try {
      const response = await undoLastActionRequest()
      const language = currentLanguage(get().settings)
      if (!response.undone) {
        set({
          toast: {
            title: t(language, 'undoLastActionEmpty'),
            message: t(language, 'undoLastActionEmpty'),
          },
        })
        return
      }

      const undone = response.undone
      const [snapshot, history, recycleBin] = await Promise.all([
        loadWorkspace(),
        loadOperationHistory(),
        loadRecycleBin(),
      ])
      set((state) => ({
        ...applyWorkspaceSnapshot(state, snapshot),
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        toast: {
          title: t(language, 'undoLastActionSuccess'),
          message: undone.detail,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Undo action failed',
          message: readErrorMessage(error, 'Unable to undo the last action.'),
        },
      })
    }
  },
  async undoLastImport() {
    try {
      const response = await undoLastImportRequest()
      const language = currentLanguage(get().settings)
      if (!response.restored) {
        set({
          toast: {
            title: t(language, 'undoLastImportEmpty'),
            message: t(language, 'undoLastImportEmpty'),
          },
        })
        return
      }
      const restored = response.restored

      const [snapshot, history, recycleBin] = await Promise.all([
        loadWorkspace(),
        loadOperationHistory(),
        loadRecycleBin(),
      ])
      set((state) => ({
        ...applyWorkspaceSnapshot(state, snapshot),
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        toast: {
          title: t(language, 'undoLastImportSuccess'),
          message:
            language === 'zh-CN'
              ? `已恢复 ${restored.restoredCount} 个文件到原位置。`
              : `Restored ${restored.restoredCount} files to their original locations.`,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Undo import failed',
          message: readErrorMessage(error, 'Unable to undo the last import.'),
        },
      })
    }
  },
  async renameAsset(assetId, nextName) {
    try {
      const response = await renameAssetRequest(assetId, nextName)
      const asset = toDomainAsset(response.asset)
      suppressNextWorkspaceRefresh([asset.projectId])
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      set((state) => ({
        assets: replaceAssets(state.assets.map((entry) => (entry.id === asset.id ? asset : entry))),
        selectedAssetId: asset.id,
        selectedAssetIds: [asset.id],
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        toast: {
          title: t(language, 'assetRenamed'),
          message: asset.name,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Rename failed',
          message: readErrorMessage(error, 'Unable to rename this file.'),
        },
      })
    }
  },
  async moveSelectedAssets(targetFolderId, assetIds) {
    const { selectedAssetIds, settings, assets, folders } = get()
    const targetFolder = folders.find((folder) => folder.id === targetFolderId) ?? null
    const requestedAssetIds = assetIds?.length ? assetIds : selectedAssetIds
    const movingAssetIds = targetFolder
      ? requestedAssetIds.filter((assetId) =>
          assets.some((asset) => asset.id === assetId && asset.projectId === targetFolder.projectId),
        )
      : requestedAssetIds
    if (movingAssetIds.length === 0) {
      return
    }

    try {
      const response = await moveAssetsRequest({
        assetIds: movingAssetIds,
        targetFolderId,
      })
      if (targetFolder) {
        suppressNextWorkspaceRefresh([targetFolder.projectId])
      }
      const history = await loadOperationHistory()
      const nextAssets = response.assets.map(toDomainAsset)
      const language = currentLanguage(settings)
      const moveSuccessMessageSafe = moveSuccessMessage(language, movingAssetIds.length)
      /*
      const moveSuccessMessage =
        language === 'zh-CN'
          ? `已移动 ${selectedAssetIds.length} 个文件到目标目录。`
          : `${selectedAssetIds.length} files moved into the selected folder.`
      */
      set((state) => ({
        assets: replaceAssets(nextAssets),
        selectedFolderId: state.folders.some((folder) => folder.id === targetFolderId)
          ? targetFolderId
          : state.selectedFolderId,
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        toast: {
          /*
          title: language === 'zh-CN' ? '文件已移动' : 'Files moved',
          message:
            language === 'zh-CN'
              ? `已移动 ${selectedAssetIds.length} 个文件到目标目录。`
              : `${selectedAssetIds.length} files moved into the selected folder.`,
          */
          title: t(language, 'filesMoved'),
          message: moveSuccessMessageSafe,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Move failed',
          message: readErrorMessage(error, 'Unable to move the selected files.'),
        },
      })
    }
  },
  async deleteSelectedAssets() {
    const { selectedAssetIds, settings, assets } = get()
    if (selectedAssetIds.length === 0) {
      return
    }

    try {
      const response = await deleteAssetsRequest({
        assetIds: selectedAssetIds,
      })
      suppressNextWorkspaceRefresh(
        assets
          .filter((asset) => selectedAssetIds.includes(asset.id))
          .map((asset) => asset.projectId),
      )
      const [history, recycleBin] = await Promise.all([loadOperationHistory(), loadRecycleBin()])
      const nextAssets = response.assets.map(toDomainAsset)
      const language = currentLanguage(settings)
      const deleteSuccessMessageSafe = deleteSuccessMessage(language, selectedAssetIds.length)
      /*
      const deleteSuccessMessage =
        language === 'zh-CN'
          ? `已安全移除 ${selectedAssetIds.length} 个文件。`
          : `${selectedAssetIds.length} files were safely removed.`
      */
      set((state) => ({
        assets: replaceAssets(nextAssets),
        selectedAssetId: null,
        selectedAssetIds: [],
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        toast: {
          /*
          title: language === 'zh-CN' ? '文件已移入回收区' : 'Files moved to recycle bin',
          message:
            language === 'zh-CN'
              ? `已安全移除 ${selectedAssetIds.length} 个文件。`
              : `${selectedAssetIds.length} files were safely removed.`,
          */
          title: t(language, 'filesRemoved'),
          message: deleteSuccessMessageSafe,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Delete failed',
          message: readErrorMessage(error, 'Unable to delete the selected files.'),
        },
      })
    }
  },
  async loadAssetVersions(assetId) {
    if (!assetId) {
      return
    }

    set({ versionLoadingAssetId: assetId })
    try {
      const response = await loadFileVersions(assetId)
      set((state) => ({
        versionLoadingAssetId: state.versionLoadingAssetId === assetId ? null : state.versionLoadingAssetId,
        assetVersions: {
          ...state.assetVersions,
          [assetId]: response.versions.map(toDomainFileVersion),
        },
      }))
    } catch (error) {
      set({
        versionLoadingAssetId: null,
        toast: {
          title: 'Version load failed',
          message: readErrorMessage(error, 'Unable to load file versions.'),
        },
      })
    }
  },
  async createAssetVersion(assetId, note) {
    const asset = get().assets.find((entry) => entry.id === assetId)
    if (!asset) {
      return
    }

    set({ versionLoadingAssetId: assetId })
    try {
      const response = await createFileVersionRequest(assetId, note ?? '')
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      set((state) => ({
        versionLoadingAssetId: null,
        assetVersions: {
          ...state.assetVersions,
          [assetId]: response.versions.map(toDomainFileVersion),
        },
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        toast: {
          title: language === 'zh-CN' ? '版本已保存' : 'Version saved',
          message: asset.name,
        },
      }))
    } catch (error) {
      set({
        versionLoadingAssetId: null,
        toast: {
          title: 'Version save failed',
          message: readErrorMessage(error, 'Unable to save this file version.'),
        },
      })
    }
  },
  async restoreAssetVersion(assetId, versionId) {
    const asset = get().assets.find((entry) => entry.id === assetId)
    if (!asset) {
      return
    }

    set({ versionLoadingAssetId: assetId })
    try {
      const response = await restoreFileVersionRequest(assetId, versionId)
      const updatedAsset = toDomainAsset(response.asset)
      suppressNextWorkspaceRefresh([updatedAsset.projectId])
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      set((state) => ({
        versionLoadingAssetId: null,
        assets: replaceAssets(state.assets.map((entry) => (entry.id === updatedAsset.id ? updatedAsset : entry))),
        selectedAssetId: updatedAsset.id,
        selectedAssetIds: [updatedAsset.id],
        assetVersions: {
          ...state.assetVersions,
          [updatedAsset.id]: response.versions.map(toDomainFileVersion),
        },
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        toast: {
          title: language === 'zh-CN' ? '版本已恢复' : 'Version restored',
          message: updatedAsset.name,
        },
      }))
    } catch (error) {
      set({
        versionLoadingAssetId: null,
        toast: {
          title: 'Version restore failed',
          message: readErrorMessage(error, 'Unable to restore this file version.'),
        },
      })
    }
  },
  async loadProjectVersions(projectId) {
    if (!projectId) {
      return
    }

    set({ projectVersionLoadingId: projectId })
    try {
      const response = await loadProjectVersions(projectId)
      set((state) => ({
        projectVersionLoadingId:
          state.projectVersionLoadingId === projectId ? null : state.projectVersionLoadingId,
        projectVersions: {
          ...state.projectVersions,
          [projectId]: response.versions.map(toDomainProjectVersion),
        },
        projectVersionBackupPaths: {
          ...state.projectVersionBackupPaths,
          [projectId]: response.backupPath,
        },
      }))
    } catch (error) {
      set({
        projectVersionLoadingId: null,
        toast: {
          title: 'Project version load failed',
          message: readErrorMessage(error, 'Unable to load project versions.'),
        },
      })
    }
  },
  async createProjectVersion(projectId, note) {
    const project = get().projects.find((entry) => entry.id === projectId)
    if (!project) {
      return
    }

    set({ projectVersionLoadingId: projectId })
    try {
      const response = await createProjectVersionRequest(projectId, note ?? '')
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      set((state) => ({
        projectVersionLoadingId: null,
        projectVersions: {
          ...state.projectVersions,
          [projectId]: response.versions.map(toDomainProjectVersion),
        },
        projectVersionBackupPaths: {
          ...state.projectVersionBackupPaths,
          [projectId]: response.backupPath,
        },
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        toast: {
          title: language === 'zh-CN' ? '项目版本已保存' : 'Project version saved',
          message: project.name,
        },
      }))
    } catch (error) {
      set({
        projectVersionLoadingId: null,
        toast: {
          title: 'Project version save failed',
          message: readErrorMessage(error, 'Unable to save this project version.'),
        },
      })
    }
  },
  async restoreProjectVersion(projectId, versionId) {
    const project = get().projects.find((entry) => entry.id === projectId)
    if (!project) {
      return
    }

    set({ projectVersionLoadingId: projectId })
    try {
      const response = await restoreProjectVersionRequest(projectId, versionId)
      const restoredProject = toDomainProject(response.project)
      const folders = response.folders.map(toDomainFolder)
      const assets = response.assets.map(toDomainAsset)
      suppressNextWorkspaceRefresh([projectId])
      const history = await loadOperationHistory()
      const language = currentLanguage(get().settings)
      set((state) => {
        const merged = mergeProjectSnapshot(state, projectId, folders, assets)
        const nextSelectedFolderId = folders.some((folder) => folder.id === state.selectedFolderId)
          ? state.selectedFolderId
          : folders.find((folder) => !folder.parentId)?.id ?? null
        const nextSelectedAssetId = assets.some((asset) => asset.id === state.selectedAssetId)
          ? state.selectedAssetId
          : null

        return {
          ...merged,
          projects: state.projects.map((entry) => (entry.id === restoredProject.id ? restoredProject : entry)),
          selectedFolderId: nextSelectedFolderId,
          selectedAssetId: nextSelectedAssetId,
          selectedAssetIds: nextSelectedAssetId ? [nextSelectedAssetId] : [],
          projectVersionLoadingId: null,
          projectVersions: {
            ...state.projectVersions,
            [projectId]: response.versions.map(toDomainProjectVersion),
          },
          projectVersionBackupPaths: {
            ...state.projectVersionBackupPaths,
            [projectId]: response.backupPath,
          },
          actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
          toast: {
            title: language === 'zh-CN' ? '项目版本已恢复' : 'Project version restored',
            message: restoredProject.name,
          },
        }
      })
    } catch (error) {
      set({
        projectVersionLoadingId: null,
        toast: {
          title: 'Project version restore failed',
          message: readErrorMessage(error, 'Unable to restore this project version.'),
        },
      })
    }
  },
  async restoreRecycleEntries(entryIds) {
    if (entryIds.length === 0) {
      return
    }

    try {
      await restoreRecycleEntriesRequest({ entryIds })
      const [snapshot, history, recycleBin] = await Promise.all([
        loadWorkspace(),
        loadOperationHistory(),
        loadRecycleBin(),
      ])
      const language = currentLanguage(get().settings)
      set((state) => ({
        ...applyWorkspaceSnapshot(state, snapshot),
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        toast: {
          title: t(language, 'recycleBinRestore'),
          message:
            language === 'zh-CN'
              ? `已恢复 ${entryIds.length} 个回收站项目。`
              : `Restored ${entryIds.length} recycle bin item(s).`,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Restore recycle bin failed',
          message: readErrorMessage(error, 'Unable to restore the selected recycle bin items.'),
        },
      })
    }
  },
  async emptyRecycleBin(entryIds) {
    try {
      await emptyRecycleBinRequest({
        entryIds: entryIds ?? [],
      })
      const [snapshot, history, recycleBin] = await Promise.all([
        loadWorkspace(),
        loadOperationHistory(),
        loadRecycleBin(),
      ])
      const language = currentLanguage(get().settings)
      set((state) => ({
        ...applyWorkspaceSnapshot(state, snapshot),
        actions: mergeVisibleActions(state.actions, history.actions.map(toDomainAction)),
        recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
        toast: {
          title: t(language, 'emptyRecycleBin'),
          message:
            language === 'zh-CN'
              ? entryIds?.length
                ? `已清理 ${entryIds.length} 个回收站项目。`
                : '回收站已清空。'
              : entryIds?.length
                ? `Removed ${entryIds.length} recycle bin item(s).`
                : 'Recycle bin emptied.',
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Empty recycle bin failed',
          message: readErrorMessage(error, 'Unable to empty the recycle bin.'),
        },
      })
    }
  },
  async openAsset(assetId) {
    const asset = get().assets.find((entry) => entry.id === assetId)
    if (!asset) {
      return
    }
    try {
      await openManagedPath(asset.managedPath)
    } catch (error) {
      const language = currentLanguage(get().settings)
      set({
        toast: {
          title: language === 'zh-CN' ? '打开文件失败' : 'Open file failed',
          message: readErrorMessage(
            error,
            language === 'zh-CN'
              ? '无法用系统默认应用打开这个文件。请确认文件存在，且该格式已绑定默认程序。'
              : 'Unable to open this file with the system default app. Verify the file exists and the format has a default handler.',
          ),
        },
      })
    }
  },
  async revealAsset(assetId) {
    const asset = get().assets.find((entry) => entry.id === assetId)
    if (!asset) {
      return
    }
    try {
      await revealManagedPath(asset.managedPath)
    } catch (error) {
      const language = currentLanguage(get().settings)
      set({
        toast: {
          title: language === 'zh-CN' ? '定位文件失败' : 'Reveal file failed',
          message: readErrorMessage(
            error,
            language === 'zh-CN'
              ? '无法在资源管理器中定位这个文件。请确认文件仍然存在。'
              : 'Unable to reveal this file in Explorer. Verify the file still exists.',
          ),
        },
      })
    }
  },
  async saveRule(rule) {
    try {
      const response = await saveRuleRequest(rule)
      const saved = toDomainRule(response.rule)
      const language = currentLanguage(get().settings)
      set((state) => ({
        rules: state.rules.some((entry) => entry.id === saved.id)
          ? state.rules.map((entry) => (entry.id === saved.id ? saved : entry))
          : [saved, ...state.rules],
        actions: appendAction(state.actions, {
          assetId: null,
          type: 'update_rule',
          detail: `${t(language, 'ruleSaved')}: ${saved.name}`,
        }),
        toast: {
          title: t(language, 'ruleSaved'),
          message: saved.name,
        },
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Rule save failed',
          message: readErrorMessage(error, 'Unable to save this rule.'),
        },
      })
    }
  },
  async removeRule(ruleId) {
    try {
      const snapshot = await deleteRule(ruleId)
      const language = currentLanguage(get().settings)
      set((state) => ({
        rules: snapshot.rules.map(toDomainRule),
        toast: {
          title: t(language, 'ruleDeleted'),
          message: ruleId,
        },
        actions: appendAction(state.actions, {
          assetId: null,
          type: 'delete_rule',
          detail: `${t(language, 'ruleDeleted')}: ${ruleId}`,
        }),
      }))
    } catch (error) {
      set({
        toast: {
          title: 'Rule delete failed',
          message: readErrorMessage(error, 'Unable to delete this rule.'),
        },
      })
    }
  },
  async createProjectFolder(name, parentId) {
    const projectId = get().selectedProjectId
    if (!projectId) {
      return
    }
    const response = await createFolder(projectId, parentId, name)
    suppressNextWorkspaceRefresh([projectId])
    const language = currentLanguage(get().settings)
    const folders = response.folders.map(toDomainFolder)
    const assets = response.assets.map(toDomainAsset)
    set((state) => ({
      ...mergeProjectSnapshot(
        state,
        projectId,
        folders,
        assets,
      ),
      rules: response.rules.map(toDomainRule),
      selectedFolderId: folders.some((folder) => folder.id === state.selectedFolderId)
        ? state.selectedFolderId
        : null,
      selectedAssetId: assets.some((asset) => asset.id === state.selectedAssetId)
        ? state.selectedAssetId
        : null,
      selectedAssetIds: state.selectedAssetIds.filter((assetId) => assets.some((asset) => asset.id === assetId)),
      actions: appendAction(state.actions, {
        assetId: null,
        type: 'create_folder',
        detail: `${t(language, 'addFolder')}: ${name}`,
      }),
    }))
  },
  async renameProjectFolder(folderId, name) {
    const folder = get().folders.find((entry) => entry.id === folderId)
    const projectId = folder?.projectId
    if (!projectId) {
      return
    }
    const response = await renameFolder(folderId, name)
    suppressNextWorkspaceRefresh([projectId])
    const language = currentLanguage(get().settings)
    const folders = response.folders.map(toDomainFolder)
    const assets = response.assets.map(toDomainAsset)
    set((state) => ({
      ...mergeProjectSnapshot(
        state,
        projectId,
        folders,
        assets,
      ),
      rules: response.rules.map(toDomainRule),
      selectedFolderId: folders.some((folder) => folder.id === state.selectedFolderId)
        ? state.selectedFolderId
        : null,
      selectedAssetId: assets.some((asset) => asset.id === state.selectedAssetId)
        ? state.selectedAssetId
        : null,
      selectedAssetIds: state.selectedAssetIds.filter((assetId) => assets.some((asset) => asset.id === assetId)),
      actions: appendAction(state.actions, {
        assetId: null,
        type: 'rename_folder',
        detail: `${t(language, 'renameFolder')}: ${name}`,
      }),
    }))
  },
  async deleteProjectFolder(folderId) {
    const folder = get().folders.find((entry) => entry.id === folderId)
    if (!folder || !folder.parentId) {
      return
    }
    const response = await deleteFolder(folderId)
    suppressNextWorkspaceRefresh([folder.projectId])
    const recycleBin = await loadRecycleBin()
    const language = currentLanguage(get().settings)
    const folders = response.folders.map(toDomainFolder)
    const assets = response.assets.map(toDomainAsset)
    set((state) => ({
      ...mergeProjectSnapshot(
        state,
        folder.projectId,
        folders,
        assets,
      ),
      rules: response.rules.map(toDomainRule),
      selectedFolderId: folders.some((entry) => entry.id === state.selectedFolderId) ? state.selectedFolderId : null,
      selectedAssetId: assets.some((asset) => asset.id === state.selectedAssetId) ? state.selectedAssetId : null,
      selectedAssetIds: state.selectedAssetIds.filter((assetId) => assets.some((asset) => asset.id === assetId)),
      recycleEntries: recycleBin.entries.map(toDomainRecycleEntry),
      actions: appendAction(state.actions, {
        assetId: null,
        type: 'delete_folder',
        detail: `${t(language, 'deleteFolder')}: ${folder.name}`,
      }),
    }))
  },
  async toggleFavoriteFolder(shortcut) {
    const settings = get().settings
    const exists = settings.favoriteFolders.some(
      (entry) => entry.projectId === shortcut.projectId && entry.relativePath === shortcut.relativePath,
    )
    const favoriteFolders = exists
      ? settings.favoriteFolders.filter(
          (entry) => !(entry.projectId === shortcut.projectId && entry.relativePath === shortcut.relativePath),
        )
      : [shortcut, ...settings.favoriteFolders]

    await get().updateSettings({
      favoriteFolders,
    })
    set((state) => ({
      actions: appendAction(state.actions, {
        assetId: null,
        type: 'toggle_favorite',
        detail: `${shortcut.relativePath || '/'} favorite toggled`,
      }),
    }))
  },
  async refreshProject(projectId) {
    const response = await rescanProject(projectId)
    const folders = response.folders.map(toDomainFolder)
    const assets = response.assets.map(toDomainAsset)
    const rules = response.rules.map(toDomainRule)
    set((state) => ({
      ...mergeProjectSnapshot(
        state,
        projectId,
        folders,
        assets,
      ),
      rules,
      selectedFolderId: folders.some((folder) => folder.id === state.selectedFolderId)
        ? state.selectedFolderId
        : null,
      selectedAssetId: assets.some((asset) => asset.id === state.selectedAssetId)
        ? state.selectedAssetId
        : null,
      selectedAssetIds: state.selectedAssetIds.filter((assetId) => assets.some((asset) => asset.id === assetId)),
    }))
  },
  showToast(title, message) {
    set({
      toast: {
        title,
        message,
      },
    })
  },
  clearToast() {
    set({ toast: null })
  },
}))
