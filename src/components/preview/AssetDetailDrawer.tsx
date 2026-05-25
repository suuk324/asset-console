import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { resolveNativePreview } from '../../adapters/desktopBridge'
import { t } from '../../i18n/translate'
import { useSelectedAsset, useSelectedAssets, useSelectedProject } from '../../store/selectors'
import { useAssetConsoleStore } from '../../store/useAssetConsoleStore'
import type { Asset, SupportedLanguage } from '../../types/domain'
import { getAssetCardArtwork } from '../../utils/assetPresentation'
import { ExternalAssetDragHandle } from '../common/ExternalAssetDragHandle'
import styles from './AssetDetailDrawer.module.css'

const Rhino3dmPreview = lazy(() =>
  import('./Rhino3dmPreview').then((module) => ({ default: module.Rhino3dmPreview })),
)

interface AssetDetailDrawerProps {
  collapsed: boolean
  onToggle: () => void
}

function ImagePreviewContent({ asset }: { asset: Asset }) {
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading')

  return (
    <div className={styles.imagePreview}>
      <img
        src={state === 'fallback' ? getAssetCardArtwork(asset) : asset.previewUrl ?? getAssetCardArtwork(asset)}
        alt={asset.name}
        onLoad={() => setState('ready')}
        onError={() => setState('fallback')}
      />
      {state === 'fallback' ? <div className={styles.overlayNote}>Using a fallback artwork card for this file.</div> : null}
    </div>
  )
}

function PdfPreviewContent({ asset, language }: { asset: Asset; language: SupportedLanguage }) {
  const [loaded, setLoaded] = useState(false)

  if (!asset.previewUrl) {
    return <div className={styles.unsupported}>{t(language, 'noPreview')}</div>
  }

  return (
    <div className={styles.pdfFrame}>
      {!loaded ? <div className={styles.overlayNote}>{language === 'zh-CN' ? '正在加载 PDF 预览...' : 'Loading PDF preview...'}</div> : null}
      <iframe title={asset.name} src={asset.previewUrl} onLoad={() => setLoaded(true)} />
    </div>
  )
}

function VideoPreviewContent({ asset, language }: { asset: Asset; language: SupportedLanguage }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  if (!asset.previewUrl || state === 'error') {
    return (
      <div className={styles.imagePreview}>
        <img src={getAssetCardArtwork(asset)} alt={asset.name} />
        <div className={styles.overlayNote}>
          {language === 'zh-CN'
            ? '当前视频无法在软件内解码，已回退为封面卡片。'
            : 'This video could not be decoded in-app, so a fallback artwork card is shown.'}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.videoFrame}>
      {state === 'loading' ? <div className={styles.overlayNote}>{language === 'zh-CN' ? '正在缓冲视频预览...' : 'Buffering video preview...'}</div> : null}
      <video
        src={asset.previewUrl}
        controls
        playsInline
        preload="metadata"
        onLoadedData={() => setState('ready')}
        onError={() => setState('error')}
      />
    </div>
  )
}

function KeyshotPreviewContent({ asset, language }: { asset: Asset; language: SupportedLanguage }) {
  const [nativePreviewUrl, setNativePreviewUrl] = useState<string | null>(null)
  const [nativePreviewReady, setNativePreviewReady] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    void resolveNativePreview(asset.managedPath, asset.fingerprint, asset.format)
      .then((previewUrl) => {
        if (cancelled) {
          return
        }

        if (previewUrl) {
          setNativePreviewUrl(previewUrl)
          setNativePreviewReady(true)
          return
        }

        setNativePreviewReady(false)
      })
      .catch(() => {
        if (!cancelled) {
          setNativePreviewReady(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [asset.fingerprint, asset.format, asset.managedPath])

  const overlayLabel =
    nativePreviewReady === null
      ? language === 'zh-CN'
        ? '正在读取 KeyShot 原生缩略图...'
        : 'Loading KeyShot thumbnail...'
      : nativePreviewReady
        ? language === 'zh-CN'
          ? '已加载 KeyShot 原生缩略图'
          : 'Loaded a native KeyShot thumbnail'
        : language === 'zh-CN'
          ? '当前系统无法提取 KeyShot 缩略图，已回退为格式卡片。'
          : 'No native KeyShot thumbnail is available on this system, so a format card is shown.'

  return (
    <div className={styles.imagePreview}>
      <img src={nativePreviewUrl ?? getAssetCardArtwork(asset)} alt={asset.name} />
      <div className={styles.overlayNote}>{overlayLabel}</div>
    </div>
  )
}

function ModelFormatPreviewContent({ asset, language }: { asset: Asset; language: SupportedLanguage }) {
  return (
    <div className={styles.imagePreview}>
      <img src={getAssetCardArtwork(asset)} alt={asset.name} />
      <div className={styles.overlayNote}>
        {language === 'zh-CN'
          ? `${asset.format} 暂不支持实时预览，已切换为稳定格式卡片。`
          : `${asset.format} does not have a live in-app renderer yet, so a stable format card is shown.`}
      </div>
    </div>
  )
}

function PreviewContent({ asset, language }: { asset: Asset; language: SupportedLanguage }) {
  if (asset.previewMode === 'three_d_thumbnail' && asset.format === '3DM' && asset.previewUrl) {
    return (
      <Suspense fallback={<div className={styles.unsupported}>{language === 'zh-CN' ? '正在加载 3DM 预览...' : 'Loading 3DM preview...'}</div>}>
        <Rhino3dmPreview src={asset.previewUrl} />
      </Suspense>
    )
  }

  if (asset.previewMode === 'three_d_thumbnail' && (asset.format === 'BIP' || asset.format === 'KSP')) {
    return <KeyshotPreviewContent key={asset.id} asset={asset} language={language} />
  }

  if (asset.previewMode === 'image') {
    return <ImagePreviewContent key={asset.id} asset={asset} />
  }

  if (asset.previewMode === 'pdf') {
    return <PdfPreviewContent key={asset.id} asset={asset} language={language} />
  }

  if (asset.previewMode === 'video') {
    return <VideoPreviewContent key={asset.id} asset={asset} language={language} />
  }

  if (asset.previewMode === 'three_d_thumbnail') {
    return <ModelFormatPreviewContent key={asset.id} asset={asset} language={language} />
  }

  return <div className={styles.unsupported}>{t(language, 'noPreview')}</div>
}

function formatInspectorCopy(language: SupportedLanguage, asset: Asset | null) {
  if (!asset) {
    return language === 'zh-CN' ? '未选择文件' : 'No file selected'
  }

  return asset.format || (language === 'zh-CN' ? '文件' : 'File')
}

export function AssetDetailDrawer({ collapsed, onToggle }: AssetDetailDrawerProps) {
  const asset = useSelectedAsset()
  const selectedAssets = useSelectedAssets()
  const project = useSelectedProject()
  const [renameDraft, setRenameDraft] = useState<{ assetId: string | null; value: string }>({
    assetId: null,
    value: '',
  })
  const {
    settings,
    activePageContext,
    selectedAssetIds,
    renameAsset,
    openAsset,
    revealAsset,
  } = useAssetConsoleStore(
    useShallow((state) => ({
      settings: state.settings,
      activePageContext: state.activePageContext,
      selectedAssetIds: state.selectedAssetIds,
      renameAsset: state.renameAsset,
      openAsset: state.openAsset,
      revealAsset: state.revealAsset,
    })),
  )

  const language = settings.language
  const hasSelection = Boolean(asset && project)
  const emptyEyebrow =
    project && activePageContext === 'project'
      ? project.name
      : language === 'zh-CN'
        ? '未选择文件'
        : 'No file selected'
  const emptyHint =
    language === 'zh-CN'
      ? '在中间文件区选择一个文件后，这里会显示预览、路径、元数据和快捷操作。'
      : 'Select a file in the center workspace to inspect its preview, paths, metadata, and quick actions.'
  const dragOutTitle = language === 'zh-CN' ? '拖到外部软件' : t(language, 'dragOutToExternal')
  const dragOutHint = language === 'zh-CN' ? '拖到 Rhino、Blender、Figma、KeyShot 或桌面' : t(language, 'dragOutHint')
  const metadataItems = useMemo(() => {
    if (!asset) {
      return []
    }

    return [
      { label: language === 'zh-CN' ? '大小' : 'Size', value: asset.meta.fileSize },
      { label: language === 'zh-CN' ? '修改时间' : 'Modified', value: asset.lastModifiedAt },
      { label: language === 'zh-CN' ? '预览能力' : 'Preview', value: asset.previewMode },
      ...(asset.meta.dimensions ? [{ label: language === 'zh-CN' ? '尺寸' : 'Dimensions', value: asset.meta.dimensions }] : []),
      ...(asset.meta.duration ? [{ label: language === 'zh-CN' ? '时长' : 'Duration', value: asset.meta.duration }] : []),
      ...(asset.meta.pages ? [{ label: language === 'zh-CN' ? '页数' : 'Pages', value: String(asset.meta.pages) }] : []),
      ...(asset.meta.polygons ? [{ label: language === 'zh-CN' ? '面数' : 'Polygons', value: asset.meta.polygons }] : []),
      ...(asset.meta.software ? [{ label: language === 'zh-CN' ? '来源软件' : 'Software', value: asset.meta.software }] : []),
    ]
  }, [asset, language])

  const previewMetaItems = useMemo(() => {
    if (!asset) {
      return []
    }

    return [asset.format, asset.meta.fileSize]
  }, [asset])

  const dragAssets = useMemo(() => {
    if (!asset) {
      return []
    }

    return selectedAssetIds.includes(asset.id) && selectedAssets.length > 0 ? selectedAssets : [asset]
  }, [asset, selectedAssetIds, selectedAssets])

  if (collapsed) {
    return (
      <aside className={styles.drawerRail}>
        <button type="button" className={styles.railToggle} onClick={onToggle} title={language === 'zh-CN' ? '展开检查器' : 'Expand inspector'}>
          &lt;
        </button>
        <div className={styles.railPreview} title={asset?.name ?? formatInspectorCopy(language, null)}>
          {asset ? (
            asset.thumbnail || asset.previewUrl ? (
              <img src={asset.thumbnail ?? asset.previewUrl ?? getAssetCardArtwork(asset)} alt={asset.name} />
            ) : (
              <span>{asset.format}</span>
            )
          ) : (
            <span>--</span>
          )}
        </div>
        <span className={styles.railFormat}>{formatInspectorCopy(language, asset ?? null)}</span>
      </aside>
    )
  }

  const renameValue = asset && renameDraft.assetId === asset.id ? renameDraft.value : asset?.name ?? ''

  return (
    <aside className={styles.drawer}>
      <div className={styles.drawerHeader}>
        <div className={styles.drawerHeaderCopy}>
          <p className={styles.eyebrow}>{hasSelection && project ? project.name : emptyEyebrow}</p>
          <strong>{hasSelection && asset ? asset.name : language === 'zh-CN' ? '文件检查器' : 'File Inspector'}</strong>
          <span title={asset?.relativeFolderPath ?? ''}>
            {hasSelection && asset ? asset.relativeFolderPath || '/' : emptyHint}
          </span>
        </div>
        <button type="button" className={styles.headerToggle} onClick={onToggle} title={language === 'zh-CN' ? '折叠检查器' : 'Collapse inspector'}>
          &gt;
        </button>
      </div>

      {!hasSelection || !asset || !project ? (
        <section className={styles.emptyState}>
          <strong>{language === 'zh-CN' ? '检查器' : 'Inspector'}</strong>
          <p>{emptyHint}</p>
        </section>
      ) : (
        <>
          <section className={styles.previewCard}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                <p className={styles.eyebrow}>{language === 'zh-CN' ? '预览' : 'Preview'}</p>
                <span title={asset.relativePath}>{asset.relativePath}</span>
              </div>
              <span className={styles.badge}>{asset.format}</span>
            </div>

            <div className={styles.previewMetaStrip}>
              {previewMetaItems.map((item) => (
                <span key={item} className={styles.previewMetaChip} title={item}>
                  {item}
                </span>
              ))}
            </div>

            <PreviewContent asset={asset} language={language} />
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionInfo}>
                <p className={styles.eyebrow}>{language === 'zh-CN' ? '操作' : 'Actions'}</p>
                <strong>{language === 'zh-CN' ? '打开、拖出与重命名' : 'Open, drag out, and rename'}</strong>
              </div>
            </div>

            <div className={styles.dragOutDock}>
              <ExternalAssetDragHandle
                assets={dragAssets}
                language={language}
                title={dragOutTitle}
                hint={dragOutHint}
                className={styles.dragOutHandle}
                activeClassName={styles.dragOutHandleActive}
                noteClassName={styles.dragSupportNote}
              />
            </div>

            <div className={styles.buttonRow}>
              <button type="button" onClick={() => void openAsset(asset.id)}>
                {t(language, 'open')}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void revealAsset(asset.id)}>
                {t(language, 'reveal')}
              </button>
            </div>

            <div className={styles.renameRow}>
              <input
                value={renameValue}
                onChange={(event) => setRenameDraft({ assetId: asset.id, value: event.target.value })}
                placeholder={asset.name}
              />
              <button
                type="button"
                onClick={() => {
                  void renameAsset(asset.id, renameValue || asset.name)
                  setRenameDraft({
                    assetId: asset.id,
                    value: renameValue || asset.name,
                  })
                }}
              >
                {t(language, 'save')}
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionInfo}>
                <p className={styles.eyebrow}>{language === 'zh-CN' ? '文件信息' : 'File Info'}</p>
                <strong>{language === 'zh-CN' ? '位置与元数据' : 'Location and metadata'}</strong>
              </div>
            </div>

            <div className={styles.pathStack}>
              <div className={styles.pathBox}>
                <strong>{language === 'zh-CN' ? '项目内路径' : 'Project Path'}</strong>
                <p>{asset.relativePath}</p>
              </div>
              <div className={styles.pathBox}>
                <strong>{language === 'zh-CN' ? '磁盘位置' : 'Disk Location'}</strong>
                <p>{asset.managedPath}</p>
              </div>
            </div>

            <div className={styles.infoGrid}>
              {metadataItems.map((item) => (
                <div key={item.label} className={styles.infoCell}>
                  <span>{item.label}</span>
                  <strong title={item.value}>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          {asset.tags.length > 0 || asset.meta.notes ? (
            <section className={styles.panel}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionInfo}>
                  <p className={styles.eyebrow}>{language === 'zh-CN' ? '更多' : 'More'}</p>
                  <strong>{language === 'zh-CN' ? '标签与备注' : 'Tags and notes'}</strong>
                </div>
              </div>

              {asset.tags.length > 0 ? (
                <div className={styles.tags}>
                  {asset.tags.map((tag) => (
                    <span key={tag} className={styles.badge}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {asset.meta.notes ? <p className={styles.notes}>{asset.meta.notes}</p> : null}
            </section>
          ) : null}
        </>
      )}
    </aside>
  )
}
