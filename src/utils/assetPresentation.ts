import type { Asset } from '../types/domain'

function makePlaceholder(label: string, accent: string, background: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#f7f2e9" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" rx="44" fill="url(#g)" />
      <circle cx="176" cy="162" r="118" fill="${accent}" fill-opacity="0.18" />
      <circle cx="1008" cy="740" r="152" fill="#1f6feb" fill-opacity="0.12" />
      <text x="96" y="734" fill="#201d19" font-size="96" font-family="Microsoft YaHei, Segoe UI, sans-serif" font-weight="700">${label}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function getAssetCardArtwork(asset: Asset) {
  if (asset.thumbnail) {
    return asset.thumbnail
  }

  switch (asset.previewMode) {
    case 'pdf':
      return makePlaceholder('PDF', '#d16a29', '#f6e7d2')
    case 'video':
      return makePlaceholder('VIDEO', '#1f6feb', '#e8eefb')
    case 'three_d_thumbnail':
      if (asset.format === 'BIP' || asset.format === 'KSP') {
        return makePlaceholder(asset.format, '#2b8a5c', '#e6f3ea')
      }
      return makePlaceholder('3D', '#2b8a5c', '#e6f3ea')
    default:
      return makePlaceholder(asset.format || 'FILE', '#5b6d7a', '#ece7de')
  }
}
