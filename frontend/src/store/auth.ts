import { create } from 'zustand'
import type { User } from '@/types'
import { authApi } from '@/api'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('access_token'),
  isLoading: false,

  login: async (email, password) => {
    const { access_token } = await authApi.login(email, password)
    localStorage.setItem('access_token', access_token)
    set({ token: access_token })
    const user = await authApi.me()
    set({ user })
  },

  loginWithGoogle: async (credential) => {
    const { access_token } = await authApi.googleLogin(credential)
    localStorage.setItem('access_token', access_token)
    set({ token: access_token })
    const user = await authApi.me()
    set({ user })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    set({ user: null, token: null })
    window.location.href = '/login'
  },

  loadUser: async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    try {
      set({ isLoading: true })
      const user = await authApi.me()
      set({ user, token })
    } catch {
      localStorage.removeItem('access_token')
      set({ user: null, token: null })
    } finally {
      set({ isLoading: false })
    }
  },
}))
