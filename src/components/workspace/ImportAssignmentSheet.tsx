import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ImportAssignmentRecord } from '../../adapters/desktopBridge'
import { importModeLabel, t } from '../../i18n/translate'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import type { Asset, FolderShortcut, ProjectFolder } from '../../types/domain'
import styles from './ImportAssignmentSheet.module.css'

function normalizeNameStem(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[-_\s]+/g, '')
    .replace(/\d+$/, '')
}

function createDraftAssignment(
  candidateId: string,
  sourcePath: string,
  current: Partial<ImportAssignmentRecord>,
  projectId: string,
  folder: { id: string; relativePath: string } | null,
) {
  return {
    candidateId,
    sourcePath,
    targetProjectId: projectId,
    targetFolderId: folder?.id ?? null,
    targetRelativePath: folder?.relativePath ?? '',
    conflictStrategy: current.conflictStrategy ?? 'keep_both',
    suggestedTags: current.suggestedTags ?? [],
    reason: current.reason ?? 'Manual assignment',
    confidence: current.confidence ?? 0.5,
    requiresConfirmation: false,
    warnings: current.warnings ?? [],
  } satisfies ImportAssignmentRecord
}

function resolveShortcutFolder(shortcut: FolderShortcut, folders: ProjectFolder[]) {
  return folders.find(
    (folder) => folder.projectId === shortcut.projectId && folder.relativePath === shortcut.relativePath,
  )
}

function buildWarnings(
  item: { name: string; fileSizeBytes: number },
  assignment: Pick<ImportAssignmentRecord, 'targetProjectId' | 'targetRelativePath'>,
  assets: Asset[],
  language: 'zh-CN' | 'en-US',
) {
  const folderAssets = assets.filter(
    (asset) =>
      asset.projectId === assignment.targetProjectId &&
      asset.relativeFolderPath === assignment.targetRelativePath,
  )

  const warnings: ImportAssignmentRecord['warnings'] = []
  const exact = folderAssets.find((asset) => asset.name.toLowerCase() === item.name.toLowerCase())
  if (exact) {
    warnings.push({
      kind: exact.meta.fileSizeBytes === item.fileSizeBytes ? 'exact_duplicate' : 'same_name_conflict',
      message:
        exact.meta.fileSizeBytes === item.fileSizeBytes
          ? t(language, 'exactDuplicate')
          : t(language, 'sameNameConflict'),
      existingAssetId: exact.id,
      existingAssetName: exact.name,
      existingManagedPath: exact.managedPath,
    })
  }

  const sourceBase = normalizeNameStem(item.name)
  const similar = folderAssets.find(
    (asset) => asset.name !== exact?.name && normalizeNameStem(asset.name) === sourceBase,
  )
  if (similar) {
    warnings.push({
      kind: 'similar_name',
      message: t(language, 'similarNameConflict'),
      existingAssetId: similar.id,
      existingAssetName: similar.name,
      existingManagedPath: similar.managedPath,
    })
  }

  return warnings
}

function applyAssignmentWarnings(
  item: { id: string; name: string; fileSizeBytes: number },
  assignment: ImportAssignmentRecord,
  assets: Asset[],
  language: 'zh-CN' | 'en-US',
) {
  return {
    ...assignment,
    candidateId: item.id,
    warnings: buildWarnings(item, assignment, assets, language),
  } satisfies ImportAssignmentRecord
}

export function ImportAssignmentSheet() {
  const {
    importPlan,
    projects,
    folders,
    assets,
    settings,
    selectedProjectId,
    selectedFolderId,
    applyImportAssignments,
    closeImportPanel,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      importPlan: state.importPlan,
      projects: state.projects,
      folders: state.folders,
      assets: state.assets,
      settings: state.settings,
      selectedProjectId: state.selectedProjectId,
      selectedFolderId: state.selectedFolderId,
      applyImportAssignments: state.applyImportAssignments,
      closeImportPanel: state.closeImportPanel,
    })),
  )

  const language = settings.language

  const foldersByProject = useMemo(() => {
    const next = new Map<string, typeof folders>()
    for (const folder of folders) {
      const existing = next.get(folder.projectId) ?? []
      existing.push(folder)
      next.set(folder.projectId, existing)
    }

    for (const value of next.values()) {
      value.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    }

    return next
  }, [folders])

  const [draftAssignments, setDraftAssignments] = useState<ImportAssignmentRecord[]>(
    importPlan.map((item) => {
      const fallbackProjectId = item.assignment?.targetProjectId ?? selectedProjectId ?? projects[0]?.id ?? ''
      const fallbackFolder =
        folders.find((folder) => folder.id === item.assignment?.targetFolderId) ??
        folders.find((folder) => folder.id === selectedFolderId) ??
        folders.find((folder) => folder.projectId === fallbackProjectId) ??
        null

      return applyAssignmentWarnings(
        item,
        createDraftAssignment(
          item.assignment?.candidateId ?? item.id,
          item.sourcePath,
          item.assignment ?? {},
          fallbackProjectId,
          fallbackFolder,
        ),
        assets,
        language,
      )
    }),
  )

  const [bulkProjectId, setBulkProjectId] = useState(
    selectedProjectId ?? draftAssignments[0]?.targetProjectId ?? projects[0]?.id ?? '',
  )

  const initialBulkFolderId =
    folders.find((folder) => folder.id === selectedFolderId && folder.projectId === bulkProjectId)?.id ??
    draftAssignments.find((assignment) => assignment.targetProjectId === bulkProjectId)?.targetFolderId ??
    (foldersByProject.get(bulkProjectId) ?? [])[0]?.id ??
    ''

  const [bulkFolderId, setBulkFolderId] = useState(initialBulkFolderId)
  const [bulkConflictStrategy, setBulkConflictStrategy] =
    useState<ImportAssignmentRecord['conflictStrategy']>('keep_both')

  const favoriteShortcutFolders = useMemo(
    () =>
      settings.favoriteFolders
        .map((shortcut) => resolveShortcutFolder(shortcut, folders))
        .filter((folder): folder is ProjectFolder => Boolean(folder)),
    [folders, settings.favoriteFolders],
  )

  const recentShortcutFolders = useMemo(
    () =>
      settings.recentTargetFolders
        .map((shortcut) => resolveShortcutFolder(shortcut, folders))
        .filter((folder): folder is ProjectFolder => Boolean(folder)),
    [folders, settings.recentTargetFolders],
  )

  const currentContextFolders = useMemo(() => {
    const currentProjectFolders = selectedProjectId ? foldersByProject.get(selectedProjectId) ?? [] : []
    const rootFolder =
      currentProjectFolders.find((folder) => folder.relativePath === '') ?? currentProjectFolders[0] ?? null
    const selectedFolder = selectedFolderId
      ? currentProjectFolders.find((folder) => folder.id === selectedFolderId) ?? null
      : null

    return [rootFolder, selectedFolder].filter((folder, index, list): folder is ProjectFolder => {
      if (!folder) {
        return false
      }
      return list.findIndex((entry) => entry?.id === folder.id) === index
    })
  }, [foldersByProject, selectedFolderId, selectedProjectId])

  const warningCount = draftAssignments.reduce((sum, item) => sum + item.warnings.length, 0)
  const warningSummary = useMemo(
    () =>
      draftAssignments.reduce(
        (summary, assignment) => {
          for (const warning of assignment.warnings) {
            if (warning.kind === 'exact_duplicate') {
              summary.exact += 1
            } else if (warning.kind === 'same_name_conflict') {
              summary.sameName += 1
            } else if (warning.kind === 'similar_name') {
              summary.similar += 1
            }
          }
          return summary
        },
        { exact: 0, sameName: 0, similar: 0 },
      ),
    [draftAssignments],
  )

  const updateAssignment = (
    item: (typeof importPlan)[number],
    patch: Partial<ImportAssignmentRecord>,
    nextProjectId?: string,
    nextFolder?: ProjectFolder | null,
  ) => {
    setDraftAssignments((current) =>
      current.map((assignment) => {
        if (assignment.candidateId !== (item.assignment?.candidateId ?? item.id)) {
          return assignment
        }

        const base = createDraftAssignment(
          item.assignment?.candidateId ?? item.id,
          item.sourcePath,
          { ...assignment, ...patch },
          nextProjectId ?? patch.targetProjectId ?? assignment.targetProjectId,
          nextFolder ??
            folders.find((folder) => folder.id === (patch.targetFolderId ?? assignment.targetFolderId)) ??
            null,
        )

        return applyAssignmentWarnings(item, base, assets, language)
      }),
    )
  }

  const applyTargetToAll = (folderOverride?: ProjectFolder | null, projectIdOverride?: string) => {
    const nextProjectId = projectIdOverride ?? bulkProjectId
    const targetFolders = foldersByProject.get(nextProjectId) ?? []
    const nextFolder =
      folderOverride ?? targetFolders.find((folder) => folder.id === bulkFolderId) ?? targetFolders[0] ?? null

    setDraftAssignments((current) =>
      current.map((assignment) => {
        const item = importPlan.find((entry) => (entry.assignment?.candidateId ?? entry.id) === assignment.candidateId)
        if (!item) {
          return assignment
        }
        return applyAssignmentWarnings(
          item,
          createDraftAssignment(assignment.candidateId, assignment.sourcePath, assignment, nextProjectId, nextFolder),
          assets,
          language,
        )
      }),
    )
  }

  const applyShortcut = (folder: ProjectFolder) => {
    setBulkProjectId(folder.projectId)
    setBulkFolderId(folder.id)
    applyTargetToAll(folder, folder.projectId)
  }

  const applyConflictStrategyToWarnings = () => {
    setDraftAssignments((current) =>
      current.map((assignment) =>
        assignment.warnings.length > 0
          ? {
              ...assignment,
              conflictStrategy: bulkConflictStrategy,
            }
          : assignment,
      ),
    )
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div>
            <h2>{t(language, 'manualAssignmentTitle')}</h2>
            <p>
              {t(language, 'importModeLabelForSheet')}: {importModeLabel(language, settings.defaultImportMode)}
            </p>
            <div className={styles.summaryChips}>
              <span className={styles.summaryChip}>
                {language === 'zh-CN' ? `文件 ${importPlan.length}` : `${importPlan.length} files`}
              </span>
              <span className={styles.summaryChip}>
                {language === 'zh-CN' ? `提醒 ${warningCount}` : `${warningCount} warnings`}
              </span>
            </div>
          </div>
        </div>

        {warningCount > 0 ? (
          <div className={styles.warningBanner}>
            <strong>
              {t(language, 'importWarnings')} / {warningCount} {t(language, 'duplicateCount')}
            </strong>
            <p>{t(language, 'duplicatePanelHint')}</p>
            <div className={styles.summaryChips}>
              <span className={styles.summaryChip}>
                {t(language, 'exactDuplicateCount')} {warningSummary.exact}
              </span>
              <span className={styles.summaryChip}>
                {t(language, 'sameNameConflictCount')} {warningSummary.sameName}
              </span>
              <span className={styles.summaryChip}>
                {t(language, 'similarNameConflictCount')} {warningSummary.similar}
              </span>
            </div>
          </div>
        ) : null}

        <div className={styles.bulkBar}>
          <div className={styles.bulkHeading}>
            <strong>{t(language, 'bulkAssignmentTitle')}</strong>
            <span>{t(language, 'applyToAll')} / {t(language, 'importConflictSummary')}</span>
          </div>

          <label className={styles.field}>
            <span>{t(language, 'targetProject')}</span>
            <select
              value={bulkProjectId}
              onChange={(event) => {
                const nextProjectId = event.target.value
                const nextFolder = (foldersByProject.get(nextProjectId) ?? [])[0]
                setBulkProjectId(nextProjectId)
                setBulkFolderId(nextFolder?.id ?? '')
              }}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{t(language, 'targetFolder')}</span>
            <select value={bulkFolderId} onChange={(event) => setBulkFolderId(event.target.value)}>
              {(foldersByProject.get(bulkProjectId) ?? []).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.relativePath || '/'}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>{t(language, 'conflictStrategy')}</span>
            <select
              value={bulkConflictStrategy}
              onChange={(event) =>
                setBulkConflictStrategy(event.target.value as ImportAssignmentRecord['conflictStrategy'])
              }
            >
              <option value="keep_both">{t(language, 'conflictKeepBoth')}</option>
              <option value="replace">{t(language, 'conflictReplace')}</option>
              <option value="skip">{t(language, 'conflictSkip')}</option>
            </select>
          </label>

          <div className={styles.bulkActions}>
            <button type="button" className={styles.primary} onClick={() => applyTargetToAll()}>
              {t(language, 'applyToAll')}
            </button>
            <button type="button" className={styles.secondary} onClick={applyConflictStrategyToWarnings}>
              {t(language, 'applyConflictToWarnings')}
            </button>
          </div>
        </div>

        <div className={styles.shortcutSection}>
          <div className={styles.shortcutBlock}>
            <strong>{language === 'zh-CN' ? '当前工作区目标' : 'Current workspace targets'}</strong>
            <div className={styles.shortcutChips}>
              {currentContextFolders.length === 0 ? (
                <span className={styles.emptyHint}>
                  {language === 'zh-CN'
                    ? '先进入一个项目或选择一个目录，这里会给你最接近当前工作的目标。'
                    : 'Open a project or select a folder to get contextual targets here.'}
                </span>
              ) : (
                currentContextFolders.map((folder) => (
                  <button
                    key={`current-${folder.id}`}
                    type="button"
                    className={styles.shortcutChip}
                    onClick={() => applyShortcut(folder)}
                  >
                    {folder.relativePath || '/'}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={styles.shortcutBlock}>
            <strong>{t(language, 'favoriteFolders')}</strong>
            <div className={styles.shortcutChips}>
              {favoriteShortcutFolders.length === 0 ? (
                <span className={styles.emptyHint}>{t(language, 'noShortcuts')}</span>
              ) : (
                favoriteShortcutFolders.map((folder) => (
                  <button
                    key={`favorite-${folder.id}`}
                    type="button"
                    className={styles.shortcutChip}
                    onClick={() => applyShortcut(folder)}
                  >
                    {folder.relativePath || '/'}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={styles.shortcutBlock}>
            <strong>{t(language, 'recentTargets')}</strong>
            <div className={styles.shortcutChips}>
              {recentShortcutFolders.length === 0 ? (
                <span className={styles.emptyHint}>{t(language, 'noShortcuts')}</span>
              ) : (
                recentShortcutFolders.map((folder) => (
                  <button
                    key={`recent-${folder.id}`}
                    type="button"
                    className={styles.shortcutChip}
                    onClick={() => applyShortcut(folder)}
                  >
                    {folder.relativePath || '/'}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={styles.list}>
          {importPlan.map((item) => {
            const assignment =
              draftAssignments.find((entry) => entry.candidateId === (item.assignment?.candidateId ?? item.id)) ?? null
            const targetProjectId = assignment?.targetProjectId ?? selectedProjectId ?? projects[0]?.id ?? ''
            const targetFolders = foldersByProject.get(targetProjectId) ?? []

            return (
              <div key={item.id} className={styles.card}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.sourcePath}</p>
                  <p>{assignment?.reason ?? item.assignment?.reason ?? t(language, 'folderMissing')}</p>
                  {assignment?.warnings.length ? (
                    <div className={styles.warningList}>
                      {assignment.warnings.map((warning, index) => (
                        <div key={`${item.id}-${warning.kind}-${index}`} className={styles.warningItem}>
                          <strong>{warning.message}</strong>
                          {warning.existingAssetName ? <span>{warning.existingAssetName}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <label className={styles.field}>
                  <span>{t(language, 'targetProject')}</span>
                  <select
                    value={targetProjectId}
                    onChange={(event) => {
                      const nextProjectId = event.target.value
                      const nextFolder = (foldersByProject.get(nextProjectId) ?? [])[0] ?? null
                      updateAssignment(item, {}, nextProjectId, nextFolder)
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>{t(language, 'targetFolder')}</span>
                  <select
                    value={assignment?.targetFolderId ?? ''}
                    onChange={(event) => {
                      const nextFolder = targetFolders.find((folder) => folder.id === event.target.value) ?? null
                      updateAssignment(item, {}, targetProjectId, nextFolder)
                    }}
                  >
                    {targetFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.relativePath || '/'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>{t(language, 'conflictStrategy')}</span>
                  <select
                    value={assignment?.conflictStrategy ?? 'keep_both'}
                    onChange={(event) =>
                      updateAssignment(item, {
                        conflictStrategy: event.target.value as ImportAssignmentRecord['conflictStrategy'],
                      })
                    }
                  >
                    <option value="keep_both">{t(language, 'conflictKeepBoth')}</option>
                    <option value="replace">{t(language, 'conflictReplace')}</option>
                    <option value="skip">{t(language, 'conflictSkip')}</option>
                  </select>
                </label>
              </div>
            )
          })}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={closeImportPanel}>
            {t(language, 'cancel')}
          </button>
          <button type="button" className={styles.primary} onClick={() => void applyImportAssignments(draftAssignments)}>
            {t(language, 'save')}
          </button>
        </div>
      </div>
    </div>
  )
}
