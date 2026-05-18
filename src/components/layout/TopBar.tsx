import { useShallow } from 'zustand/react/shallow'
import { disciplineLabel, statusLabel, t } from '../../i18n/translate'
import { useSelectedProject } from '../../store/selectors'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import styles from './TopBar.module.css'

export const GLOBAL_SEARCH_INPUT_ID = 'app-global-search'

interface TopBarProps {
  currentPath: string
  onOpenManual: () => void
}

function resolveContextCopy(
  language: 'zh-CN' | 'en-US',
  activePageContext: string | null,
  projectName: string | null,
  projectMeta: string | null,
) {
  switch (activePageContext) {
    case 'project':
      return {
        eyebrow: language === 'zh-CN' ? '项目工作区' : 'Project Workspace',
        title: projectName ?? (language === 'zh-CN' ? '项目工作区' : 'Project Workspace'),
        subtitle:
          projectMeta ?? projectName ?? t(language, 'projectHomeDescription'),
      }
    case 'rules':
      return {
        eyebrow: language === 'zh-CN' ? '当前页面' : 'Current View',
        title: language === 'zh-CN' ? '规则管理' : 'Rules',
        subtitle:
          language === 'zh-CN'
            ? '编辑真实项目目录的自动分配规则。'
            : 'Edit routing rules for real project folders.',
      }
    case 'settings':
      return {
        eyebrow: language === 'zh-CN' ? '当前页面' : 'Current View',
        title: language === 'zh-CN' ? '设置' : 'Settings',
        subtitle:
          language === 'zh-CN' ? '语言、主题和导入默认行为。' : 'Language, theme, and import defaults.',
      }
    case 'overview':
    default:
      return {
        eyebrow: language === 'zh-CN' ? '当前页面' : 'Current View',
        title: language === 'zh-CN' ? '项目总览' : 'Overview',
        subtitle:
          language === 'zh-CN'
            ? '继续最近项目、最近文件和最近操作。'
            : 'Resume recent projects, files, and operations.',
      }
  }
}

export function TopBar({ currentPath, onOpenManual }: TopBarProps) {
  const project = useSelectedProject()
  const {
    searchQuery,
    setSearchQuery,
    settings,
    bindExistingProject,
    importFromDialog,
    undoLastAction,
    activePageContext,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      searchQuery: state.searchQuery,
      setSearchQuery: state.setSearchQuery,
      settings: state.settings,
      bindExistingProject: state.bindExistingProject,
      importFromDialog: state.importFromDialog,
      undoLastAction: state.undoLastAction,
      activePageContext: state.activePageContext,
    })),
  )

  const language = settings.language
  const effectiveContext =
    activePageContext ??
    (currentPath.startsWith('/projects/')
      ? 'project'
      : currentPath.startsWith('/rules')
        ? 'rules'
        : currentPath.startsWith('/settings')
          ? 'settings'
          : 'overview')

  const projectMeta = project
    ? `${disciplineLabel(language, project.discipline)} / ${statusLabel(language, project.status)}`
    : null

  const contextCopy = resolveContextCopy(language, effectiveContext, project?.name ?? null, projectMeta)
  const showPrimaryAction = effectiveContext === 'overview' || effectiveContext === 'project'
  const primaryActionLabel =
    effectiveContext === 'project'
      ? language === 'zh-CN'
        ? '导入到当前项目'
        : 'Import to Project'
      : t(language, 'importFiles')

  return (
    <header className={styles.topBar}>
      <div className={styles.contextBlock}>
        <span className={styles.brandMark}>FM</span>
        <div className={styles.contextCopy}>
          <span className={styles.contextBadge}>{contextCopy.eyebrow}</span>
          <div className={styles.contextTitleRow}>
            <strong title={contextCopy.title}>{contextCopy.title}</strong>
            <span className={styles.contextDivider} aria-hidden="true" />
            <span className={styles.contextSubtitle} title={contextCopy.subtitle}>
              {contextCopy.subtitle}
            </span>
          </div>
        </div>
      </div>

      <label className={styles.search}>
        <span className={styles.searchIcon} aria-hidden="true">
          ⌕
        </span>
        <input
          id={GLOBAL_SEARCH_INPUT_ID}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t(language, 'searchPlaceholder')}
          aria-label={t(language, 'searchLabel')}
        />
        <span className={styles.searchShortcut}>Ctrl / Cmd + K</span>
      </label>

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onOpenManual}>
          {language === 'zh-CN' ? '使用说明' : 'Manual'}
        </button>
        {showPrimaryAction ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void importFromDialog(effectiveContext === 'project' ? 'current_project' : undefined)}
          >
            {primaryActionLabel}
          </button>
        ) : null}
        <button type="button" className={styles.secondaryButton} onClick={() => void undoLastAction()}>
          {t(language, 'undoLastAction')}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => void bindExistingProject()}>
          {t(language, 'openProject')}
        </button>
      </div>
    </header>
  )
}
