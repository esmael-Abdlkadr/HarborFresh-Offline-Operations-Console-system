import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User, UserRole } from '../types/index.ts'
import { AuthError, authService } from '../services/authService.ts'

interface AuthContextValue {
  currentUser: User | null
  encryptionKey: CryptoKey | null
  isReady: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => void
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    void authService
      .restoreSession()
      .then((user) => {
        if (user) {
          setCurrentUser(user)
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof AuthError)) {
          throw error
        }
      })
      .finally(() => {
        setIsReady(true)
      })
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const result = await authService.login(username, password)
    setCurrentUser(result.user)
    setEncryptionKey(result.encryptionKey)
    return result.user
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setCurrentUser(null)
    setEncryptionKey(null)
  }, [])

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!currentUser) {
        return false
      }

      if (roles.length === 0) {
        return true
      }

      return roles.includes(currentUser.role)
    },
    [currentUser],
  )

  const value = useMemo(
    () => ({
      currentUser,
      encryptionKey,
      isReady,
      login,
      logout,
      hasRole,
    }),
    [currentUser, encryptionKey, hasRole, isReady, login, logout],
  )

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.')
  }
  return context
}
