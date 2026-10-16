import { useState, useEffect, useCallback } from 'react'
import {
  Users as UsersIcon,
  UserPlus,
  KeyRound,
  Power,
  Loader2,
  ShieldCheck,
  Shield,
  Check,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import {
  getUsers,
  createUser,
  resetUserPassword,
  setUserActive,
  type UserRecord,
} from '@/services/users'
import {
  ALL_APP_MODULES,
  AppModuleId,
  DEFAULT_USER_MODULES,
  getAllUserPermissions,
  saveUserPermissions,
} from '@/services/permissions'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const formatDate = (iso: string) => {
  if (!iso) return '-'
  try {
    return format(new Date(iso), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch {
    return iso
  }
}

export default function Usuarios() {
  const { user: currentUser, refreshPermissions } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [permissionsMap, setPermissionsMap] = useState<Record<string, AppModuleId[]>>({})
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [toggleTarget, setToggleTarget] = useState<UserRecord | null>(null)
  const [permissionsTarget, setPermissionsTarget] = useState<UserRecord | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, perms] = await Promise.all([getUsers(), getAllUserPermissions()])
      setUsers(list)
      setPermissionsMap(perms)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os usuários ou permissões.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-primary" /> Usuários e Permissões
          </h2>
          <p className="text-muted-foreground text-sm">
            Gerencie quem pode acessar o sistema e controle página por página o que cada usuário
            pode visualizar.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      <Card className="shadow-subtle">
        <CardContent className="p-0">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
              Nenhum usuário cadastrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Acessos Permitidos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isActive = u.active !== false
                    const isSelf = u.id === currentUser?.id
                    const isAdmin = u.role === 'admin'
                    const userPages = isAdmin
                      ? ALL_APP_MODULES.map((m) => m.id)
                      : permissionsMap[u.id] || DEFAULT_USER_MODULES

                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium text-foreground">
                          {u.name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Badge className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline">Usuário</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Acesso total (todas as páginas)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[280px]">
                              {userPages.length === 0 ? (
                                <span className="text-xs text-muted-foreground italic">
                                  Nenhuma página liberada
                                </span>
                              ) : (
                                userPages.map((pid) => {
                                  const mod = ALL_APP_MODULES.find((m) => m.id === pid)
                                  return (
                                    <Badge
                                      key={pid}
                                      variant="secondary"
                                      className="text-[11px] px-1.5 py-0 h-5"
                                    >
                                      {mod?.label || pid}
                                    </Badge>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isActive ? (
                            <Badge className="border-transparent bg-green-100 text-green-700 hover:bg-green-100">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(u.created)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPermissionsTarget(u)}
                              disabled={isAdmin}
                              title={
                                isAdmin
                                  ? 'Administrador sempre tem acesso completo'
                                  : 'Definir permissões de acesso'
                              }
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setResetTarget(u)}
                              disabled={isAdmin}
                              title={
                                isAdmin
                                  ? 'Não é possível redefinir a senha do admin'
                                  : 'Redefinir senha'
                              }
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setToggleTarget(u)}
                              disabled={isAdmin || isSelf}
                              title={
                                isAdmin
                                  ? 'Não é possível desativar o admin'
                                  : isSelf
                                    ? 'Não é possível desativar a própria conta'
                                    : isActive
                                      ? 'Desativar usuário'
                                      : 'Reativar usuário'
                              }
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={load}
      />
      <ToggleActiveDialog
        target={toggleTarget}
        onClose={() => setToggleTarget(null)}
        onDone={load}
      />
      <UserPermissionsDialog
        target={permissionsTarget}
        currentPermissions={permissionsTarget ? permissionsMap[permissionsTarget.id] : undefined}
        onClose={() => setPermissionsTarget(null)}
        onSaved={async () => {
          await load()
          await refreshPermissions()
        }}
      />
    </div>
  )
}

// --- Dialog: Permissões de Acesso por Usuário ---
function UserPermissionsDialog({
  target,
  currentPermissions,
  onClose,
  onSaved,
}: {
  target: UserRecord | null
  currentPermissions?: AppModuleId[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [selectedPages, setSelectedPages] = useState<AppModuleId[]>([])
  const [saving, setSaving] = useState(false)

  const open = target !== null

  useEffect(() => {
    if (target) {
      if (currentPermissions) {
        setSelectedPages(currentPermissions)
      } else {
        setSelectedPages(DEFAULT_USER_MODULES)
      }
    }
  }, [target, currentPermissions])

  const togglePage = (id: AppModuleId) => {
    setSelectedPages((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleSelectAll = () => {
    // Para usuário comum, seleciona todos os módulos de usuário
    const regular = ALL_APP_MODULES.filter((m) => !m.adminOnly).map((m) => m.id)
    setSelectedPages(regular)
  }

  const handleClearAll = () => {
    setSelectedPages([])
  }

  const handleSave = async () => {
    if (!target) return
    setSaving(true)
    try {
      await saveUserPermissions(target.id, selectedPages)
      toast({
        title: 'Permissões atualizadas',
        description: `As permissões de ${target.name || target.email} foram salvas com sucesso.`,
      })
      onClose()
      onSaved()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar permissões',
        description: err?.message || 'Falha ao gravar permissões.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Permissões de Acesso
          </DialogTitle>
          <DialogDescription>
            Defina quais páginas{' '}
            <strong className="text-foreground">{target?.name || target?.email}</strong> pode
            visualizar e acessar no aplicativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Módulos do sistema:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-primary hover:underline font-medium"
              >
                Marcar todos
              </button>
              <span className="text-muted-foreground">•</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-muted-foreground hover:underline"
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          <div className="space-y-2 border rounded-md p-3 divide-y divide-border">
            {ALL_APP_MODULES.filter((mod) => !mod.adminOnly).map((mod) => {
              const isChecked = selectedPages.includes(mod.id)
              return (
                <label
                  key={mod.id}
                  className="flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/40 px-2 rounded-sm transition-colors"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => togglePage(mod.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 text-sm select-none">
                    <div className="font-medium text-foreground flex items-center gap-1.5">
                      {mod.label}
                      <span className="text-xs text-muted-foreground font-normal">
                        ({mod.path})
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{mod.description}</div>
                  </div>
                </label>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md">
            Páginas desmarcadas ficam ocultas do menu lateral deste usuário e, caso ele tente
            acessá-las pela barra de endereço, será exibida uma tela de acesso restrito.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar Permissões
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Dialog: Criar Usuário ---
function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedPages, setSelectedPages] = useState<AppModuleId[]>(DEFAULT_USER_MODULES)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setSelectedPages(DEFAULT_USER_MODULES)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const togglePage = (id: AppModuleId) => {
    setSelectedPages((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const created = await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        pages: selectedPages,
      })
      // Garante sincronização de permissões caso o endpoint use fallback
      try {
        if (created?.id) {
          await saveUserPermissions(created.id, selectedPages)
        }
      } catch {
        /* intentionally ignored */
      }

      toast({
        title: 'Usuário criado',
        description: `${name.trim()} já pode acessar o sistema com as permissões configuradas.`,
      })
      handleOpenChange(false)
      onCreated()
    } catch (err: any) {
      const msg = err?.response?.message || err?.message || 'Não foi possível criar o usuário.'
      toast({
        variant: 'destructive',
        title: 'Erro ao criar usuário',
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Crie uma conta para outra pessoa acessar o sistema. Defina nome, email e senha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Nome</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Senha</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">
              A senha deve ter no mínimo 8 caracteres.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-semibold">Páginas Liberadas</Label>
            <div className="space-y-1.5 border rounded-md p-2 max-h-48 overflow-y-auto">
              {ALL_APP_MODULES.filter((mod) => !mod.adminOnly).map((mod) => (
                <label
                  key={mod.id}
                  className="flex items-center gap-2 p-1.5 hover:bg-muted/40 rounded text-xs cursor-pointer select-none"
                >
                  <Checkbox
                    checked={selectedPages.includes(mod.id)}
                    onCheckedChange={() => togglePage(mod.id)}
                  />
                  <span className="font-medium text-foreground">{mod.label}</span>
                  <span className="text-muted-foreground">({mod.path})</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Você pode alterar as páginas permitidas a qualquer momento pelo botão de escudo na
              tabela.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {saving ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Dialog: Redefinir Senha ---
function ResetPasswordDialog({
  target,
  onClose,
  onDone,
}: {
  target: UserRecord | null
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const open = target !== null

  const handleClose = () => {
    setPassword('')
    setConfirm('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    if (password !== confirm) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'As senhas não conferem.',
      })
      return
    }
    setSaving(true)
    try {
      await resetUserPassword(target.id, password)
      toast({
        title: 'Senha redefinida',
        description: `A senha de ${target.name || target.email} foi atualizada.`,
      })
      handleClose()
      onDone()
    } catch (err: any) {
      const msg = err?.response?.message || err?.message || 'Não foi possível redefinir a senha.'
      toast({
        variant: 'destructive',
        title: 'Erro ao redefinir senha',
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Redefinir Senha
          </DialogTitle>
          <DialogDescription>
            Defina uma nova senha para{' '}
            <span className="font-medium text-foreground">{target?.name || target?.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Nova senha</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirmar senha</Label>
            <Input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {saving ? 'Salvando...' : 'Redefinir'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Dialog: Ativar/Desativar ---
function ToggleActiveDialog({
  target,
  onClose,
  onDone,
}: {
  target: UserRecord | null
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const open = target !== null
  const isActive = target ? target.active !== false : false

  const handleSubmit = async () => {
    if (!target) return
    setSaving(true)
    try {
      await setUserActive(target.id, !isActive)
      toast({
        title: isActive ? 'Usuário desativado' : 'Usuário reativado',
        description: `${target.name || target.email} foi ${isActive ? 'desativado' : 'reativado'}.`,
      })
      onClose()
      onDone()
    } catch (err: any) {
      const msg = err?.response?.message || err?.message || 'Falha na operação.'
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power className="h-5 w-5" />
            {isActive ? 'Desativar usuário' : 'Reativar usuário'}
          </DialogTitle>
          <DialogDescription>
            {isActive ? (
              <>
                Ao desativar,{' '}
                <span className="font-medium text-foreground">{target?.name || target?.email}</span>{' '}
                não poderá mais fazer login. Você poderá reativá-lo a qualquer momento.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{target?.name || target?.email}</span>{' '}
                poderá fazer login novamente.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant={isActive ? 'destructive' : 'default'}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {saving ? 'Processando...' : isActive ? 'Desativar' : 'Reativar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
