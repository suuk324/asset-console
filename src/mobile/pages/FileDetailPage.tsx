import { startTransition, useEffect, useEffectEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  describeApiError,
  downloadFile,
  LanPanelApiError,
  loadFileDetail,
  parentOf,
  previewFile,
  renameEntry,
} from '../api/client'
import { LinearProgress } from '../components/LinearProgress'
import { useMobileApp, useRequireFreshAuth } from '../mobileAppContext'
import type { LanFileItem, LanPreviewData } from '../types'

type DetailState = {
  path: string
  fileItem: LanFileItem | null
  preview: LanPreviewData | null
  errorText: string | null
}

export function FileDetailPage() {
  const navigate = useNavigate()
  const forceReauth = useRequireFreshAuth()
  const { pushToast } = useMobileApp()
  const [searchParams] = useSearchParams()
  const relativePath = searchParams.get('path') ?? ''
  const [detailState, setDetailState] = useState<DetailState>({
    path: '',
    fileItem: null,
    preview: null,
    errorText: null,
  })
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const handleUnauthorizedInEffect = useEffectEvent(() => {
    forceReauth()
  })

  useEffect(() => {
    if (!relativePath) {
      navigate('/browser', { replace: true })
      return
    }

    let active = true

    void Promise.all([loadFileDetail(relativePath), previewFile(relativePath)])
      .then(([nextFile, nextPreview]) => {
        if (!active) {
          return
        }
        setDetailState({
          path: relativePath,
          fileItem: nextFile,
          preview: nextPreview,
          errorText: null,
        })
        setRenameValue(nextFile.name)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
          handleUnauthorizedInEffect()
          return
        }
        setDetailState({
          path: relativePath,
          fileItem: null,
          preview: null,
          errorText: describeApiError(error, '无法加载文件详情'),
        })
      })

    return () => {
      active = false
    }
  }, [navigate, relativePath])

  if (!relativePath) {
    return null
  }

  const loading = detailState.path !== relativePath
  const fileItem = detailState.path === relativePath ? detailState.fileItem : null
  const preview = detailState.path === relativePath ? detailState.preview : null
  const errorText = detailState.path === relativePath ? detailState.errorText : null

  function goBack() {
    const parentPath = parentOf(relativePath)
    const query = parentPath ? `?path=${encodeURIComponent(parentPath)}` : ''
    navigate(`/browser${query}`)
  }

  async function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = renameValue.trim()
    if (!nextName) {
      pushToast('名称不能为空', 'error')
      return
    }

    setRenameSubmitting(true)
    try {
      const renamed = await renameEntry(relativePath, nextName)
      pushToast('重命名成功', 'success')
      setRenameOpen(false)
      startTransition(() => {
        navigate(`/file?path=${encodeURIComponent(renamed.newPath)}`, { replace: true })
      })
    } catch (error) {
      if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
        forceReauth()
        return
      }
      pushToast(describeApiError(error, '重命名失败'), 'error')
    } finally {
      setRenameSubmitting(false)
    }
  }

  async function handleDownload() {
    setDownloadProgress(0)
    try {
      const filename = await downloadFile(relativePath, setDownloadProgress)
      pushToast(`已开始下载：${filename}`, 'success')
    } catch (error) {
      if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
        forceReauth()
        return
      }
      pushToast(describeApiError(error, '下载失败'), 'error')
    } finally {
      window.setTimeout(() => setDownloadProgress(null), 260)
    }
  }

  return (
    <div className="mscreen mscreen--detail">
      <header className="mtoolbar">
        <div className="mtoolbar__row">
          <button className="mbutton mbutton--secondary" type="button" onClick={goBack}>
            返回文件列表
          </button>
          <button className="mbutton mbutton--ghost" type="button" onClick={() => setRenameOpen(true)} disabled={!fileItem}>
            重命名
          </button>
        </div>
        {downloadProgress !== null ? <LinearProgress label="下载中" value={downloadProgress} /> : null}
      </header>

      <main className="mcontent">
        <section className="msection-card">
          {loading ? <p className="mstate-line">正在加载文件详情...</p> : null}
          {errorText ? <p className="mstate-line mstate-line--error">{errorText}</p> : null}
          {fileItem ? (
            <>
              <div className="mdetail-head">
                <div>
                  <p className="mdetail-head__eyebrow">文件详情</p>
                  <h1>{fileItem.name}</h1>
                  <p className="mdetail-head__path">/{fileItem.relativePath}</p>
                </div>
                <div className="mdetail-head__actions">
                  <button className="mbutton mbutton--primary" type="button" onClick={handleDownload}>
                    下载原文件
                  </button>
                </div>
              </div>

              <dl className="mdetail-metadata">
                <div>
                  <dt>文件大小</dt>
                  <dd>{formatFileSize(fileItem.size)}</dd>
                </div>
                <div>
                  <dt>修改时间</dt>
                  <dd>{formatDateTime(fileItem.modifiedAt)}</dd>
                </div>
                <div>
                  <dt>预览能力</dt>
                  <dd>{fileItem.previewable ? '支持' : '暂不支持'}</dd>
                </div>
              </dl>

              <section className="mpreview-card">
                <div className="mpreview-card__header">
                  <h2>预览</h2>
                </div>
                {renderPreview(preview)}
              </section>
            </>
          ) : null}
        </section>
      </main>

      {renameOpen && fileItem ? (
        <div className="mmodal-backdrop" role="presentation" onClick={() => !renameSubmitting && setRenameOpen(false)}>
          <div className="mmodal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="mmodal__header">
              <h2>重命名文件</h2>
              <button className="mbutton mbutton--ghost" type="button" onClick={() => setRenameOpen(false)} disabled={renameSubmitting}>
                关闭
              </button>
            </div>
            <form className="mmodal__body" onSubmit={handleRenameSubmit}>
              <label className="mfield">
                <span>新名称</span>
                <input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
              </label>
              <div className="mmodal__actions">
                <button className="mbutton mbutton--secondary" type="button" onClick={() => setRenameOpen(false)} disabled={renameSubmitting}>
                  取消
                </button>
                <button className="mbutton mbutton--primary" type="submit" disabled={renameSubmitting}>
                  {renameSubmitting ? '提交中...' : '确认重命名'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function renderPreview(preview: LanPreviewData | null) {
  if (!preview) {
    return <p className="mstate-line">正在加载预览...</p>
  }

  if (preview.kind === 'text') {
    return <pre className="mpreview-card__text">{preview.content}</pre>
  }

  if (preview.kind === 'url') {
    if (preview.contentType.includes('pdf')) {
      return (
        <div className="mpreview-card__frame-wrap">
          <iframe className="mpreview-card__frame" src={preview.previewUrl} title="PDF preview" />
        </div>
      )
    }

    return <img className="mpreview-card__image" src={preview.previewUrl} alt="文件预览" />
  }

  return <p className="mstate-line">{preview.message}</p>
}

function formatFileSize(size: number | null) {
  if (size === null) {
    return '未知大小'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
