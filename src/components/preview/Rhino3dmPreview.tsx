import { useEffect, useRef, useState } from 'react'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import { resolveEffectiveTheme } from '../../utils/theme'
import styles from './Rhino3dmPreview.module.css'

interface Rhino3dmPreviewProps {
  src: string
}

export function Rhino3dmPreview({ src }: Rhino3dmPreviewProps) {
  const language = useAssetConsoleStore((state) => state.settings.language)
  const appTheme = useAssetConsoleStore((state) => state.settings.theme)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const effectiveTheme = resolveEffectiveTheme(appTheme)

  const loadingText = language === 'zh-CN' ? '正在加载 3DM 预览…' : 'Loading 3DM preview...'
  const errorText = language === 'zh-CN' ? '这个 3DM 文件暂时无法在软件内渲染。' : 'Unable to render this 3DM file.'
  const hintText = language === 'zh-CN' ? '按住拖动旋转，滚轮缩放' : 'Drag to orbit, scroll to zoom'

  useEffect(() => {
    const host = hostRef.current
    if (!host || !src) {
      return
    }

    let disposed = false
    let cleanup: (() => void) | null = null

    setStatus('loading')

    void import('./Rhino3dmRuntime')
      .then(({ mountRhino3dmRuntime }) => {
        if (disposed) {
          return
        }

        cleanup = mountRhino3dmRuntime(
          host,
          src,
          {
            onReady: () => setStatus('ready'),
            onError: () => setStatus('error'),
          },
          effectiveTheme,
        )
      })
      .catch(() => {
        if (!disposed) {
          setStatus('error')
        }
      })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [effectiveTheme, src])

  return (
    <div className={styles.previewShell}>
      <div ref={hostRef} className={styles.viewport} />
      {status !== 'ready' ? <div className={styles.overlay}>{status === 'loading' ? loadingText : errorText}</div> : null}
      <div className={styles.hint}>{hintText}</div>
    </div>
  )
}
