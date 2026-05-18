import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { isDesktopRuntime } from '../../adapters/desktopBridge'
import { t } from '../../i18n/translate'
import { useSelectedAsset } from '../../store/selectors'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import { applyDocumentTheme, subscribeToSystemThemeChange } from '../../utils/theme'
import { AssetDetailDrawer } from '../preview/AssetDetailDrawer'
import { ImportAssignmentSheet } from '../workspace/ImportAssignmentSheet'
import { GLOBAL_SEARCH_INPUT_ID, TopBar } from './TopBar'
import { WorkspaceSidebar } from './WorkspaceSidebar'
import styles from './AppShell.module.css'

const INTRO_STORAGE_KEY = 'fluxmint:first-intro-seen:v1'

export function AppShell() {
  const location = useLocation()
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth,
  )
  const [inspectorWidth, setInspectorWidth] = useState(336)
  const [introOpen, setIntroOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    try {
      const seen = window.localStorage.getItem(INTRO_STORAGE_KEY)
      if (!seen) {
        window.localStorage.setItem(INTRO_STORAGE_KEY, 'true')
        return true
      }
      return false
    } catch {
      return true
    }
  })
  const [manualOpen, setManualOpen] = useState(false)
  const selectedAsset = useSelectedAsset()

  const {
    boot,
    toast,
    clearToast,
    dropState,
    importPanelOpen,
    settings,
    sidebarCollapsed,
    inspectorCollapsed,
    toggleSidebarCollapsed,
    toggleInspectorCollapsed,
    setActivePageContext,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      boot: state.boot,
      toast: state.toast,
      clearToast: state.clearToast,
      dropState: state.dropState,
      importPanelOpen: state.importPanelOpen,
      settings: state.settings,
      sidebarCollapsed: state.sidebarCollapsed,
      inspectorCollapsed: state.inspectorCollapsed,
      toggleSidebarCollapsed: state.toggleSidebarCollapsed,
      toggleInspectorCollapsed: state.toggleInspectorCollapsed,
      setActivePageContext: state.setActivePageContext,
    })),
  )

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return
      }
      event.preventDefault()
      const input = document.getElementById(GLOBAL_SEARCH_INPUT_ID) as HTMLInputElement | null
      input?.focus()
      input?.select()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const nextContext = location.pathname.startsWith('/projects/')
      ? 'project'
      : location.pathname.startsWith('/rules')
        ? 'rules'
        : location.pathname.startsWith('/settings')
          ? 'settings'
          : 'overview'

    setActivePageContext(nextContext)
  }, [location.pathname, setActivePageContext])

  useEffect(() => {
    applyDocumentTheme(settings.theme)
    if (settings.theme !== 'system') {
      return
    }

    return subscribeToSystemThemeChange(() => {
      applyDocumentTheme('system')
    })
  }, [settings.theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = resizeStateRef.current
      if (!state) {
        return
      }

      const maxWidth = Math.max(280, Math.min(520, window.innerWidth - 420))
      const nextWidth = Math.min(Math.max(state.startWidth - (event.clientX - state.startX), 280), maxWidth)
      setInspectorWidth(nextWidth)
    }

    const handlePointerUp = () => {
      if (!resizeStateRef.current) {
        return
      }

      resizeStateRef.current = null
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  const autoInspectorHidden = viewportWidth <= 1180
  const autoSidebarCollapsed = viewportWidth <= 1320
  const maxInspectorWidth = Math.max(280, Math.min(520, viewportWidth - 420))
  const clampedInspectorWidth = Math.min(Math.max(inspectorWidth, 280), maxInspectorWidth)

  const language = settings.language
  const showInspector = location.pathname.startsWith('/projects/')
  const effectiveSidebarCollapsed = sidebarCollapsed || autoSidebarCollapsed
  const effectiveInspectorCollapsed = showInspector && !autoInspectorHidden ? inspectorCollapsed : true
  const workspaceClassName = [
    styles.workspace,
    effectiveSidebarCollapsed ? styles.sidebarCollapsed : '',
    effectiveInspectorCollapsed ? styles.inspectorCollapsed : '',
    showInspector && !autoInspectorHidden ? '' : styles.inspectorHidden,
  ]
    .filter(Boolean)
    .join(' ')

  const workspaceStyle = {
    '--app-inspector-expanded-width': `${clampedInspectorWidth}px`,
  } as CSSProperties

  const startInspectorResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: clampedInspectorWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className={styles.shell}>
      <div className={styles.backgroundGlow} />
      <TopBar currentPath={location.pathname} onOpenManual={() => setManualOpen(true)} />
      <div className={workspaceClassName} style={workspaceStyle}>
        <WorkspaceSidebar collapsed={effectiveSidebarCollapsed} onToggle={toggleSidebarCollapsed} />
        <main className={styles.canvas}>
          <Outlet />
        </main>
        {showInspector && !autoInspectorHidden && !effectiveInspectorCollapsed ? (
          <button
            type="button"
            aria-label={language === 'zh-CN' ? '调整右侧预览宽度' : 'Resize inspector'}
            className={styles.inspectorResizeHandle}
            onPointerDown={startInspectorResize}
          />
        ) : null}
        {showInspector && !autoInspectorHidden ? (
          effectiveInspectorCollapsed ? (
            <aside className={styles.inspectorCollapsedRail}>
              <button
                type="button"
                className={styles.inspectorCollapsedToggle}
                onClick={toggleInspectorCollapsed}
                title={language === 'zh-CN' ? '展开右侧预览' : 'Expand inspector'}
                aria-label={language === 'zh-CN' ? '展开右侧预览' : 'Expand inspector'}
              >
                <span className={styles.inspectorCollapsedIcon} aria-hidden="true">
                  &lt;
                </span>
                <span className={styles.inspectorCollapsedLabel}>
                  {language === 'zh-CN' ? '预览' : 'Preview'}
                </span>
                {selectedAsset ? (
                  <span className={styles.inspectorCollapsedMeta} title={selectedAsset.name}>
                    {selectedAsset.format}
                  </span>
                ) : null}
              </button>
            </aside>
          ) : (
            <AssetDetailDrawer collapsed={false} onToggle={toggleInspectorCollapsed} />
          )
        ) : null}
      </div>

      {isDesktopRuntime && dropState !== 'idle' ? (
        <div className={styles.dropOverlay}>
          <div className={styles.dropCard}>
            <p>{dropState === 'importing' ? t(language, 'dropImporting') : t(language, 'dropReady')}</p>
            <strong>
              {dropState === 'importing' ? t(language, 'dropImportingBody') : t(language, 'dropReadyBody')}
            </strong>
          </div>
        </div>
      ) : null}

      {importPanelOpen ? <ImportAssignmentSheet /> : null}

      {introOpen ? (
        <div
          className={styles.guideOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={language === 'zh-CN' ? '首次引导' : 'First Launch Guide'}
        >
          <section className={styles.guideDialog}>
            <div className={styles.guideHeader}>
              <div>
                <p className={styles.guideEyebrow}>{language === 'zh-CN' ? '首次打开' : 'First Launch'}</p>
                <strong>{language === 'zh-CN' ? 'FluxMint 主要功能引导' : 'FluxMint Core Workflow'}</strong>
                <span>
                  {language === 'zh-CN'
                    ? '先看这 4 步，快速完成绑定项目、导入整理、预览和拖出调用。'
                    : 'These 4 steps cover binding a project, importing, previewing, and dragging files into external apps.'}
                </span>
              </div>
              <button type="button" className={styles.guideCloseButton} onClick={() => setIntroOpen(false)}>
                {language === 'zh-CN' ? '开始使用' : 'Start'}
              </button>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <strong>01</strong>
                <h3>{language === 'zh-CN' ? '绑定项目文件夹' : 'Bind Project Folder'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '点击顶部“绑定项目文件夹”，选择你的真实项目目录。'
                    : 'Use the top action to bind an existing real project folder.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>02</strong>
                <h3>{language === 'zh-CN' ? '导入文件到项目' : 'Import Files'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '在项目页拖入文件，或点击“导入到当前项目”。'
                    : 'Drop files on the project page or use “Import to Project”.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>03</strong>
                <h3>{language === 'zh-CN' ? '浏览与预览' : 'Browse and Preview'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '左侧切目录，中间看文件，右侧看预览、信息和操作。'
                    : 'Switch folders on the left, browse files in the center, and inspect details on the right.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>04</strong>
                <h3>{language === 'zh-CN' ? '拖到外部软件' : 'Drag to External Apps'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '从文件行或右侧拖出抓手，直接拖到 Rhino、Blender、Figma、KeyShot 或桌面。'
                    : 'Use the drag-out handle to send files directly to Rhino, Blender, Figma, KeyShot, or the desktop.'}
                </p>
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {manualOpen ? (
        <div
          className={styles.guideOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={language === 'zh-CN' ? '使用说明' : 'Manual'}
        >
          <section className={styles.guideDialog}>
            <div className={styles.guideHeader}>
              <div>
                <p className={styles.guideEyebrow}>{language === 'zh-CN' ? '使用说明' : 'Manual'}</p>
                <strong>{language === 'zh-CN' ? '功能与使用方式' : 'Features and How to Use Them'}</strong>
                <span>
                  {language === 'zh-CN'
                    ? '这里按功能说明用途和操作方式，不等同于首次引导。'
                    : 'This is feature documentation, separate from the first-launch guide.'}
                </span>
              </div>
              <button type="button" className={styles.guideCloseButton} onClick={() => setManualOpen(false)}>
                {language === 'zh-CN' ? '关闭' : 'Close'}
              </button>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <strong>01</strong>
                <h3>{language === 'zh-CN' ? '绑定项目文件夹' : 'Bind Project Folder'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：把真实项目目录接入软件。用法：点击顶部“绑定项目文件夹”，选择现有项目目录。'
                    : 'Purpose: connect a real project folder. Use the top action to bind an existing project directory.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>02</strong>
                <h3>{language === 'zh-CN' ? '导入与整理' : 'Import and Organize'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：把文件移动进项目目录。用法：拖入文件，或点击“导入到当前项目”，再按自动 / 手动 / 当前项目模式分配。'
                    : 'Purpose: move files into project folders. Drag files in or import them, then assign using auto, manual, or current-project mode.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>03</strong>
                <h3>{language === 'zh-CN' ? '目录与文件区' : 'Folders and File Area'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：定位目录、筛选文件。用法：左侧切目录，中间切列表 / 网格、搜索、排序、筛选类型。'
                    : 'Purpose: navigate folders and filter files. Use the left tree, center list/grid, search, sorting, and type filters.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>04</strong>
                <h3>{language === 'zh-CN' ? '预览与打开' : 'Preview and Open'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：看内容、看路径、快速打开。用法：选中文件后在右侧查看预览、位置、信息，并执行打开、定位、重命名。'
                    : 'Purpose: inspect content, location, and metadata. Select a file to preview, reveal, open, or rename it from the right inspector.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>05</strong>
                <h3>{language === 'zh-CN' ? '拖到外部软件' : 'Drag to External Apps'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：把文件直接调用到外部设计软件。用法：拖动文件行或右侧抓手到 Rhino、Blender、Figma、KeyShot 或桌面。'
                    : 'Purpose: send files to external tools. Drag from a file row or inspector handle to Rhino, Blender, Figma, KeyShot, or the desktop.'}
                </p>
              </article>
              <article className={styles.guideCard}>
                <strong>06</strong>
                <h3>{language === 'zh-CN' ? '规则、历史与回收站' : 'Rules, History, and Recycle Bin'}</h3>
                <p>
                  {language === 'zh-CN'
                    ? '作用：自动归类、追踪操作、恢复误删。用法：在规则页配置规则，在项目页查看最近操作、撤销、恢复和回收站。'
                    : 'Purpose: automate routing, track actions, and recover deletions. Configure rules, then review history, undo actions, and restore recycle entries.'}
                </p>
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {toast ? (
        <button type="button" className={styles.toast} onClick={clearToast}>
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </button>
      ) : null}
    </div>
  )
}
