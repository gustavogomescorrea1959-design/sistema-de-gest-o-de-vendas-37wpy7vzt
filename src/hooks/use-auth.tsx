import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import { AppModuleId, ALL_APP_MODULES, getUserPermissions } from '@/services/permissions'

interface AuthContextType {
  user: RecordModel | null
  isAuthenticated: boolean
  isAdmin: boolean
  allowedModules: AppModuleId[]
  canAccess: (module: AppModuleId) => boolean
  refreshPermissions: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<RecordModel | null>(
    pb.authStore.isValid ? pb.authStore.record : null,
  )
  const [isAuthenticated, setIsAuthenticated] = useState(pb.authStore.isValid)
  const [loading, setLoading] = useState(true)
  const [allowedModules, setAllowedModules] = useState<AppModuleId[]>([])

  const checkIsAdmin = (rec: RecordModel | null): boolean => {
    if (!rec) return false
    if (typeof (rec as any).isSuperuser === 'function' && (rec as any).isSuperuser()) {
      return true
    }
    return (rec as any).role === 'admin'
  }

  const isAdmin = checkIsAdmin(user)

  const loadPermissions = useCallback(async (currentRec: RecordModel | null) => {
    if (!currentRec) {
      setAllowedModules([])
      return
    }

    if (checkIsAdmin(currentRec)) {
      setAllowedModules(ALL_APP_MODULES.map((m) => m.id))
      return
    }

    try {
      const permRecord = await getUserPermissions(currentRec.id)
      if (permRecord && Array.isArray(permRecord.pages)) {
        setAllowedModules(permRecord.pages as AppModuleId[])
      } else {
        // Fallback para novo usuário sem registro de permissão
        setAllowedModules(['dashboard', 'vendas-diarias', 'metas', 'historico'])
      }
    } catch {
      setAllowedModules(['dashboard', 'vendas-diarias', 'metas', 'historico'])
    }
  }, [])

  const refreshPermissions = useCallback(async () => {
    if (user) {
      await loadPermissions(user)
    }
  }, [user, loadPermissions])

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange(async (_token, record) => {
      const valid = pb.authStore.isValid
      const nextUser = valid ? record : null
      setUser(nextUser)
      setIsAuthenticated(valid)
      await loadPermissions(nextUser)
    })

    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .then((authData) => {
          loadPermissions(authData.record)
        })
        .catch(() => {
          pb.authStore.clear()
          setAllowedModules([])
        })
        .finally(() => setLoading(false))
    } else {
      if (pb.authStore.record) pb.authStore.clear()
      setAllowedModules([])
      setLoading(false)
    }
    return () => {
      unsubscribe()
    }
  }, [loadPermissions])

  const canAccess = useCallback(
    (moduleId: AppModuleId): boolean => {
      if (!isAuthenticated || !user) return false
      if (isAdmin) return true
      return allowedModules.includes(moduleId)
    },
    [isAuthenticated, user, isAdmin, allowedModules],
  )

  const signIn = async (email: string, password: string) => {
    try {
      await pb.collection('users').authWithPassword(email, password)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = () => {
    pb.authStore.clear()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        allowedModules,
        canAccess,
        refreshPermissions,
        signIn,
        signOut,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
