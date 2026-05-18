import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'

import type { LanStatusData, ToastTone } from './types'

export type MobileAppContextValue = {
  status: LanStatusData | null
  statusLoading: boolean
  statusError: string | null
  sessionAuthed: boolean
  refreshStatus: () => Promise<LanStatusData | null>
  pushToast: (text: string, tone?: ToastTone) => void
  forceLogout: (message?: string) => void
}

export const MobileAppContext = createContext<MobileAppContextValue | null>(null)

export function useMobileApp() {
  const context = useContext(MobileAppContext)
  if (!context) {
    throw new Error('useMobileApp must be used inside the mobile app provider.')
  }
  return context
}

export function useRequireFreshAuth() {
  const navigate = useNavigate()
  const { forceLogout } = useMobileApp()

  return (message = '连接已失效，请重新登录') => {
    forceLogout(message)
    navigate('/', { replace: true })
  }
}
