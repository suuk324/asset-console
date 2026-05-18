import { useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { disciplineLabel, statusLabel, t } from '../../i18n/translate'
import { useSelectedProject } from '../../store/selectors'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import type { AssetKindFilter } from '../../types/domain'
import styles from './WorkspaceSidebar.module.css'

interface WorkspaceSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const kindLabelKeys: Record<
  Exclude<AssetKindFilter, 'all'>,
  'filterImage' | 'filterPdf' | 'filterVideo' | 'filterThreeD' | 'filterDocument'
> = {
  image: 'filterImage',
  pdf: 'filterPdf',
  video: 'filterVideo',
  three_d: 'filterThreeD',
  document: 'filterDocument',
}

function projectInitials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const tagNoiseSet = new Set([
  'image',
  'images',
  'pdf',
  'video',
  'document',
  'documents',
  'file',
  'files',
  '3d',
  '3dm',
  'obj',
  'stl',
  'fbx',
  'glb',
  'gltf',
  'blend',
  'bip',
  'ksp',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'mov',
  'mp4',
  'avi',
  'svg',
  'psd',
  'ai',
])

function isMeaningfulTag(tag: string) {
  const normalized = tag.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  if (tagNoiseSet.has(normalized)) {
    return false
  }

  if (/^[a-z0-9]{1,2}$/i.test(normalized)) {
    return false
  }

  return true
}

export function WorkspaceSidebar({ collapsed, onToggle }: WorkspaceSidebarProps) {
  const navigate = useNavigate()
  const project = useSelectedProject()
  const {
    projects,
    assets,
    settings,
    selectedProjectId,
    setSelectedProject,
    searchQuery,
    setSearchQuery,
    assetKindFilter,
    setAssetKindFilter,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      projects: state.projects,
      assets: state.assets,
      settings: state.settings,
      selectedProjectId: state.selectedProjectId,
      setSelectedProject: state.setSelectedProject,
      searchQuery: state.searchQuery,
      setSearchQuery: state.setSearchQuery,
      assetKindFilter: state.assetKindFilter,
      setAssetKindFilter: state.setAssetKindFilter,
    })),
  )

  const language = settings.language
  const quickLinks = [
    {
      to: '/overview',
      label: t(language, 'navOverview'),
      short: language === 'zh-CN' ? '总' : 'O',
    },
    {
      to: '/rules',
      label: t(language, 'navRules'),
      short: language === 'zh-CN' ? '规' : 'R',
    },
    {
      to: '/settings',
      label: t(language, 'navSettings'),
      short: language === 'zh-CN' ? '设' : 'S',
    },
  ]

  const smartKinds = useMemo(
    () => (['image', 'three_d', 'pdf', 'document'] as const).filter((kind) => assets.some((asset) => asset.kind === kind)),
    [assets],
  )

  const smartTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const asset of assets) {
      for (const tag of asset.tags) {
        if (!isMeaningfulTag(tag)) {
          continue
        }
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
  }, [assets])

  const activeFilters = useMemo(() => {
    const tokens: string[] = []
    if (assetKindFilter !== 'all') {
      tokens.push(t(language, kindLabelKeys[assetKindFilter]))
    }
    if (searchQuery.trim()) {
      tokens.push(searchQuery.trim())
    }
    return tokens
  }, [assetKindFilter, language, searchQuery])

  if (collapsed) {
    return (
      <aside className={styles.sidebarRail}>
        <button type="button" className={styles.railToggle} onClick={onToggle} title={language === 'zh-CN' ? '展开导航' : 'Expand navigation'}>
          &gt;
        </button>

        <nav className={styles.railNav}>
          {quickLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? styles.railLinkActive : styles.railLink)}
              title={item.label}
            >
              {item.short}
            </NavLink>
          ))}
        </nav>

        <div className={styles.railSection}>
          {project ? (
            <button
              type="button"
              className={styles.projectAvatar}
              title={project.name}
              onClick={() => {
                setSelectedProject(project.id)
                navigate(`/projects/${project.id}`)
              }}
            >
              {projectInitials(project.name)}
            </button>
          ) : (
            <div className={styles.projectAvatarMuted} title={t(language, 'noProjectSelected')}>
              FM
            </div>
          )}
          <span className={styles.countBadge} title={projects.length.toString()}>
            {projects.length}
          </span>
          {activeFilters.length > 0 ? (
            <button
              type="button"
              className={styles.filterBadge}
              title={activeFilters.join(' / ')}
              onClick={() => {
                setAssetKindFilter('all')
                setSearchQuery('')
              }}
            >
              {activeFilters.length}
            </button>
          ) : null}
        </div>
      </aside>
    )
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.shell}>
        <div className={styles.headerRow}>
          <div className={styles.brandBlock}>
            <span className={styles.brandMark}>FM</span>
            <div className={styles.brandCopy}>
              <p>{language === 'zh-CN' ? '工作台' : 'Workspace'}</p>
              <strong>{language === 'zh-CN' ? '导航' : 'Navigator'}</strong>
            </div>
          </div>
          <button type="button" className={styles.collapseButton} onClick={onToggle} title={language === 'zh-CN' ? '折叠导航' : 'Collapse navigation'}>
            &lt;
          </button>
        </div>

        <nav className={styles.navList}>
          {quickLinks.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? styles.navItemActive : styles.navItem)}>
              <span className={styles.navMark}>{item.short}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{language === 'zh-CN' ? '项目' : 'Projects'}</p>
            <strong>
              {language === 'zh-CN' ? '最近项目' : 'Recent & Current'} {projects.length}
            </strong>
          </div>
          <div className={styles.projectList}>
            {projects.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={selectedProjectId === entry.id ? styles.projectItemActive : styles.projectItem}
                onClick={() => {
                  setSelectedProject(entry.id)
                  navigate(`/projects/${entry.id}`)
                }}
              >
                <span className={styles.projectItemMark}>{projectInitials(entry.name)}</span>
                <div className={styles.projectItemCopy}>
                  <strong>{entry.name}</strong>
                  <span>
                    {disciplineLabel(language, entry.discipline)} / {statusLabel(language, entry.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.eyebrow}>{language === 'zh-CN' ? '筛选' : 'Filters'}</p>
            <strong>{language === 'zh-CN' ? '智能标签与快速筛选' : 'Smart Tags & Quick Filters'}</strong>
          </div>

          <div className={styles.filterChips}>
            {smartKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                className={assetKindFilter === kind ? styles.filterChipActive : styles.filterChip}
                onClick={() => setAssetKindFilter(assetKindFilter === kind ? 'all' : kind)}
              >
                {t(language, kindLabelKeys[kind])}
              </button>
            ))}
          </div>

          {smartTags.length > 0 ? (
            <div className={styles.filterChips}>
              {smartTags.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  className={searchQuery.trim() === tag ? styles.filterChipActive : styles.filterChip}
                  onClick={() => setSearchQuery(searchQuery.trim() === tag ? '' : tag)}
                  title={`${tag} / ${count}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.copy}>{language === 'zh-CN' ? '当前还没有可用标签。' : 'No smart tags yet.'}</p>
          )}

          {activeFilters.length > 0 ? (
            <div className={styles.filterFooter}>
              <div className={styles.filterSummary}>
                {activeFilters.map((token) => (
                  <span key={token} className={styles.filterSummaryChip}>
                    {token}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className={styles.clearFiltersButton}
                onClick={() => {
                  setAssetKindFilter('all')
                  setSearchQuery('')
                }}
              >
                {language === 'zh-CN' ? '清空' : 'Clear'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  )
}
