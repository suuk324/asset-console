import { useMemo } from 'react'
import type { Asset } from '../types/domain'
import { useAssetConsoleStore } from './useAssetConsoleStore'

function normalizeRelativeFolderPath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC')
}

function deriveParentFolderPath(relativePath: string) {
  const normalizedPath = normalizeRelativeFolderPath(relativePath)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

function assetBelongsToFolder(asset: Asset, folderId: string, folderRelativePath: string) {
  if (asset.folderId === folderId) {
    return true
  }

  const normalizedFolderPath = normalizeRelativeFolderPath(folderRelativePath)
  const normalizedAssetFolderPath = normalizeRelativeFolderPath(
    asset.relativeFolderPath || deriveParentFolderPath(asset.relativePath),
  )

  if (normalizedAssetFolderPath === normalizedFolderPath) {
    return true
  }

  return deriveParentFolderPath(asset.relativePath) === normalizedFolderPath
}

export interface DuplicateAssetGroup {
  id: string
  projectId: string
  fingerprint: string
  assets: Asset[]
}

export function groupDuplicateAssets(assets: Asset[], projectId: string | null = null) {
  const scopedAssets = projectId ? assets.filter((asset) => asset.projectId === projectId) : assets
  const groups = new Map<string, typeof scopedAssets>()

  for (const asset of scopedAssets) {
    if (!asset.fingerprint) {
      continue
    }
    const key = `${asset.projectId}:${asset.fingerprint}`
    const existing = groups.get(key) ?? []
    existing.push(asset)
    groups.set(key, existing)
  }

  return Array.from(groups.entries())
    .map(([key, duplicateAssets]) => ({
      id: key,
      projectId: duplicateAssets[0]?.projectId ?? '',
      fingerprint: duplicateAssets[0]?.fingerprint ?? '',
      assets: duplicateAssets.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    }))
    .filter((group) => group.assets.length > 1)
    .sort((left, right) => {
      const countDelta = right.assets.length - left.assets.length
      if (countDelta !== 0) {
        return countDelta
      }
      return left.assets[0]?.name.localeCompare(right.assets[0]?.name ?? '') ?? 0
    })
}

export function useSelectedProject() {
  const selectedProjectId = useAssetConsoleStore((state) => state.selectedProjectId)
  const projects = useAssetConsoleStore((state) => state.projects)

  return useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )
}

export function useSelectedFolder() {
  const selectedFolderId = useAssetConsoleStore((state) => state.selectedFolderId)
  const folders = useAssetConsoleStore((state) => state.folders)

  return useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  )
}

export function useSelectedAsset() {
  const selectedAssetId = useAssetConsoleStore((state) => state.selectedAssetId)
  const assets = useAssetConsoleStore((state) => state.assets)

  return useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )
}

export function useSelectedAssets() {
  const selectedAssetIds = useAssetConsoleStore((state) => state.selectedAssetIds)
  const assets = useAssetConsoleStore((state) => state.assets)

  return useMemo(() => {
    if (selectedAssetIds.length === 0) {
      return []
    }

    const selectedSet = new Set(selectedAssetIds)
    return assets.filter((asset) => selectedSet.has(asset.id))
  }, [assets, selectedAssetIds])
}

export function useDuplicateAssetGroups(projectId: string | null) {
  const assets = useAssetConsoleStore((state) => state.assets)

  return useMemo(() => groupDuplicateAssets(assets, projectId), [assets, projectId])
}

export function useVisibleProjectFolders(projectId: string | null) {
  const folders = useAssetConsoleStore((state) => state.folders)

  return useMemo(
    () =>
      folders
        .filter((folder) => (projectId ? folder.projectId === projectId : false))
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    [folders, projectId],
  )
}

export function useVisibleProjectAssets(projectId: string | null, folderId: string | null, query: string) {
  const assets = useAssetConsoleStore((state) => state.assets)
  const folders = useAssetConsoleStore((state) => state.folders)
  const projects = useAssetConsoleStore((state) => state.projects)
  const assetKindFilter = useAssetConsoleStore((state) => state.assetKindFilter)

  return useMemo(() => {
    if (!projectId) {
      return []
    }

    const lowered = query.trim().toLowerCase()
    const queryTerms = lowered.split(/\s+/).filter(Boolean)
    const projectAssets = assets.filter((asset) => asset.projectId === projectId)
    const selectedFolder = folderId
      ? folders.find((folder) => folder.id === folderId && folder.projectId === projectId) ?? null
      : null
    const projectById = new Map(projects.map((project) => [project.id, project]))

    const matchesTerm = (asset: (typeof assets)[number], term: string) => {
      const projectName = projectById.get(asset.projectId)?.name.toLowerCase() ?? ''
      return (
        asset.name.toLowerCase().includes(term) ||
        asset.relativePath.toLowerCase().includes(term) ||
        asset.relativeFolderPath.toLowerCase().includes(term) ||
        asset.format.toLowerCase().includes(term) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(term)) ||
        asset.lastModifiedAt.toLowerCase().includes(term) ||
        projectName.includes(term)
      )
    }

    const searchScore = (asset: (typeof assets)[number]) => {
      if (queryTerms.length === 0) {
        return 0
      }

      const projectName = projectById.get(asset.projectId)?.name.toLowerCase() ?? ''
      const assetName = asset.name.toLowerCase()
      const relativePath = asset.relativePath.toLowerCase()
      const relativeFolderPath = asset.relativeFolderPath.toLowerCase()
      const format = asset.format.toLowerCase()
      const tags = asset.tags.map((tag) => tag.toLowerCase())

      return queryTerms.reduce((score, term) => {
        if (assetName === term) {
          return score + 120
        }
        if (assetName.startsWith(term)) {
          return score + 92
        }
        if (assetName.includes(term)) {
          return score + 72
        }
        if (relativePath.includes(term)) {
          return score + 52
        }
        if (relativeFolderPath.includes(term)) {
          return score + 44
        }
        if (tags.some((tag) => tag.includes(term))) {
          return score + 36
        }
        if (projectName.includes(term)) {
          return score + 24
        }
        if (format.includes(term)) {
          return score + 18
        }
        if (asset.lastModifiedAt.toLowerCase().includes(term)) {
          return score + 8
        }
        return score
      }, 0)
    }

    const filtered = projectAssets.filter((asset) => {
      if (assetKindFilter !== 'all' && asset.kind !== assetKindFilter) {
        return false
      }
      if (selectedFolder && selectedFolder.relativePath) {
        if (!assetBelongsToFolder(asset, selectedFolder.id, selectedFolder.relativePath)) {
          return false
        }
      }
      if (!lowered) {
        return true
      }
      return queryTerms.every((term) => matchesTerm(asset, term))
    })

    if (!lowered) {
      return filtered.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    }

    return filtered.sort((left, right) => {
      const scoreDelta = searchScore(right) - searchScore(left)
      if (scoreDelta !== 0) {
        return scoreDelta
      }
      const nameDelta = left.name.localeCompare(right.name)
      if (nameDelta !== 0) {
        return nameDelta
      }
      return left.relativePath.localeCompare(right.relativePath)
    })
  }, [assetKindFilter, assets, folderId, folders, projectId, projects, query])
}
