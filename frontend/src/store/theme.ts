import { create } from 'zustand'
import type { Theme } from '@/types'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.add('light')
    root.classList.remove('dark')
  } else {
    root.classList.remove('light')
    root.classList.add('dark')
  }
  localStorage.setItem('cw-theme', theme)
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('cw-theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const initial = getInitialTheme()
applyTheme(initial)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  toggle: () => set((state) => {
    const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    return { theme: next }
  }),
  setTheme: (t) => set(() => {
    applyTheme(t)
    return { theme: t }
  }),
}))
