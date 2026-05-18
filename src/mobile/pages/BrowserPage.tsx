import { startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { describeApiError, LanPanelApiError, listFiles, searchFiles, uploadFile } from '../api/client'
import { FileRow } from '../components/FileRow'
import { LinearProgress } from '../components/LinearProgress'
import { useMobileApp, useRequireFreshAuth } from '../mobileAppContext'
import type { LanFileItem, LanFilesData, LanSearchData } from '../types'

type DirectoryState = {
  requestKey: string
  data: LanFilesData | null
  error: string | null
}

type SearchState = {
  query: string
  data: LanSearchData | null
  error: string | null
}

export function BrowserPage() {
  const navigate = useNavigate()
  const forceReauth = useRequireFreshAuth()
  const { pushToast, status } = useMobileApp()
  const [searchParams] = useSearchParams()
  const currentPath = searchParams.get('path') ?? ''
  const [directoryState, setDirectoryState] = useState<DirectoryState>({
    requestKey: '',
    data: null,
    error: null,
  })
  const [searchInput, setSearchInput] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    data: null,
    error: null,
  })
  const [reloadTick, setReloadTick] = useState(0)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const deferredSearch = useDeferredValue(searchInput)
  const directoryRequestKey = `${reloadTick}:${currentPath}`
  const queryText = deferredSearch.trim()
  const handleUnauthorizedInEffect = useEffectEvent(() => {
    forceReauth()
  })

  useEffect(() => {
    let active = true

    void listFiles(currentPath)
      .then((data) => {
        if (!active) {
          return
        }
        setDirectoryState({
          requestKey: directoryRequestKey,
          data,
          error: null,
        })
      })
      .catch((error) => {
        if (!active) {
          return
        }
        if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
          handleUnauthorizedInEffect()
          return
        }
        setDirectoryState({
          requestKey: directoryRequestKey,
          data: null,
          error: describeApiError(error, '目录加载失败'),
        })
      })

    return () => {
      active = false
    }
  }, [currentPath, directoryRequestKey])

  useEffect(() => {
    if (!queryText) {
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      void searchFiles(queryText)
        .then((data) => {
          if (!active) {
            return
          }
          setSearchState({
            query: queryText,
            data,
            error: null,
          })
        })
        .catch((error) => {
          if (!active) {
            return
          }
          if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
            handleUnauthorizedInEffect()
            return
          }
          setSearchState({
            query: queryText,
            data: null,
            error: describeApiError(error, '搜索失败'),
          })
        })
    }, 220)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [queryText])

  const directoryLoading = directoryState.requestKey !== directoryRequestKey
  const directoryData = directoryState.requestKey === directoryRequestKey ? directoryState.data : null
  const directoryError = directoryState.requestKey === directoryRequestKey ? directoryState.error : null
  const showingSearch = queryText.length > 0
  const searchResolved = searchState.query === queryText
  const searchLoading = showingSearch && !searchResolved
  const searchData = showingSearch && searchResolved ? searchState.data : null
  const searchError = showingSearch && searchResolved ? searchState.error : null
  const items = showingSearch ? searchData?.items ?? [] : directoryData?.items ?? []

  function goToPath(path: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    startTransition(() => {
      navigate(`/browser${query}`)
    })
  }

  function openItem(item: LanFileItem) {
    if (item.kind === 'dir') {
      goToPath(item.relativePath)
      return
    }
    startTransition(() => {
      navigate(`/file?path=${encodeURIComponent(item.relativePath)}`)
    })
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setUploadProgress(0)
    try {
      await uploadFile(currentPath, file, setUploadProgress)
      pushToast('上传成功', 'success')
      setReloadTick((value) => value + 1)
    } catch (error) {
      if (error instanceof LanPanelApiError && error.code === 'UNAUTHORIZED') {
        forceReauth()
        return
      }
      pushToast(describeApiError(error, '上传失败'), 'error')
    } finally {
      event.target.value = ''
      window.setTimeout(() => setUploadProgress(null), 240)
    }
  }

  return (
    <div className="mscreen mscreen--browser">
      <header className="mtoolbar">
        <div className="mtoolbar__row">
          <button
            className="mbutton mbutton--secondary"
            disabled={!directoryData?.parentPath && !currentPath}
            type="button"
            onClick={() => goToPath(directoryData?.parentPath ?? '')}
          >
            返回上一级
          </button>
          <button className="mbutton mbutton--primary" type="button" onClick={() => fileInputRef.current?.click()}>
            上传文件
          </button>
          <input ref={fileInputRef} className="mhidden-input" type="file" onChange={handleFileSelected} />
        </div>
        <label className="mfield mfield--toolbar">
          <span>搜索文件名</span>
          <input
            placeholder="输入关键词搜索"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <div className="mtoolbar__path">
          <strong>{status?.workspaceName ?? '工作目录'}</strong>
          <span>{currentPath ? `/${currentPath}` : '/'}</span>
        </div>
        {uploadProgress !== null ? <LinearProgress label="上传中" value={uploadProgress} /> : null}
      </header>

      <main className="mcontent">
        <section className="msection-card">
          <div className="msection-card__header">
            <div>
              <h2>{showingSearch ? '搜索结果' : '当前目录'}</h2>
              <p>
                {showingSearch
                  ? `${searchData?.items.length ?? 0} 个匹配项`
                  : currentPath
                    ? `路径：${currentPath}`
                    : '根目录'}
              </p>
            </div>
            <button className="mbutton mbutton--ghost" type="button" onClick={() => setReloadTick((value) => value + 1)}>
              刷新
            </button>
          </div>

          {directoryLoading && !showingSearch ? <p className="mstate-line">正在加载目录...</p> : null}
          {searchLoading ? <p className="mstate-line">正在搜索...</p> : null}
          {directoryError && !showingSearch ? <p className="mstate-line mstate-line--error">{directoryError}</p> : null}
          {searchError ? <p className="mstate-line mstate-line--error">{searchError}</p> : null}

          {!directoryLoading && !searchLoading && items.length === 0 ? (
            <div className="mempty-panel">
              <strong>{showingSearch ? '没有匹配结果' : '当前目录为空'}</strong>
              <p>
                {showingSearch
                  ? '换个关键词试试，或者清空搜索返回目录视图。'
                  : '可以从顶部按钮上传单个文件到当前目录。'}
              </p>
            </div>
          ) : (
            <div className="mfile-list">
              {items.map((item) => (
                <FileRow
                  key={`${item.kind}:${item.relativePath}`}
                  item={item}
                  onPress={() => openItem(item)}
                  showParentPath={showingSearch}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mfooter-strip">
        <span>{status?.serverEnabled ? '局域网页面板已连接' : '局域网页面板未启用'}</span>
        <span>{window.location.origin}</span>
      </footer>
    </div>
  )
}
