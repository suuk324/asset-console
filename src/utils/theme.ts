import type { AppTheme } from '../types/domain'

export type EffectiveTheme = 'light' | 'dark'

const THEME_QUERY = '(prefers-color-scheme: dark)'

function systemPrefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(THEME_QUERY).matches
    : false
}

export function resolveEffectiveTheme(theme: AppTheme): EffectiveTheme {
  if (theme === 'system') {
    return systemPrefersDark() ? 'dark' : 'light'
  }

  return theme
}

export function applyDocumentTheme(theme: AppTheme) {
  if (typeof document === 'undefined') {
    return 'light' as EffectiveTheme
  }

  const effectiveTheme = resolveEffectiveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = effectiveTheme
  root.dataset.themePreference = theme
  root.style.colorScheme = effectiveTheme
  return effectiveTheme
}

export function subscribeToSystemThemeChange(listener: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia(THEME_QUERY)
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }

  const legacyMediaQuery = mediaQuery as MediaQueryList & {
    addListener?: (callback: (event: MediaQueryListEvent) => void) => void
    removeListener?: (callback: (event: MediaQueryListEvent) => void) => void
  }

  legacyMediaQuery.addListener?.(listener as (event: MediaQueryListEvent) => void)
  return () => legacyMediaQuery.removeListener?.(listener as (event: MediaQueryListEvent) => void)
}
