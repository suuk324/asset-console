import type { LanFileItem } from '../types'

export function FileRow({
  item,
  onPress,
  showParentPath = false,
}: {
  item: LanFileItem
  onPress: () => void
  showParentPath?: boolean
}) {
  return (
    <button className="mfile-row" type="button" onClick={onPress}>
      <span className={`mfile-row__glyph mfile-row__glyph--${item.kind}`}>
        {item.kind === 'dir' ? 'DIR' : fileBadge(item.name)}
      </span>
      <span className="mfile-row__body">
        <strong className="mfile-row__name">{item.name}</strong>
        <span className="mfile-row__meta">
          {item.kind === 'dir' ? '文件夹' : formatFileSize(item.size)}
          <span>·</span>
          <time dateTime={item.modifiedAt}>{formatDate(item.modifiedAt)}</time>
        </span>
        {showParentPath ? <span className="mfile-row__path">{parentPathOf(item.relativePath) || '/'}</span> : null}
      </span>
      <span className="mfile-row__tail">
        {item.kind === 'file' && item.previewable ? <span className="mfile-row__preview">预览</span> : null}
        <span className="mfile-row__chevron">›</span>
      </span>
    </button>
  )
}

function fileBadge(name: string) {
  const extension = name.split('.').pop()?.slice(0, 3).toUpperCase()
  return extension && extension !== name.toUpperCase() ? extension : 'FILE'
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

function formatDate(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function parentPathOf(path: string) {
  const segments = path.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}
