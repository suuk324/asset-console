import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { isDesktopRuntime, startNativeFileDrag } from '../../adapters/desktopBridge'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import type { Asset, SupportedLanguage } from '../../types/domain'
import { populateExternalAssetDragData, prepareBrowserDragFile } from '../../utils/assetTransfer'

interface ExternalAssetDragHandleProps {
  assets: Asset[]
  language: SupportedLanguage
  title: string
  hint: string
  className: string
  activeClassName?: string
  noteClassName?: string
  compact?: boolean
}

export function ExternalAssetDragHandle({
  assets,
  language,
  title,
  hint,
  className,
  activeClassName,
  noteClassName,
  compact = false,
}: ExternalAssetDragHandleProps) {
  const showToast = useAssetConsoleStore((state) => state.showToast)
  const nativeDragSessionRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    managedPaths: string[]
    started: boolean
  } | null>(null)
  const [dragSupport, setDragSupport] = useState<{
    assetId: string | null
    file: File | null
    readiness: 'ready' | 'path_only'
  }>({
    assetId: null,
    file: null,
    readiness: 'path_only',
  })
  const [isDraggingOut, setIsDraggingOut] = useState(false)

  const browserPrimaryAsset = !isDesktopRuntime && assets.length === 1 ? assets[0] : null

  useEffect(() => {
    let cancelled = false

    if (!browserPrimaryAsset) {
      return
    }

    void prepareBrowserDragFile(browserPrimaryAsset)
      .then((dragFile) => {
        if (cancelled) {
          return
        }

        setDragSupport({
          assetId: browserPrimaryAsset.id,
          file: dragFile,
          readiness: dragFile ? 'ready' : 'path_only',
        })
      })
      .catch(() => {
        if (!cancelled) {
          setDragSupport({
            assetId: browserPrimaryAsset.id,
            file: null,
            readiness: 'path_only',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [browserPrimaryAsset])

  const browserDragFile = browserPrimaryAsset && dragSupport.assetId === browserPrimaryAsset.id ? dragSupport.file : null
  const dragReadinessCopy = isDesktopRuntime
    ? language === 'zh-CN'
      ? assets.length > 1
        ? `按住并拖动，可直接带出 ${assets.length} 个真实文件。`
        : '按住并拖到桌面或外部软件，系统会直接带出真实文件。'
      : assets.length > 1
        ? `Press and drag to carry out ${assets.length} real files directly.`
        : 'Press and drag to the desktop or an external app to carry out the real file directly.'
    : assets.length > 1
      ? language === 'zh-CN'
        ? '浏览器模式下将拖出路径列表。'
        : 'Browser mode will drag a path list.'
      : dragSupport.assetId === browserPrimaryAsset?.id && dragSupport.readiness === 'ready'
        ? language === 'zh-CN'
          ? '已同时准备文件路径和浏览器兼容拖拽数据。'
          : 'Both file-path and browser-friendly drag payloads are ready.'
        : language === 'zh-CN'
          ? '将以真实文件路径拖出，适合 Rhino、Blender、KeyShot 或桌面。'
          : 'The drag will use real file paths, which is best for Rhino, Blender, KeyShot, or the desktop.'

  const clearNativeDragSession = (pointerId?: number) => {
    const session = nativeDragSessionRef.current
    if (!session) {
      return
    }
    if (pointerId !== undefined && session.pointerId !== pointerId) {
      return
    }
    nativeDragSessionRef.current = null
  }

  const handleBrowserDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (assets.length === 0) {
      event.preventDefault()
      return
    }

    setIsDraggingOut(true)
    event.dataTransfer.effectAllowed = 'copy'
    populateExternalAssetDragData(event.dataTransfer, assets, {
      browserDragFile,
    })
  }

  const handleNativeDragPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDesktopRuntime || assets.length === 0 || event.button !== 0) {
      return
    }

    nativeDragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      managedPaths: assets.map((asset) => asset.managedPath),
      started: false,
    }
  }

  const handleNativeDragPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = nativeDragSessionRef.current
    if (!isDesktopRuntime || !session || session.pointerId !== event.pointerId || session.started) {
      return
    }

    const deltaX = event.clientX - session.startX
    const deltaY = event.clientY - session.startY
    if (Math.hypot(deltaX, deltaY) < 8) {
      return
    }

    session.started = true
    setIsDraggingOut(true)
    void startNativeFileDrag(session.managedPaths)
      .catch((error) => {
        console.error('Failed to start native file drag.', error)
        const fallbackMessage =
          language === 'zh-CN'
            ? '无法启动系统文件拖出。请确认文件仍存在，并在桌面版中重试。'
            : 'Unable to start the native file drag. Verify the files still exist and try again in the desktop app.'
        const message =
          error instanceof Error && error.message
            ? error.message
            : typeof error === 'string' && error.trim()
              ? error
              : fallbackMessage
        showToast(language === 'zh-CN' ? '拖出失败' : 'Drag out failed', message)
      })
      .finally(() => {
        clearNativeDragSession(event.pointerId)
        setIsDraggingOut(false)
      })
  }

  const resolvedClassName = isDraggingOut && activeClassName ? activeClassName : className

  return (
    <div
      className={resolvedClassName}
      draggable={!isDesktopRuntime}
      onDragStart={isDesktopRuntime ? undefined : handleBrowserDragStart}
      onDragEnd={isDesktopRuntime ? undefined : () => setIsDraggingOut(false)}
      onPointerDown={isDesktopRuntime ? handleNativeDragPointerDown : undefined}
      onPointerMove={isDesktopRuntime ? handleNativeDragPointerMove : undefined}
      onPointerUp={isDesktopRuntime ? (event) => clearNativeDragSession(event.pointerId) : undefined}
      onPointerCancel={isDesktopRuntime ? (event) => clearNativeDragSession(event.pointerId) : undefined}
      title={hint}
    >
      <strong>{title}</strong>
      {!compact ? <span>{hint}</span> : null}
      {!compact && noteClassName ? <em className={noteClassName}>{dragReadinessCopy}</em> : null}
    </div>
  )
}
