import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import type { Asset } from '../types/domain'

const MAX_WEB_DRAG_FILE_BYTES = 32 * 1024 * 1024

function toFileUri(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '')
  return encodeURI(`file:///${normalized}`)
}

function normalizeMimeType(asset: Asset) {
  const format = asset.format.toLowerCase()

  switch (asset.kind) {
    case 'image':
      if (format === 'jpg') {
        return 'image/jpeg'
      }
      if (format === 'svg') {
        return 'image/svg+xml'
      }
      return `image/${format}`
    case 'pdf':
      return 'application/pdf'
    case 'video':
      return format ? `video/${format}` : 'video/*'
    case 'three_d':
      if (format === '3dm') {
        return 'model/vnd.rhino'
      }
      if (format === 'obj') {
        return 'model/obj'
      }
      if (format === 'stl') {
        return 'model/stl'
      }
      if (format === 'glb') {
        return 'model/gltf-binary'
      }
      if (format === 'gltf') {
        return 'model/gltf+json'
      }
      return 'application/octet-stream'
    default:
      return 'application/octet-stream'
  }
}

function createDragImage(title: string, subtitle: string) {
  if (typeof document === 'undefined') {
    return null
  }

  const ghost = document.createElement('div')
  ghost.style.position = 'fixed'
  ghost.style.left = '-10000px'
  ghost.style.top = '-10000px'
  ghost.style.padding = '12px 14px'
  ghost.style.borderRadius = '16px'
  ghost.style.background = 'rgba(21, 27, 35, 0.94)'
  ghost.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.28)'
  ghost.style.color = '#f6f3ee'
  ghost.style.fontFamily = '"Segoe UI", "Microsoft YaHei", sans-serif'
  ghost.style.minWidth = '220px'
  ghost.style.maxWidth = '320px'
  ghost.style.pointerEvents = 'none'

  const titleNode = document.createElement('strong')
  titleNode.textContent = title
  titleNode.style.display = 'block'
  titleNode.style.fontSize = '13px'
  titleNode.style.lineHeight = '1.4'

  const subtitleNode = document.createElement('span')
  subtitleNode.textContent = subtitle
  subtitleNode.style.display = 'block'
  subtitleNode.style.marginTop = '4px'
  subtitleNode.style.fontSize = '11px'
  subtitleNode.style.lineHeight = '1.4'
  subtitleNode.style.color = 'rgba(246, 243, 238, 0.74)'

  ghost.append(titleNode, subtitleNode)
  document.body.appendChild(ghost)

  return ghost
}

function localAssetUrl(asset: Asset) {
  return asset.previewUrl ?? convertFileSrc(asset.managedPath)
}

function addDragFile(dataTransfer: DataTransfer, dragFile: File | null) {
  if (!dragFile) {
    return false
  }

  try {
    dataTransfer.items.add(dragFile)
    return true
  } catch {
    return false
  }
}

export async function prepareBrowserDragFile(asset: Asset) {
  if (!isTauri()) {
    return null
  }

  if (!['image', 'pdf', 'video'].includes(asset.kind)) {
    return null
  }

  if (asset.meta.fileSizeBytes > MAX_WEB_DRAG_FILE_BYTES) {
    return null
  }

  try {
    const response = await fetch(localAssetUrl(asset))
    if (!response.ok) {
      return null
    }
    const blob = await response.blob()
    return new File([blob], asset.name, {
      type: normalizeMimeType(asset),
      lastModified: Date.now(),
    })
  } catch {
    return null
  }
}

export function populateExternalAssetDragData(
  dataTransfer: DataTransfer,
  assets: Asset[],
  options?: {
    browserDragFile?: File | null
  },
) {
  if (assets.length === 0) {
    return
  }

  const paths = assets.map((asset) => asset.managedPath)
  const uris = assets.map((asset) => toFileUri(asset.managedPath))
  const primaryAsset = assets[0]
  const title = assets.length === 1 ? primaryAsset.name : `${assets.length} files`
  const subtitle =
    assets.length === 1 ? primaryAsset.relativePath : paths.join('\n')

  dataTransfer.setData('text/plain', paths.join('\n'))
  dataTransfer.setData('text/uri-list', uris.join('\r\n'))
  dataTransfer.setData(
    'text/html',
    uris.map((uri, index) => `<a href="${uri}">${assets[index]?.name ?? uri}</a>`).join('<br />'),
  )
  dataTransfer.setData(
    'application/x-fluxmint-assets',
    JSON.stringify(
      assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        path: asset.managedPath,
      })),
    ),
  )

  if (assets.length === 1) {
    if (!isTauri()) {
      dataTransfer.setData(
        'DownloadURL',
        `${normalizeMimeType(primaryAsset)}:${primaryAsset.name}:${toFileUri(primaryAsset.managedPath)}`,
      )
    }
    addDragFile(dataTransfer, options?.browserDragFile ?? null)
  }

  const ghost = createDragImage(title, subtitle)
  if (ghost) {
    dataTransfer.setDragImage(ghost, 18, 18)
    window.setTimeout(() => ghost.remove(), 0)
  }
}
