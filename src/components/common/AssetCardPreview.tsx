import { useEffect, useRef, useState } from 'react'
import type { Asset } from '../../types/domain'
import { getAssetCardArtwork } from '../../utils/assetPresentation'

interface AssetCardPreviewProps {
  asset: Asset
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'auto' | 'sync'
}

const videoPosterCache = new Map<string, string>()

function resolveVideoPosterKey(asset: Asset) {
  return asset.fingerprint || asset.id || asset.managedPath
}

export function AssetCardPreview({
  asset,
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
}: AssetCardPreviewProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const cacheKey = resolveVideoPosterKey(asset)
  const cachedPoster = asset.previewMode === 'video' ? videoPosterCache.get(cacheKey) ?? null : null
  const [shouldLoadVideoPoster, setShouldLoadVideoPoster] = useState(
    asset.previewMode !== 'video' || Boolean(cachedPoster),
  )
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(cachedPoster)

  useEffect(() => {
    if (asset.previewMode !== 'video' || !asset.previewUrl || !shouldLoadVideoPoster || videoPosterUrl) {
      return
    }

    let cancelled = false
    const video = document.createElement('video')
    video.src = asset.previewUrl
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    const capturePoster = () => {
      if (cancelled || video.videoWidth === 0 || video.videoHeight === 0) {
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const posterUrl = canvas.toDataURL('image/jpeg', 0.82)
        videoPosterCache.set(cacheKey, posterUrl)
        if (!cancelled) {
          setVideoPosterUrl(posterUrl)
        }
      } catch {
        // Keep the stable fallback artwork when poster extraction is unavailable.
      }
    }

    const handleLoadedData = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        capturePoster()
      }
    }

    const handleSeeked = () => capturePoster()
    const handleLoadedMetadata = () => {
      if (cancelled) {
        return
      }

      if (video.duration && Number.isFinite(video.duration) && video.duration > 0.12) {
        try {
          video.currentTime = Math.min(0.12, Math.max(video.duration * 0.05, 0.04))
          return
        } catch {
          // Fall back to the current frame if seeking is not available.
        }
      }

      capturePoster()
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('seeked', handleSeeked)
    video.load()

    return () => {
      cancelled = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('seeked', handleSeeked)
    }
  }, [asset.previewMode, asset.previewUrl, cacheKey, shouldLoadVideoPoster, videoPosterUrl])

  useEffect(() => {
    if (asset.previewMode !== 'video' || shouldLoadVideoPoster) {
      return
    }

    const target = containerRef.current
    if (!target || typeof IntersectionObserver === 'undefined') {
      window.setTimeout(() => setShouldLoadVideoPoster(true), 0)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadVideoPoster(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '240px',
      },
    )
    observer.observe(target)

    return () => observer.disconnect()
  }, [asset.previewMode, shouldLoadVideoPoster])

  const src =
    asset.previewMode === 'video' ? videoPosterUrl ?? getAssetCardArtwork(asset) : asset.thumbnail ?? getAssetCardArtwork(asset)

  return (
    <span ref={containerRef}>
      <img src={src} alt={alt} className={className} loading={loading} decoding={decoding} />
    </span>
  )
}
