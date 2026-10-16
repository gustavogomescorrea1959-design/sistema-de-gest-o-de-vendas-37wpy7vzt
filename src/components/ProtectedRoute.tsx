import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { AppModuleId } from '@/services/permissions'
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

/**
 * Tela informativa exibida quando o usuário autenticado não tem permissão
 * para acessar a rota solicitada.
 */
export function AccessDeniedView({
  moduleName,
  redirectPath = '/dashboard',
}: {
  moduleName?: string
  redirectPath?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 animate-fade-in">
      <Card className="max-w-md w-full text-center shadow-subtle border-destructive/20">
        <CardHeader className="flex flex-col items-center space-y-2 pb-2">
          <div className="p-3 bg-destructive/10 text-destructive rounded-full">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <CardTitle className="text-xl">Acesso Restrito</CardTitle>
          <CardDescription>
            {moduleName
              ? `Você não possui permissão para acessar o módulo "${moduleName}".`
              : 'Você não possui permissão para acessar esta página.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            O administrador do sistema configurou o acesso às funcionalidades por usuário. Caso
            precise desta tela, solicite a liberação ao administrador.
          </p>
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link to={redirectPath} className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Ir para a página inicial
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Guarda de rota por módulo: verifica se o usuário autenticado (ou admin)
 * tem acesso à funcionalidade informada. Se não tiver, exibe a tela de Acesso Restrito.
 */
export function ModuleRoute({
  moduleId,
  moduleName,
}: {
  moduleId: AppModuleId
  moduleName?: string
}) {
  const { isAuthenticated, loading, isAdmin, canAccess, allowedModules } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (isAdmin || canAccess(moduleId)) {
    return <Outlet />
  }

  // Se o usuário não tem acesso, determina a rota de fallback (primeira página permitida ou /)
  const firstAllowed = allowedModules[0]
  const redirectTarget = firstAllowed ? `/${firstAllowed}` : '/'

  return <AccessDeniedView moduleName={moduleName} redirectPath={redirectTarget} />
}

// Rota protegida adicional: só permite acesso a administradores (role = admin).
// Usuários comuns visualizam a tela de Acesso Restrito.
export function AdminRoute() {
  const { isAuthenticated, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  if (!isAdmin) {
    return <AccessDeniedView moduleName="Usuários e Permissões" />
  }

  return <Outlet />
}
