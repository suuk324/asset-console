import type {
  ApiFailure,
  ApiSuccess,
  LanAuthData,
  LanFileItem,
  LanFilesData,
  LanPreviewData,
  LanRenameData,
  LanSearchData,
  LanStatusData,
  LanUploadData,
} from '../types'

export class LanPanelApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'LanPanelApiError'
    this.code = code
    this.status = status
  }
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure
  if (!response.ok || !payload.ok) {
    const error = 'error' in payload ? payload.error : { code: 'INTERNAL_ERROR', message: '请求失败' }
    throw new LanPanelApiError(error.code, error.message, response.status)
  }
  return payload.data
}

async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  return parseApiResponse<T>(response)
}

export function getStatus() {
  return apiJson<LanStatusData>('/api/status')
}

export function authWithCode(code: string) {
  return apiJson<LanAuthData>('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export function listFiles(path: string) {
  const query = new URLSearchParams()
  query.set('path', path)
  return apiJson<LanFilesData>(`/api/files?${query.toString()}`)
}

export function searchFiles(queryText: string) {
  const query = new URLSearchParams()
  query.set('q', queryText)
  return apiJson<LanSearchData>(`/api/search?${query.toString()}`)
}

export function previewFile(path: string) {
  const query = new URLSearchParams()
  query.set('path', path)
  return apiJson<LanPreviewData>(`/api/preview?${query.toString()}`)
}

export function renameEntry(path: string, newName: string) {
  return apiJson<LanRenameData>('/api/rename', {
    method: 'POST',
    body: JSON.stringify({ path, newName }),
  })
}

export async function loadFileDetail(path: string): Promise<LanFileItem> {
  const parentPath = parentOf(path)
  const listing = await listFiles(parentPath)
  const match = listing.items.find((item) => item.relativePath === path)
  if (!match || match.kind !== 'file') {
    throw new LanPanelApiError('NOT_FOUND', '文件不存在或无法读取', 404)
  }
  return match
}

export function uploadFile(
  path: string,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<LanUploadData> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('path', path)
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.withCredentials = true
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return
      }
      onProgress?.(event.loaded / event.total)
    }

    xhr.onerror = () => {
      reject(new LanPanelApiError('INTERNAL_ERROR', '上传失败，请检查连接状态', 0))
    }

    xhr.onload = () => {
      const payload = xhr.response as ApiSuccess<LanUploadData> | ApiFailure | null
      if (xhr.status >= 200 && xhr.status < 300 && payload && 'ok' in payload && payload.ok) {
        resolve(payload.data)
        return
      }

      const error = payload && 'error' in payload ? payload.error : { code: 'INTERNAL_ERROR', message: '上传失败' }
      reject(new LanPanelApiError(error.code, error.message, xhr.status))
    }

    xhr.send(formData)
  })
}

export async function downloadFile(
  path: string,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const query = new URLSearchParams()
  query.set('path', path)
  const response = await fetch(`/api/download?${query.toString()}`, {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    await parseApiResponse<never>(response)
    throw new LanPanelApiError('INTERNAL_ERROR', '下载失败', response.status)
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  const filename = parseFileName(response.headers.get('content-disposition')) ?? fileNameOf(path)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new LanPanelApiError('INTERNAL_ERROR', '下载流不可用', response.status)
  }

  const chunks: BlobPart[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (value) {
      chunks.push(new Uint8Array(value))
      received += value.byteLength
      if (contentLength > 0) {
        onProgress?.(received / contentLength)
      }
    }
  }

  const blob = new Blob(chunks, {
    type: response.headers.get('content-type') ?? 'application/octet-stream',
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.URL.revokeObjectURL(url)
  onProgress?.(1)
  return filename
}

export function describeApiError(error: unknown, fallback = '操作失败'): string {
  if (!(error instanceof LanPanelApiError)) {
    return fallback
  }

  switch (error.code) {
    case 'UNAUTHORIZED':
      return '连接已失效，请重新登录'
    case 'INVALID_CODE':
      return '连接码错误或已失效'
    case 'NAME_CONFLICT':
      return '存在同名文件，未覆盖'
    case 'INVALID_NAME':
      return '名称不合法'
    case 'FILE_TOO_LARGE':
      return '上传文件超过 200MB 限制'
    case 'INVALID_UPLOAD':
      return '上传请求不合法'
    case 'NOT_FOUND':
      return '目标文件不存在'
    case 'NOT_A_FILE':
      return '目标不是文件'
    case 'NOT_A_DIRECTORY':
      return '目标不是文件夹'
    case 'PATH_FORBIDDEN':
      return '请求路径不被允许'
    default:
      return error.message || fallback
  }
}

export function parentOf(path: string): string {
  if (!path) {
    return ''
  }
  const segments = path.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

export function fileNameOf(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function parseFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i)
  return plainMatch?.[1] ?? null
}
