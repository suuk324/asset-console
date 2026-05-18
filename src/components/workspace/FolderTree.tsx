import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import type { ProjectFolder, SupportedLanguage } from '../../types/domain'
import { t } from '../../i18n/translate'
import styles from './FolderTree.module.css'

const INTERNAL_ASSET_DRAG_TYPE = 'application/x-asset-console-assets'

interface FolderTreeProps {
  folders: ProjectFolder[]
  selectedFolderId: string | null
  language: SupportedLanguage
  onSelect: (folderId: string) => void
  onMoveAssets?: (folderId: string, assetIds?: string[]) => void
  onFolderContextMenu?: (folder: ProjectFolder, event: MouseEvent<HTMLDivElement>) => void
}

interface FolderTreeNode {
  folder: ProjectFolder
  children: FolderTreeNode[]
}

function collectAncestorIds(folderId: string | null, folders: ProjectFolder[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const expanded = new Set<string>()
  let cursor = folderId ? byId.get(folderId) ?? null : null

  while (cursor?.parentId) {
    expanded.add(cursor.parentId)
    cursor = byId.get(cursor.parentId) ?? null
  }

  return expanded
}

function buildTree(folders: ProjectFolder[]) {
  const byParent = new Map<string | null, ProjectFolder[]>()
  for (const folder of folders) {
    const key = folder.parentId ?? null
    const existing = byParent.get(key) ?? []
    existing.push(folder)
    byParent.set(key, existing)
  }

  const buildNode = (folder: ProjectFolder): FolderTreeNode => ({
    folder,
    children: (byParent.get(folder.id) ?? [])
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map(buildNode),
  })

  return (byParent.get(null) ?? [])
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .map(buildNode)
}

function hasInternalAssetDrag(types: DataTransfer['types']) {
  if (!types) {
    return false
  }

  return Array.from(types).includes(INTERNAL_ASSET_DRAG_TYPE)
}

function readDraggedAssetIds(dataTransfer: DataTransfer) {
  const payload = dataTransfer.getData(INTERNAL_ASSET_DRAG_TYPE)
  if (!payload) {
    return []
  }

  return payload
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function FolderTree({
  folders,
  selectedFolderId,
  language,
  onSelect,
  onMoveAssets,
  onFolderContextMenu,
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders])
  const [manualExpandedIds, setManualExpandedIds] = useState<Set<string>>(new Set())
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const ancestorIds = useMemo(() => collectAncestorIds(selectedFolderId, folders), [folders, selectedFolderId])

  const expandedIds = useMemo(() => {
    const next = new Set(manualExpandedIds)
    const rootIds = folders.filter((folder) => folder.parentId === null).map((folder) => folder.id)
    for (const rootId of rootIds) {
      next.add(rootId)
    }
    for (const ancestorId of ancestorIds) {
      next.add(ancestorId)
    }
    return next
  }, [ancestorIds, folders, manualExpandedIds])

  const toggleFolder = (folderId: string) => {
    setManualExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const renderNode = (node: FolderTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.folder.id)
    const isRoot = node.folder.parentId === null
    const label = isRoot ? t(language, 'rootFolder') : node.folder.name
    const isSelected = selectedFolderId === node.folder.id
    const isAncestor = ancestorIds.has(node.folder.id)
    const subtitle = isRoot ? t(language, 'allFiles') : isSelected ? node.folder.relativePath || '/' : null
    const isDropTarget = dropTargetFolderId === node.folder.id

    return (
      <div
        key={node.folder.id}
        className={styles.node}
        style={{ '--tree-depth': depth } as CSSProperties}
      >
        <div
          className={
            isDropTarget
              ? styles.rowDropTarget
              : isSelected
                ? styles.rowActive
                : isAncestor
                  ? styles.rowAncestor
                : styles.row
          }
          data-depth={depth}
          data-root={isRoot ? 'true' : undefined}
          onContextMenu={(event) => {
            onFolderContextMenu?.(node.folder, event)
          }}
          onDragOver={(event) => {
            if (!hasInternalAssetDrag(event.dataTransfer.types) || !onMoveAssets) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
            setDropTargetFolderId(node.folder.id)
          }}
          onDragLeave={() => {
            if (dropTargetFolderId === node.folder.id) {
              setDropTargetFolderId(null)
            }
          }}
          onDrop={(event) => {
            if (!hasInternalAssetDrag(event.dataTransfer.types) || !onMoveAssets) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            setDropTargetFolderId(null)
            onMoveAssets(node.folder.id, readDraggedAssetIds(event.dataTransfer))
          }}
        >
          <button
            type="button"
            className={styles.expand}
            onClick={() => {
              if (hasChildren) {
                toggleFolder(node.folder.id)
              }
            }}
            aria-label={hasChildren ? (isExpanded ? 'collapse' : 'expand') : 'leaf'}
            disabled={!hasChildren}
          >
            {hasChildren ? <span className={isExpanded ? styles.chevronDown : styles.chevronRight} /> : null}
          </button>
          <button type="button" className={styles.iconButton} onClick={() => onSelect(node.folder.id)} aria-label={label}>
            <span className={isRoot ? styles.rootIcon : styles.folderIcon} aria-hidden="true" />
          </button>
          <button type="button" className={styles.label} onClick={() => onSelect(node.folder.id)}>
            <strong className={isRoot ? styles.labelRoot : undefined}>{label}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </button>
        </div>
        {hasChildren && isExpanded ? (
          <div className={styles.children}>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    )
  }

  return <div className={styles.tree}>{tree.map((node) => renderNode(node, 0))}</div>
}
