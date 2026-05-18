import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { AssetCardPreview } from '../components/common/AssetCardPreview'
import { EmptyState } from '../components/common/EmptyState'
import { SectionHeader } from '../components/common/SectionHeader'
import { disciplineLabel, statusLabel, t } from '../i18n/translate'
import { groupDuplicateAssets } from '../store/selectors'
import { useAssetConsoleStore } from '../store/useAssetConsoleStore'
import pageStyles from './Page.module.css'

export function DashboardPage() {
  const navigate = useNavigate()
  const {
    projects,
    assets,
    actions,
    settings,
    workspaceWatchEnabled,
    recycleEntries,
    setSelectedProject,
    setSelectedAsset,
    undoLastAction,
    undoLastImport,
    restoreRecycleEntries,
    emptyRecycleBin,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      projects: state.projects,
      assets: state.assets,
      actions: state.actions,
      settings: state.settings,
      workspaceWatchEnabled: state.workspaceWatchEnabled,
      recycleEntries: state.recycleEntries,
      setSelectedProject: state.setSelectedProject,
      setSelectedAsset: state.setSelectedAsset,
      undoLastAction: state.undoLastAction,
      undoLastImport: state.undoLastImport,
      restoreRecycleEntries: state.restoreRecycleEntries,
      emptyRecycleBin: state.emptyRecycleBin,
    })),
  )

  const language = settings.language
  const recentFiles = assets.slice(0, 6)
  const recentActions = actions.slice(0, 8)
  const recentRecycleEntries = recycleEntries.slice(0, 5)
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const duplicateGroups = useMemo(() => groupDuplicateAssets(assets).slice(0, 4), [assets])

  return (
    <div className={`${pageStyles.page} ${pageStyles.pageStatic}`}>
      <SectionHeader
        eyebrow={t(language, 'overviewEyebrow')}
        title={language === 'zh-CN' ? '项目总览' : 'Project Overview'}
        description={
          language === 'zh-CN'
            ? '从最近项目、最近文件、操作历史和回收站继续工作。'
            : 'Resume work from recent projects, files, history, and the recycle bin.'
        }
        compact
      />

      {projects.length === 0 ? (
        <EmptyState title={t(language, 'emptyProjectsTitle')} body={t(language, 'emptyProjectsBody')} />
      ) : (
        <>
          <div className={pageStyles.statusRow}>
            <span className={pageStyles.statusBadgeActive}>
              {language === 'zh-CN' ? `项目 ${projects.length}` : `Projects ${projects.length}`}
            </span>
            <span className={pageStyles.statusBadgeMuted}>
              {language === 'zh-CN' ? `文件 ${assets.length}` : `Files ${assets.length}`}
            </span>
            <span className={pageStyles.statusBadgeMuted}>
              {language === 'zh-CN' ? `最近操作 ${actions.length}` : `Recent Actions ${actions.length}`}
            </span>
            <span className={pageStyles.statusBadgeMuted}>
              {t(language, 'autoRefreshStatus')}: {workspaceWatchEnabled ? t(language, 'autoRefreshOn') : t(language, 'autoRefreshOff')}
            </span>
            <span className={pageStyles.statusBadgeMuted}>
              {t(language, 'recycleBin')}: {recycleEntries.length}
            </span>
          </div>

          <div className={pageStyles.overviewGrid}>
            <div className={pageStyles.stack}>
              <section className={`${pageStyles.panel} ${pageStyles.panelStrong}`}>
                <div className={pageStyles.panelHeader}>
                  <h2>{t(language, 'recentProjects')}</h2>
                  <span className={pageStyles.mutedText}>
                    {language === 'zh-CN' ? '快速回到最近活跃的工作' : 'Jump back into active work'}
                  </span>
                </div>
                <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      className={pageStyles.projectCardButton}
                      onClick={() => {
                        setSelectedProject(project.id)
                        navigate(`/projects/${project.id}`)
                      }}
                    >
                      <div className={pageStyles.projectCardBody}>
                        <strong>{project.name}</strong>
                        <span>
                          {disciplineLabel(language, project.discipline)} / {statusLabel(language, project.status)}
                        </span>
                        <span>{project.rootPath}</span>
                      </div>
                      <span className={pageStyles.projectCardTime}>{project.lastOpenedAt}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className={`${pageStyles.panel} ${pageStyles.panelStrong}`}>
                <div className={pageStyles.panelHeader}>
                  <h2>{t(language, 'recentFiles')}</h2>
                  <span className={pageStyles.mutedText}>
                    {language === 'zh-CN' ? '直接进入项目并继续查看文件' : 'Open and inspect files quickly'}
                  </span>
                </div>
                {recentFiles.length === 0 ? (
                  <p>{t(language, 'noFilesInFolder')}</p>
                ) : (
                  <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
                    {recentFiles.map((asset) => {
                      const project = projectById.get(asset.projectId)
                      const locationLabel = (project?.name ?? asset.relativeFolderPath) || '/'
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          className={pageStyles.recentFileButton}
                          onClick={() => {
                            setSelectedProject(asset.projectId)
                            setSelectedAsset(asset.id)
                            navigate(`/projects/${asset.projectId}`)
                          }}
                        >
                          <div className={pageStyles.assetThumb}>
                            <AssetCardPreview asset={asset} alt={asset.name} />
                          </div>
                          <div className={pageStyles.fileInfo}>
                            <strong>{asset.name}</strong>
                            <span>{locationLabel}</span>
                            <span>{asset.relativePath}</span>
                          </div>
                          <div className={pageStyles.fileMeta}>
                            <span>{asset.meta.fileSize}</span>
                            <span>{asset.lastModifiedAt}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <div className={pageStyles.stack}>
              <section className={`${pageStyles.panel} ${pageStyles.panelMuted}`}>
                <div className={pageStyles.panelHeader}>
                  <div>
                    <h2>{t(language, 'recentOperations')}</h2>
                    <span className={pageStyles.mutedText}>
                      {language === 'zh-CN' ? '最近完成的动作，可随时撤销最近一步' : 'Recent actions with quick undo access'}
                    </span>
                  </div>
                  <div className={pageStyles.actions}>
                    <button type="button" className={pageStyles.secondaryButton} onClick={() => void undoLastImport()}>
                      {t(language, 'undoLastImport')}
                    </button>
                    <button type="button" className={pageStyles.secondaryButton} onClick={() => void undoLastAction()}>
                      {t(language, 'undoLastAction')}
                    </button>
                  </div>
                </div>
                {recentActions.length === 0 ? (
                  <p>{t(language, 'noOperations')}</p>
                ) : (
                  <div className={`${pageStyles.list} ${pageStyles.scrollArea}`}>
                    {recentActions.map((action) => (
                      <div key={action.id} className={pageStyles.timelineItem}>
                        <div className={pageStyles.timelineDot} />
                        <div className={pageStyles.timelineCopy}>
                          <strong>{action.detail}</strong>
                          <span>
                            {action.timestamp}
                            {action.reversible ? ` · ${t(language, 'historyUndoable')}` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={`${pageStyles.panel} ${pageStyles.panelWarning}`}>
                <div className={pageStyles.panelHeader}>
                  <h2>{t(language, 'potentialDuplicateFiles')}</h2>
                  <span className={pageStyles.mutedText}>
                    {language === 'zh-CN' ? '优先处理内容重复的文件组' : 'Review exact duplicate content first'}
                  </span>
                </div>
                {duplicateGroups.length === 0 ? (
                  <p>{t(language, 'noDuplicates')}</p>
                ) : (
                  <div className={pageStyles.list}>
                    {duplicateGroups.map((group) => (
                      <div key={group.id} className={pageStyles.warningCard}>
                        <strong>{group.assets[0]?.name}</strong>
                        {group.assets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            className={pageStyles.inlineLinkButton}
                            onClick={() => {
                              setSelectedProject(asset.projectId)
                              setSelectedAsset(asset.id)
                              navigate(`/projects/${asset.projectId}`)
                            }}
                          >
                            {asset.relativePath} / {asset.meta.fileSize}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={`${pageStyles.panel} ${pageStyles.panelMuted}`}>
                <div className={pageStyles.panelHeader}>
                  <div>
                    <h2>{t(language, 'recycleBin')}</h2>
                    <span className={pageStyles.mutedText}>{t(language, 'recycleBinHint')}</span>
                  </div>
                  <div className={pageStyles.actions}>
                    <button
                      type="button"
                      className={pageStyles.dangerButton}
                      disabled={recycleEntries.length === 0}
                      onClick={() => {
                        if (window.confirm(t(language, 'emptyRecycleBinConfirm'))) {
                          void emptyRecycleBin()
                        }
                      }}
                    >
                      {t(language, 'emptyRecycleBin')}
                    </button>
                  </div>
                </div>
                {recentRecycleEntries.length === 0 ? (
                  <p>{t(language, 'noRecycleEntries')}</p>
                ) : (
                  <div className={pageStyles.list}>
                    {recentRecycleEntries.map((entry) => {
                      const project = entry.projectId ? projectById.get(entry.projectId) : null
                      return (
                        <div key={entry.id} className={pageStyles.listItem}>
                          <div>
                            <strong>{entry.name}</strong>
                            <span>{project?.name ?? entry.originalPath}</span>
                            <span>{entry.deletedAt}</span>
                          </div>
                          <div className={pageStyles.actions}>
                            <span className={pageStyles.statusBadgeMuted}>{entry.sizeLabel}</span>
                            <button
                              type="button"
                              className={pageStyles.secondaryButton}
                              onClick={() => void restoreRecycleEntries([entry.id])}
                            >
                              {t(language, 'recycleBinRestore')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
