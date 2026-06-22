import type { User } from '@/types'

export function isAdminUser(user: User | null | undefined): boolean {
  return Boolean(user && (user.role === 'ADMIN' || user.is_superuser))
}
