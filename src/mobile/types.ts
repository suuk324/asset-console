export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiFailure = {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type LanDeviceRecord = {
  id: string
  ip: string
  label: string
  firstSeenAt: string
  lastSeenAt: string
  online: boolean
}

export type LanStatusData = {
  serverEnabled: boolean
  workspaceName: string | null
  authMode: string
  hasCode: boolean
  addresses: string[]
  devices: LanDeviceRecord[]
  sessionAuthed: boolean
}

export type LanFileItem = {
  name: string
  relativePath: string
  kind: 'file' | 'dir'
  size: number | null
  modifiedAt: string
  previewable: boolean
}

export type LanFilesData = {
  currentPath: string
  parentPath: string | null
  items: LanFileItem[]
}

export type LanSearchData = {
  query: string
  items: LanFileItem[]
}

export type LanPreviewData =
  | {
      kind: 'url'
      previewUrl: string
      contentType: string
    }
  | {
      kind: 'text'
      content: string
      truncated: boolean
    }
  | {
      kind: 'too_large'
      message: string
    }
  | {
      kind: 'unsupported'
      message: string
    }

export type LanAuthData = {
  expiresAt: string
}

export type LanUploadData = {
  name: string
  relativePath: string
}

export type LanRenameData = {
  oldPath: string
  newPath: string
  name: string
}

export type ToastTone = 'info' | 'success' | 'error'

export type ToastMessage = {
  id: number
  text: string
  tone: ToastTone
}
