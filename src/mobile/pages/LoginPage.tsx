import { startTransition, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { authWithCode, describeApiError } from '../api/client'
import { useMobileApp } from '../mobileAppContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { refreshStatus, pushToast, sessionAuthed, status } = useMobileApp()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  if (sessionAuthed) {
    return <Navigate replace to="/browser" />
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextCode = code.trim()
    if (!nextCode) {
      setErrorText('请输入连接码')
      return
    }

    setSubmitting(true)
    setErrorText(null)
    try {
      await authWithCode(nextCode)
      await refreshStatus()
      pushToast('连接成功', 'success')
      startTransition(() => {
        navigate('/browser', { replace: true })
      })
    } catch (error) {
      const message = describeApiError(error, '连接失败')
      setErrorText(message)
      pushToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mscreen">
      <section className="mhero-card">
        <p className="mhero-card__eyebrow">FluxMint LAN Panel</p>
        <h1>连接你的工作目录</h1>
        <p className="mhero-card__lead">
          手机和电脑处于同一 Wi-Fi 后，输入桌面端显示的一次性连接码，即可访问当前工作目录。
        </p>
        <dl className="mstatus-grid">
          <div>
            <dt>当前目录</dt>
            <dd>{status?.workspaceName ?? '未选择'}</dd>
          </div>
          <div>
            <dt>当前连接</dt>
            <dd>{window.location.origin}</dd>
          </div>
          <div>
            <dt>设备数</dt>
            <dd>{status?.devices.length ?? 0}</dd>
          </div>
        </dl>
        <form className="mlogin-form" onSubmit={handleSubmit}>
          <label className="mfield">
            <span>连接码</span>
            <input
              autoComplete="one-time-code"
              enterKeyHint="done"
              inputMode="numeric"
              maxLength={8}
              placeholder="输入 6 位连接码"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          {errorText ? <p className="mform-error">{errorText}</p> : null}
          <button className="mbutton mbutton--primary" disabled={submitting} type="submit">
            {submitting ? '正在连接...' : '进入文件面板'}
          </button>
        </form>
      </section>
    </div>
  )
}
