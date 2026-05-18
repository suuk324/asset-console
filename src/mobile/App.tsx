import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { describeApiError, getStatus } from './api/client'
import { ToastViewport } from './components/ToastViewport'
import { MobileAppContext, type MobileAppContextValue, useMobileApp } from './mobileAppContext'
import { BrowserPage } from './pages/BrowserPage'
import { FileDetailPage } from './pages/FileDetailPage'
import { LoginPage } from './pages/LoginPage'
import type { LanStatusData, ToastMessage, ToastTone } from './types'

export function App() {
  const [status, setStatus] = useState<LanStatusData | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [sessionAuthed, setSessionAuthed] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  async function refreshStatus() {
    setStatusLoading(true)
    try {
      const nextStatus = await getStatus()
      setStatus(nextStatus)
      setSessionAuthed(nextStatus.sessionAuthed)
      setStatusError(null)
      return nextStatus
    } catch (error) {
      const message = describeApiError(error, '无法连接到桌面端服务')
      setStatusError(message)
      return null
    } finally {
      setStatusLoading(false)
    }
  }

  function pushToast(text: string, tone: ToastTone = 'info') {
    const id = Date.now() + Math.floor(Math.random() * 10_000)
    setToasts((current) => [...current, { id, text, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 2600)
  }

  function forceLogout(message?: string) {
    setSessionAuthed(false)
    if (message) {
      pushToast(message, 'error')
    }
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const nextStatus = await getStatus()
        if (cancelled) {
          return
        }
        setStatus(nextStatus)
        setSessionAuthed(nextStatus.sessionAuthed)
        setStatusError(null)
      } catch (error) {
        if (cancelled) {
          return
        }
        const message = describeApiError(error, '无法连接到桌面端服务')
        setStatusError(message)
      } finally {
        if (!cancelled) {
          setStatusLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (!status && statusLoading) {
    return <BootScreen title="正在连接桌面端服务" detail="正在读取局域网页面板状态..." />
  }

  if (!status && statusError) {
    return (
      <BootScreen
        title="无法连接局域网页面板"
        detail={statusError}
        action={
          <button className="mbutton mbutton--primary" type="button" onClick={() => void refreshStatus()}>
            重试连接
          </button>
        }
      />
    )
  }

  const contextValue: MobileAppContextValue = {
    status,
    statusLoading,
    statusError,
    sessionAuthed,
    refreshStatus,
    pushToast,
    forceLogout,
  }

  return (
    <MobileAppContext.Provider value={contextValue}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route
            path="/browser"
            element={
              <RequireAuth>
                <BrowserPage />
              </RequireAuth>
            }
          />
          <Route
            path="/file"
            element={
              <RequireAuth>
                <FileDetailPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate replace to={sessionAuthed ? '/browser' : '/'} />} />
        </Routes>
      </HashRouter>
      <ToastViewport items={toasts} />
    </MobileAppContext.Provider>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { sessionAuthed } = useMobileApp()
  if (!sessionAuthed) {
    return <Navigate replace to="/" />
  }
  return children
}

function BootScreen({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="mboot">
      <section className="mboot__panel">
        <p className="mboot__eyebrow">FluxMint LAN Panel</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        {action ? <div className="mboot__action">{action}</div> : null}
      </section>
    </div>
  )
}
