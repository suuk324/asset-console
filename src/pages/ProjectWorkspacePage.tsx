import { useDeferredValue, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { AssetCardPreview } from '../components/common/AssetCardPreview'
import { EmptyState } from '../components/common/EmptyState'
import { ExternalAssetDragHandle } from '../components/common/ExternalAssetDragHandle'
import { FolderTree } from '../components/workspace/FolderTree'
import { t } from '../i18n/translate'
import { useDuplicateAssetGroups, useVisibleProjectAssets, useVisibleProjectFolders } from '../store/selectors'
import { useAssetConsoleStore } from '../store/useAssetConsoleStore'
import type { Asset, AssetKindFilter, FolderShortcut, ProjectFolder, RecycleBinEntry } from '../types/domain'
import pageStyles from './Page.module.css'

const INTERNAL_ASSET_DRAG_TYPE = 'application/x-asset-console-assets'

const assetFilterOrder: AssetKindFilter[] = ['all', 'image', 'pdf', 'video', 'three_d', 'document']
const filterLabelKeys: Record<
  AssetKindFilter,
  'filterAll' | 'filterImage' | 'filterPdf' | 'filterVideo' | 'filterThreeD' | 'filterDocument'
> = {
  all: 'filterAll',
  image: 'filterImage',
  pdf: 'filterPdf',
  video: 'filterVideo',
  three_d: 'filterThreeD',
  document: 'filterDocument',
}

type AssetSortMode = 'name' | 'modified' | 'size'

function shortcutKey(shortcut: FolderShortcut) {
  return `${shortcut.projectId}:${shortcut.relativePath}`
}

function resolveShortcutFolder(shortcut: FolderShortcut, folders: ProjectFolder[], projectId: string) {
  return folders.find(
    (folder) => folder.projectId === projectId && folder.relativePath === shortcut.relativePath,
  )
}

function getDraggedAssets(asset: Asset, selectedAssetIdSet: ReadonlySet<string>, selectedAssets: Asset[]) {
  return selectedAssetIdSet.has(asset.id)
    ? selectedAssets
    : [asset]
}

function uniqueFolders(folders: Array<ProjectFolder | null>) {
  return folders.filter((folder, index, list): folder is ProjectFolder => {
    if (!folder) {
      return false
    }
    return list.findIndex((entry) => entry?.id === folder.id) === index
  })
}

type WorkspaceContextMenuState =
  | {
      kind: 'asset'
      asset: Asset
      x: number
      y: number
    }
  | {
      kind: 'folder'
      folder: ProjectFolder
      x: number
      y: number
    }
  | null

export function ProjectWorkspacePage() {
  const [contextMenu, setContextMenu] = useState<WorkspaceContextMenuState>(null)
  const [sortMode, setSortMode] = useState<AssetSortMode>('modified')
  const [duplicatesOnly, setDuplicatesOnly] = useState(false)
  const [quickMoveTargetId, setQuickMoveTargetId] = useState('')
  const [operationsCollapsed, setOperationsCollapsed] = useState(true)
  const [gridDensity, setGridDensity] = useState<'compact' | 'standard' | 'large'>('standard')
  const navigate = useNavigate()
  const { projectId } = useParams()
  const {
    projects,
    allAssets,
    settings,
    searchQuery,
    assetKindFilter,
    projectFileViewMode,
    selectedFolderId,
    selectedAssetId,
    selectedAssetIds,
    workspaceWatchEnabled,
    actions,
    recycleEntries,
    setSelectedProject,
    unbindProject,
    setSelectedFolder,
    setSelectedAsset,
    setAssetSelection,
    clearAssetSelection,
    setAssetKindFilter,
    setProjectFileViewMode,
    createProjectFolder,
    renameProjectFolder,
    deleteProjectFolder,
    refreshProject,
    moveSelectedAssets,
    deleteSelectedAssets,
    toggleFavoriteFolder,
    openAsset,
    revealAsset,
    renameAsset,
    undoLastAction,
    undoLastImport,
    restoreRecycleEntries,
    emptyRecycleBin,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      projects: state.projects,
      allAssets: state.assets,
      settings: state.settings,
      searchQuery: state.searchQuery,
      assetKindFilter: state.assetKindFilter,
      projectFileViewMode: state.projectFileViewMode,
      selectedFolderId: state.selectedFolderId,
      selectedAssetId: state.selectedAssetId,
      selectedAssetIds: state.selectedAssetIds,
      workspaceWatchEnabled: state.workspaceWatchEnabled,
      actions: state.actions,
      recycleEntries: state.recycleEntries,
      setSelectedProject: state.setSelectedProject,
      unbindProject: state.unbindProject,
      setSelectedFolder: state.setSelectedFolder,
      setSelectedAsset: state.setSelectedAsset,
      setAssetSelection: state.setAssetSelection,
      clearAssetSelection: state.clearAssetSelection,
      setAssetKindFilter: state.setAssetKindFilter,
      setProjectFileViewMode: state.setProjectFileViewMode,
      createProjectFolder: state.createProjectFolder,
      renameProjectFolder: state.renameProjectFolder,
      deleteProjectFolder: state.deleteProjectFolder,
      refreshProject: state.refreshProject,
      moveSelectedAssets: state.moveSelectedAssets,
      deleteSelectedAssets: state.deleteSelectedAssets,
      toggleFavoriteFolder: state.toggleFavoriteFolder,
      openAsset: state.openAsset,
      revealAsset: state.revealAsset,
      renameAsset: state.renameAsset,
      undoLastAction: state.undoLastAction,
      undoLastImport: state.undoLastImport,
      restoreRecycleEntries: state.restoreRecycleEntries,
      emptyRecycleBin: state.emptyRecycleBin,
    })),
  )

  useEffect(() => {
    if (projectId) {
      setSelectedProject(projectId)
    }
  }, [projectId, setSelectedProject])

  const project = useMemo(
    () => projects.find((entry) => entry.id === projectId) ?? null,
    [projectId, projects],
  )
  const projectScopeId = project?.id ?? null
  const folders = useVisibleProjectFolders(project?.id ?? null)
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const baseAssets = useVisibleProjectAssets(project?.id ?? null, selectedFolderId, deferredSearchQuery)
  const duplicateGroups = useDuplicateAssetGroups(project?.id ?? null)
  const projectAssets = useMemo(
    () => (project ? allAssets.filter((asset) => asset.projectId === project.id) : []),
    [allAssets, project],
  )
  const language = settings.language
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null
  const selectedAsset = projectAssets.find((asset) => asset.id === selectedAssetId) ?? null
  const queryText = searchQuery.trim()
  const projectAssetTotal = projectAssets.length
  const duplicateAssetIds = useMemo(
    () => new Set(duplicateGroups.flatMap((group) => group.assets.map((asset) => asset.id))),
    [duplicateGroups],
  )
  const assets = useMemo(() => {
    const next = duplicatesOnly
      ? baseAssets.filter((asset) => duplicateAssetIds.has(asset.id))
      : [...baseAssets]

    next.sort((left, right) => {
      if (sortMode === 'name') {
        return left.name.localeCompare(right.name)
      }
      if (sortMode === 'size') {
        return right.meta.fileSizeBytes - left.meta.fileSizeBytes || left.name.localeCompare(right.name)
      }
      return right.lastModifiedAt.localeCompare(left.lastModifiedAt) || left.name.localeCompare(right.name)
    })
    return next
  }, [baseAssets, duplicateAssetIds, duplicatesOnly, sortMode])
  const selectedAssetIdSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds])
  const draggedSelectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIdSet.has(asset.id)),
    [assets, selectedAssetIdSet],
  )

  const selectedAssetFolder = useMemo(
    () =>
      selectedAsset?.folderId ? folders.find((folder) => folder.id === selectedAsset.folderId) ?? null : null,
    [folders, selectedAsset],
  )

  useEffect(() => {
    if (selectedFolderId && !selectedFolder) {
      setSelectedFolder(null)
    }
  }, [selectedFolder, selectedFolderId, setSelectedFolder])

  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      return
    }

    const visibleIds = new Set(assets.map((asset) => asset.id))
    const nextSelection = selectedAssetIds.filter((assetId) => visibleIds.has(assetId))
    if (nextSelection.length === selectedAssetIds.length) {
      return
    }

    setAssetSelection(nextSelection, nextSelection.at(-1) ?? null)
  }, [assets, selectedAssetIds, setAssetSelection])

  const favoriteFolders = useMemo(
    () =>
      project
        ? settings.favoriteFolders
            .filter((shortcut) => shortcut.projectId === project.id)
            .map((shortcut) => resolveShortcutFolder(shortcut, folders, project.id))
            .filter((folder): folder is ProjectFolder => Boolean(folder))
        : [],
    [folders, project, settings.favoriteFolders],
  )

  const recentFolders = useMemo(
    () =>
      project
        ? settings.recentTargetFolders
            .filter((shortcut) => shortcut.projectId === project.id)
            .map((shortcut) => resolveShortcutFolder(shortcut, folders, project.id))
            .filter((folder): folder is ProjectFolder => Boolean(folder))
        : [],
    [folders, project, settings.recentTargetFolders],
  )

  const favoriteShortcutKeys = useMemo(
    () => new Set(settings.favoriteFolders.map((shortcut) => shortcutKey(shortcut))),
    [settings.favoriteFolders],
  )

  const quickMoveTargets = useMemo(
    () => uniqueFolders([selectedFolder, ...favoriteFolders, ...recentFolders]),
    [favoriteFolders, recentFolders, selectedFolder],
  )
  const resolvedQuickMoveTargetId = quickMoveTargets.some((folder) => folder.id === quickMoveTargetId)
    ? quickMoveTargetId
    : quickMoveTargets[0]?.id ?? ''

  const projectRecycleEntries = useMemo(
    () => recycleEntries.filter((entry) => entry.projectId === projectScopeId),
    [projectScopeId, recycleEntries],
  )

  const isFavoriteFolder = (folder: ProjectFolder | null) =>
    Boolean(
      project &&
        folder &&
        favoriteShortcutKeys.has(
          shortcutKey({
            projectId: project.id,
            relativePath: folder.relativePath,
          }),
        ),
    )

  const selectedCount = selectedAssetIds.length
  const visibleActionItems = actions.slice(0, 8)
  const dragOutHandleLabel = language === 'zh-CN' ? '拖出' : 'Drag'
  const dragOutHint = t(language, 'dragOutHint')
  const activeScopeLabel = selectedFolder ? selectedFolder.relativePath || '/' : project?.name ?? ''
  const latestDuplicateGroup = duplicateGroups[0] ?? null
  const latestRecycleEntry = projectRecycleEntries[0] ?? null

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setAssetSelection(assets.map((asset) => asset.id), assets.at(-1)?.id ?? null)
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        clearAssetSelection()
        return
      }

      if (event.key === 'Delete' && selectedAssetIds.length > 0) {
        event.preventDefault()
        if (window.confirm(t(language, 'deleteSelectionConfirm'))) {
          void deleteSelectedAssets()
        }
        return
      }

      if (event.key === 'F2' && selectedAsset) {
        event.preventDefault()
        const nextName = window.prompt(t(language, 'rename'), selectedAsset.name)
        if (nextName && nextName !== selectedAsset.name) {
          void renameAsset(selectedAsset.id, nextName)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    assets,
    clearAssetSelection,
    deleteSelectedAssets,
    language,
    renameAsset,
    selectedAsset,
    selectedAssetIds.length,
    setAssetSelection,
  ])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeMenu = () => setContextMenu(null)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu])

  if (!project) {
    return (
      <div className={pageStyles.page}>
        <EmptyState title={t(language, 'noProjectSelected')} body={t(language, 'emptyProjectsBody')} />
      </div>
    )
  }

  const confirmDeleteSelected = () => {
    if (selectedAssetIds.length === 0) {
      return
    }
    if (window.confirm(t(language, 'deleteSelectionConfirm'))) {
      void deleteSelectedAssets()
    }
  }

  const confirmUnbindProject = async () => {
    const confirmed = window.confirm(
      language === 'zh-CN'
        ? `确认解绑“${project.name}”吗？这不会删除磁盘中的真实文件。`
        : `Unbind "${project.name}"? This keeps the real files on disk.`,
    )

    if (!confirmed) {
      return
    }

    const nextProjectId = await unbindProject(project.id)
    if (nextProjectId) {
      navigate(`/projects/${nextProjectId}`)
      return
    }
    navigate('/overview')
  }

  const createMenuPosition = (clientX: number, clientY: number) => ({
    x: Math.min(clientX, window.innerWidth - 232),
    y: Math.min(clientY, window.innerHeight - 252),
  })

  const openAssetContextMenu = (asset: Asset, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!selectedAssetIdSet.has(asset.id)) {
      setAssetSelection([asset.id], asset.id)
    }
    const position = createMenuPosition(event.clientX, event.clientY)
    setContextMenu({
      kind: 'asset',
      asset,
      ...position,
    })
  }

  const openFolderContextMenu = (folder: ProjectFolder, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setSelectedFolder(folder.id)
    const position = createMenuPosition(event.clientX, event.clientY)
    setContextMenu({
      kind: 'folder',
      folder,
      ...position,
    })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleAssetClick = (assetId: string, event: MouseEvent<HTMLButtonElement>) => {
    setSelectedAsset(assetId, event.metaKey || event.ctrlKey)
  }

  const handleAssetDragStart = (asset: Asset, event: DragEvent<HTMLButtonElement>) => {
    const dragAssets = getDraggedAssets(asset, selectedAssetIdSet, draggedSelectedAssets)

    if (!selectedAssetIdSet.has(asset.id)) {
      setAssetSelection([asset.id], asset.id)
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(
      INTERNAL_ASSET_DRAG_TYPE,
      dragAssets.map((entry) => entry.id).join(','),
    )
  }

  const handleMoveSelectedToQuickTarget = () => {
    if (!resolvedQuickMoveTargetId) {
      return
    }
    void moveSelectedAssets(resolvedQuickMoveTargetId)
  }

  const handleOpenSelected = () => {
    if (selectedAssetIds.length !== 1 || !selectedAsset) {
      return
    }
    void openAsset(selectedAsset.id)
  }

  const handleRestoreRecycle = (entries: RecycleBinEntry[]) => {
    if (entries.length === 0) {
      return
    }
    if (window.confirm(t(language, 'restoreRecycleConfirm'))) {
      void restoreRecycleEntries(entries.map((entry) => entry.id))
    }
  }

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.statusRow}>
        <span className={pageStyles.statusBadgeActive}>
          {t(language, 'projectFolders')} {folders.length}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'projectFiles')} {projectAssetTotal}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'potentialDuplicateFiles')} {duplicateGroups.length}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'recycleBin')} {projectRecycleEntries.length}
        </span>
        <span className={pageStyles.statusBadgeMuted}>
          {t(language, 'autoRefreshStatus')}: {workspaceWatchEnabled ? t(language, 'autoRefreshOn') : t(language, 'autoRefreshOff')}
        </span>
      </div>

      <div className={pageStyles.workspaceGrid}>
        <section className={`${pageStyles.panel} ${pageStyles.sidebarPanel}`}>
          <div className={pageStyles.folderSidebar}>
            <div className={pageStyles.folderSidebarHeader}>
              <div className={pageStyles.folderHeaderTopRow}>
                <div className={pageStyles.folderHeaderTitleRow}>
                  <h2>{t(language, 'projectFolders')}</h2>
                  <span className={pageStyles.folderHeaderPath} title={project.rootPath}>
                    {project.rootPath}
                  </span>
                </div>
                <div className={pageStyles.folderHeaderActions}>
                  <button type="button" className={pageStyles.secondaryButton} onClick={() => void refreshProject(project.id)}>
                    {t(language, 'rescanProject')}
                  </button>
                  <button type="button" className={pageStyles.dangerButton} onClick={() => void confirmUnbindProject()}>
                    {language === 'zh-CN' ? '解绑' : 'Unbind'}
                  </button>
                </div>
              </div>
              {favoriteFolders.length > 0 || recentFolders.length > 0 ? null : (
                <p className={pageStyles.folderHeaderHint}>{t(language, 'noShortcuts')}</p>
              )}
            </div>

            {favoriteFolders.length > 0 || recentFolders.length > 0 ? (
              <div className={pageStyles.folderShortcuts}>
                {favoriteFolders.length > 0 ? (
                  <div className={pageStyles.shortcutGroup}>
                    <strong>{t(language, 'favoriteFolders')}</strong>
                    <div className={pageStyles.shortcutChips}>
                      {favoriteFolders.map((folder) => (
                        <button
                          key={`favorite-${folder.id}`}
                          type="button"
                          className={folder.id === selectedFolderId ? pageStyles.shortcutChipActive : pageStyles.shortcutChip}
                          onClick={() => setSelectedFolder(folder.id)}
                        >
                          {folder.relativePath || '/'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {recentFolders.length > 0 ? (
                  <div className={pageStyles.shortcutGroup}>
                    <strong>{t(language, 'recentTargets')}</strong>
                    <div className={pageStyles.shortcutChips}>
                      {recentFolders.map((folder) => (
                        <button
                          key={`recent-${folder.id}`}
                          type="button"
                          className={folder.id === selectedFolderId ? pageStyles.shortcutChipActive : pageStyles.shortcutChip}
                          onClick={() => setSelectedFolder(folder.id)}
                        >
                          {folder.relativePath || '/'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={pageStyles.folderTreePane}>
              <div className={pageStyles.folderTreeScroller}>
                <FolderTree
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  language={language}
                  onSelect={setSelectedFolder}
                  onMoveAssets={(folderId, assetIds) => void moveSelectedAssets(folderId, assetIds)}
                  onFolderContextMenu={openFolderContextMenu}
                />
              </div>
            </div>

            <div className={pageStyles.folderActionsDock}>
              <div className={pageStyles.folderActionsGrid}>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  onClick={() => {
                    const name = window.prompt(t(language, 'addFolder'))
                    if (name) {
                      void createProjectFolder(name, selectedFolderId)
                    }
                  }}
                >
                  {t(language, 'addFolder')}
                </button>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  disabled={!selectedFolderId || !selectedFolder?.parentId}
                  onClick={() => {
                    const name = window.prompt(t(language, 'renameFolder'), selectedFolder?.name ?? '')
                    if (selectedFolderId && selectedFolder?.parentId && name) {
                      void renameProjectFolder(selectedFolderId, name)
                    }
                  }}
                >
                  {t(language, 'renameFolder')}
                </button>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  disabled={!selectedFolderId || !selectedFolder?.parentId}
                  onClick={() => {
                    if (selectedFolderId && selectedFolder?.parentId && window.confirm(t(language, 'deleteFolder'))) {
                      void deleteProjectFolder(selectedFolderId)
                    }
                  }}
                >
                  {t(language, 'deleteFolder')}
                </button>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  disabled={!selectedFolder || !project}
                  onClick={() => {
                    if (!selectedFolder || !project) {
                      return
                    }
                    void toggleFavoriteFolder({
                      projectId: project.id,
                      relativePath: selectedFolder.relativePath,
                    })
                  }}
                >
                  {isFavoriteFolder(selectedFolder) ? t(language, 'unfavoriteCurrentFolder') : t(language, 'favoriteCurrentFolder')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className={`${pageStyles.panel} ${pageStyles.mainPanel}`}>
          <div className={pageStyles.panelHeader}>
            <div>
              <h2>{t(language, 'projectFiles')}</h2>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN' ? `当前范围：${activeScopeLabel}` : `Current scope: ${activeScopeLabel}`}
              </span>
            </div>
            <div className={pageStyles.viewModeGroup}>
              <button
                type="button"
                className={projectFileViewMode === 'list' ? pageStyles.viewToggleActive : pageStyles.viewToggle}
                onClick={() => setProjectFileViewMode('list')}
              >
                {language === 'zh-CN' ? '列表' : 'List'}
              </button>
              <button
                type="button"
                className={projectFileViewMode === 'grid' ? pageStyles.viewToggleActive : pageStyles.viewToggle}
                onClick={() => setProjectFileViewMode('grid')}
              >
                {language === 'zh-CN' ? '网格' : 'Grid'}
              </button>
            </div>
          </div>

          <div className={pageStyles.workspaceToolbar}>
            <div className={pageStyles.toolbarRow}>
              <div className={pageStyles.toolbarSection}>
                <span className={pageStyles.toolbarLabel}>{t(language, 'fileTypeFilter')}</span>
                <div className={pageStyles.filterChips}>
                  {assetFilterOrder.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={assetKindFilter === filter ? pageStyles.filterChipActive : pageStyles.filterChip}
                      onClick={() => setAssetKindFilter(filter)}
                    >
                      {t(language, filterLabelKeys[filter])}
                    </button>
                  ))}
                </div>
              </div>
              <div className={pageStyles.toolbarSection}>
                <span className={pageStyles.toolbarLabel}>{t(language, 'quickFilters')}</span>
                {projectFileViewMode === 'grid' ? (
                  <div className={pageStyles.viewModeGroup}>
                    <button
                      type="button"
                      className={gridDensity === 'compact' ? pageStyles.viewToggleActive : pageStyles.viewToggle}
                      onClick={() => setGridDensity('compact')}
                    >
                      {language === 'zh-CN' ? '紧凑' : 'Compact'}
                    </button>
                    <button
                      type="button"
                      className={gridDensity === 'standard' ? pageStyles.viewToggleActive : pageStyles.viewToggle}
                      onClick={() => setGridDensity('standard')}
                    >
                      {language === 'zh-CN' ? '标准' : 'Standard'}
                    </button>
                    <button
                      type="button"
                      className={gridDensity === 'large' ? pageStyles.viewToggleActive : pageStyles.viewToggle}
                      onClick={() => setGridDensity('large')}
                    >
                      {language === 'zh-CN' ? '宽松' : 'Large'}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className={duplicatesOnly ? pageStyles.filterChipActive : pageStyles.filterChip}
                  onClick={() => setDuplicatesOnly((current) => !current)}
                >
                  {t(language, 'duplicateAssetsOnly')}
                </button>
                <label className={pageStyles.toolbarField}>
                  <span>{t(language, 'sortBy')}</span>
                  <select value={sortMode} onChange={(event) => setSortMode(event.target.value as AssetSortMode)}>
                    <option value="modified">{t(language, 'sortByModified')}</option>
                    <option value="name">{t(language, 'sortByName')}</option>
                    <option value="size">{t(language, 'sortBySize')}</option>
                  </select>
                </label>
                {selectedFolder ? (
                  <button type="button" className={pageStyles.secondaryButton} onClick={() => setSelectedFolder(null)}>
                    {t(language, 'clearFolderFilter')}
                  </button>
                ) : null}
              </div>
            </div>

            {selectedCount > 0 || queryText || selectedAsset ? (
              <div className={pageStyles.toolbarRow}>
                <div className={pageStyles.toolbarSection}>
                  <span className={pageStyles.toolbarTokenStrong}>
                    {t(language, 'resultCount')} {assets.length} / {projectAssetTotal}
                  </span>
                  {selectedCount > 0 ? (
                    <span className={pageStyles.toolbarToken}>
                      {language === 'zh-CN' ? `已选择 ${selectedCount} 项` : `${selectedCount} selected`}
                    </span>
                  ) : null}
                  {queryText ? <span className={pageStyles.toolbarToken}>{`"${queryText}"`}</span> : null}
                  {selectedAsset ? (
                    <span className={pageStyles.previewBridge} title={selectedAsset.name}>
                      {selectedAsset.name}
                    </span>
                  ) : null}
                </div>
                <div className={pageStyles.toolbarSection}>
                  {selectedCount > 0 ? (
                    <>
                      <label className={pageStyles.toolbarField}>
                        <span>{t(language, 'quickMoveTarget')}</span>
                        <select
                          value={resolvedQuickMoveTargetId}
                          onChange={(event) => setQuickMoveTargetId(event.target.value)}
                        >
                          {quickMoveTargets.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.relativePath || '/'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className={pageStyles.secondaryButton}
                        disabled={!resolvedQuickMoveTargetId}
                        onClick={handleMoveSelectedToQuickTarget}
                      >
                        {t(language, 'moveToTargetFolder')}
                      </button>
                      <button
                        type="button"
                        className={pageStyles.secondaryButton}
                        disabled={selectedCount !== 1}
                        onClick={handleOpenSelected}
                      >
                        {t(language, 'openSelected')}
                      </button>
                      <button type="button" className={pageStyles.secondaryButton} onClick={clearAssetSelection}>
                        {t(language, 'clearSelection')}
                      </button>
                      <button type="button" className={pageStyles.dangerButton} onClick={confirmDeleteSelected}>
                        {t(language, 'deleteSelected')}
                      </button>
                    </>
                  ) : null}
                  {selectedAssetFolder && selectedAssetFolder.id !== selectedFolderId ? (
                    <button
                      type="button"
                      className={pageStyles.secondaryButton}
                      onClick={() => {
                        if (selectedAssetFolder) {
                          setSelectedFolder(selectedAssetFolder.id)
                        }
                      }}
                    >
                      {t(language, 'jumpToAssetFolder')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {assets.length === 0 ? (
            <div className={pageStyles.stageEmpty}>
              <strong>{t(language, 'noFilesInFolder')}</strong>
              <span>
                {selectedFolder
                  ? selectedFolder.relativePath || '/'
                  : language === 'zh-CN'
                    ? '试试切换到别的目录，或把文件拖入当前项目。'
                    : 'Try another folder, or import files into this project.'}
              </span>
            </div>
          ) : projectFileViewMode === 'grid' ? (
            <div
              className={[
                pageStyles.assetGrid,
                pageStyles.scrollArea,
                gridDensity === 'compact'
                  ? pageStyles.assetGridCompact
                  : gridDensity === 'large'
                    ? pageStyles.assetGridLarge
                    : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {assets.map((asset) => {
                const isSelected = selectedAssetIdSet.has(asset.id)
                const dragAssets = getDraggedAssets(asset, selectedAssetIdSet, draggedSelectedAssets)
                return (
                  <div key={asset.id} className={isSelected ? pageStyles.gridAssetCardActive : pageStyles.gridAssetCard}>
                    <button
                      type="button"
                      draggable
                      title={`${asset.name}\n${asset.relativePath}`}
                      className={pageStyles.gridAssetPrimaryButton}
                      onClick={(event) => handleAssetClick(asset.id, event)}
                      onDoubleClick={() => void openAsset(asset.id)}
                      onDragStart={(event) => handleAssetDragStart(asset, event)}
                      onContextMenu={(event) => openAssetContextMenu(asset, event)}
                    >
                      <div className={pageStyles.gridAssetMedia}>
                        <AssetCardPreview asset={asset} alt={asset.name} />
                        <span className={pageStyles.gridAssetSelection} aria-hidden="true" />
                        <span className={pageStyles.assetFormatBadge}>{asset.format}</span>
                      </div>
                      <div className={pageStyles.gridAssetBody}>
                        <div className={pageStyles.gridAssetTitleRow}>
                          <strong className={pageStyles.gridAssetTitle}>{asset.name}</strong>
                          <span className={pageStyles.assetFormatBadge}>{asset.format}</span>
                        </div>
                        <span className={pageStyles.gridAssetPath}>{asset.relativePath}</span>
                        <div className={pageStyles.gridAssetMetaRow}>
                          <span>{asset.lastModifiedAt}</span>
                          <span>{asset.meta.fileSize}</span>
                        </div>
                      </div>
                    </button>
                    <div className={pageStyles.assetExternalHandleDock}>
                      <ExternalAssetDragHandle
                        assets={dragAssets}
                        language={language}
                        title={dragOutHandleLabel}
                        hint={dragOutHint}
                        className={pageStyles.assetExternalHandle}
                        activeClassName={pageStyles.assetExternalHandleActive}
                        compact
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
              {assets.map((asset) => {
                const isSelected = selectedAssetIdSet.has(asset.id)
                const dragAssets = getDraggedAssets(asset, selectedAssetIdSet, draggedSelectedAssets)
                return (
                  <div key={asset.id} className={isSelected ? pageStyles.listButtonActive : pageStyles.listButton}>
                    <button
                      type="button"
                      draggable
                      title={`${asset.name}\n${asset.relativePath}`}
                      className={pageStyles.listPrimaryButton}
                      onClick={(event) => handleAssetClick(asset.id, event)}
                      onDoubleClick={() => void openAsset(asset.id)}
                      onDragStart={(event) => handleAssetDragStart(asset, event)}
                      onContextMenu={(event) => openAssetContextMenu(asset, event)}
                    >
                      <div className={pageStyles.assetSelectionIndicator} aria-hidden="true" />
                      <div className={pageStyles.assetThumb}>
                        <AssetCardPreview asset={asset} alt={asset.name} />
                      </div>
                      <div className={pageStyles.assetMain}>
                        <div className={pageStyles.assetTitleRow}>
                          <strong>{asset.name}</strong>
                          <span className={pageStyles.assetFormatBadge}>{asset.format}</span>
                        </div>
                        <span className={pageStyles.assetPathPrimary}>{asset.relativePath}</span>
                      </div>
                      <div className={pageStyles.fileMeta}>
                        <span>{asset.lastModifiedAt}</span>
                        <span>{asset.meta.fileSize}</span>
                      </div>
                    </button>
                    <ExternalAssetDragHandle
                      assets={dragAssets}
                      language={language}
                      title={dragOutHandleLabel}
                      hint={dragOutHint}
                      className={pageStyles.assetExternalHandle}
                      activeClassName={pageStyles.assetExternalHandleActive}
                      compact
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className={pageStyles.lowerWorkspaceGrid}>
        <section className={`${pageStyles.panel} ${pageStyles.subPanel} ${pageStyles.primaryLowerPanel}`}>
          <div className={pageStyles.panelHeader}>
            <div>
              <h2>{t(language, 'recentOperations')}</h2>
              <span className={pageStyles.mutedText}>
                {language === 'zh-CN'
                  ? '最近的整理、删除、导入和恢复动作'
                  : 'Recent organization, delete, import, and restore actions'}
              </span>
            </div>
            <div className={pageStyles.actions}>
              <button
                type="button"
                className={pageStyles.secondaryButton}
                onClick={() => setOperationsCollapsed((current) => !current)}
              >
                {operationsCollapsed
                  ? language === 'zh-CN'
                    ? '展开'
                    : 'Expand'
                  : language === 'zh-CN'
                    ? '收起'
                    : 'Collapse'}
              </button>
              <button type="button" className={pageStyles.secondaryButton} onClick={() => void undoLastImport()}>
                {t(language, 'undoLastImport')}
              </button>
              <button type="button" className={pageStyles.secondaryButton} onClick={() => void undoLastAction()}>
                {t(language, 'undoLastAction')}
              </button>
            </div>
          </div>

          {operationsCollapsed ? (
            <p className={pageStyles.mutedText}>
              {language === 'zh-CN'
                ? `最近操作已收起，当前共 ${visibleActionItems.length} 条记录。`
                : `Recent operations collapsed. ${visibleActionItems.length} record(s) available.`}
            </p>
          ) : visibleActionItems.length === 0 ? (
            <p>{t(language, 'noOperations')}</p>
          ) : (
            <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
              {visibleActionItems.map((action) => (
                <div key={action.id} className={pageStyles.timelineItem}>
                  <span className={pageStyles.timelineDot} aria-hidden="true" />
                  <div className={pageStyles.timelineCopy}>
                    <strong>{action.detail}</strong>
                    <span>
                      {action.type}
                      {action.reversible ? ` · ${t(language, 'historyUndoable')}` : ''}
                    </span>
                    <span>{action.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={pageStyles.summaryStack}>
          <section className={`${pageStyles.panel} ${pageStyles.panelWarning} ${pageStyles.summaryPanel}`}>
            <div className={pageStyles.panelHeader}>
              <div>
                <h2>{t(language, 'duplicateGroups')}</h2>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN' ? '项目内完全重复的内容摘要' : 'Exact duplicate content within this project'}
                </span>
              </div>
              <button
                type="button"
                className={duplicatesOnly ? pageStyles.filterChipActive : pageStyles.filterChip}
                onClick={() => setDuplicatesOnly((current) => !current)}
              >
                {t(language, 'duplicateAssetsOnly')}
              </button>
            </div>
            {duplicateGroups.length === 0 ? (
              <p>{t(language, 'noDuplicates')}</p>
            ) : (
              <div className={pageStyles.summaryCard}>
                <strong>{latestDuplicateGroup?.assets[0]?.name}</strong>
                <span className={pageStyles.mutedText}>
                  {language === 'zh-CN'
                    ? `共 ${duplicateGroups.length} 组重复`
                    : `${duplicateGroups.length} duplicate groups`}
                </span>
                <div className={pageStyles.summaryLinks}>
                  {latestDuplicateGroup?.assets.slice(0, 3).map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      className={pageStyles.inlineLinkButton}
                      onClick={() => {
                        setSelectedAsset(asset.id)
                        if (asset.folderId) {
                          setSelectedFolder(asset.folderId)
                        }
                      }}
                    >
                      {asset.relativePath} / {asset.meta.fileSize}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={`${pageStyles.panel} ${pageStyles.panelMuted} ${pageStyles.summaryPanel}`}>
            <div className={pageStyles.panelHeader}>
              <div>
                <h2>{t(language, 'recycleBin')}</h2>
                <span className={pageStyles.mutedText}>{t(language, 'recycleBinHint')}</span>
              </div>
              <div className={pageStyles.actions}>
                <button
                  type="button"
                  className={pageStyles.secondaryButton}
                  disabled={projectRecycleEntries.length === 0}
                  onClick={() => handleRestoreRecycle(projectRecycleEntries)}
                >
                  {t(language, 'restoreSelected')}
                </button>
                <button
                  type="button"
                  className={pageStyles.dangerButton}
                  disabled={projectRecycleEntries.length === 0}
                  onClick={() => {
                    if (window.confirm(t(language, 'emptyRecycleBinConfirm'))) {
                      void emptyRecycleBin(projectRecycleEntries.map((entry) => entry.id))
                    }
                  }}
                >
                  {t(language, 'emptyRecycleBin')}
                </button>
              </div>
            </div>
            {projectRecycleEntries.length === 0 ? (
              <p>{t(language, 'noRecycleEntries')}</p>
            ) : (
              <div className={pageStyles.summaryCard}>
                <strong>{latestRecycleEntry?.name}</strong>
                <span className={pageStyles.mutedText}>{latestRecycleEntry?.originalPath}</span>
                <div className={pageStyles.summaryMetaRow}>
                  <span className={pageStyles.statusBadgeMuted}>{latestRecycleEntry?.sizeLabel}</span>
                  <span className={pageStyles.mutedText}>{latestRecycleEntry?.deletedAt}</span>
                </div>
                {latestRecycleEntry ? (
                  <button
                    type="button"
                    className={pageStyles.secondaryButton}
                    onClick={() => handleRestoreRecycle([latestRecycleEntry])}
                  >
                    {t(language, 'recycleBinRestore')}
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      {contextMenu ? (
        <div
          className={pageStyles.contextMenu}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.kind === 'asset' ? (
            <>
              <button
                type="button"
                className={pageStyles.contextMenuItem}
                onClick={() => {
                  closeContextMenu()
                  void openAsset(contextMenu.asset.id)
                }}
              >
                {t(language, 'open')}
              </button>
              <button
                type="button"
                className={pageStyles.contextMenuItem}
                onClick={() => {
                  closeContextMenu()
                  void revealAsset(contextMenu.asset.id)
                }}
              >
                {t(language, 'reveal')}
              </button>
              <button
                type="button"
                className={pageStyles.contextMenuItem}
                onClick={() => {
                  closeContextMenu()
                  const nextName = window.prompt(t(language, 'rename'), contextMenu.asset.name)
                  if (nextName && nextName !== contextMenu.asset.name) {
                    void renameAsset(contextMenu.asset.id, nextName)
                  }
                }}
              >
                {t(language, 'rename')}
              </button>
              <div className={pageStyles.contextMenuDivider} />
              <button
                type="button"
                className={pageStyles.contextMenuDanger}
                onClick={() => {
                  closeContextMenu()
                  if (window.confirm(t(language, 'deleteSelectionConfirm'))) {
                    void deleteSelectedAssets()
                  }
                }}
              >
                {t(language, 'deleteSelected')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={pageStyles.contextMenuItem}
                onClick={() => {
                  closeContextMenu()
                  const name = window.prompt(t(language, 'addFolder'))
                  if (name) {
                    void createProjectFolder(name, contextMenu.folder.id)
                  }
                }}
              >
                {t(language, 'addFolder')}
              </button>
              <button
                type="button"
                className={pageStyles.contextMenuItem}
                onClick={() => {
                  closeContextMenu()
                  void toggleFavoriteFolder({
                    projectId: project.id,
                    relativePath: contextMenu.folder.relativePath,
                  })
                }}
              >
                {isFavoriteFolder(contextMenu.folder)
                  ? t(language, 'unfavoriteCurrentFolder')
                  : t(language, 'favoriteCurrentFolder')}
              </button>
              {contextMenu.folder.parentId ? (
                <>
                  <button
                    type="button"
                    className={pageStyles.contextMenuItem}
                    onClick={() => {
                      closeContextMenu()
                      const name = window.prompt(t(language, 'renameFolder'), contextMenu.folder.name)
                      if (name) {
                        void renameProjectFolder(contextMenu.folder.id, name)
                      }
                    }}
                  >
                    {t(language, 'renameFolder')}
                  </button>
                  <div className={pageStyles.contextMenuDivider} />
                  <button
                    type="button"
                    className={pageStyles.contextMenuDanger}
                    onClick={() => {
                      closeContextMenu()
                      if (window.confirm(t(language, 'deleteFolder'))) {
                        void deleteProjectFolder(contextMenu.folder.id)
                      }
                    }}
                  >
                    {t(language, 'deleteFolder')}
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
