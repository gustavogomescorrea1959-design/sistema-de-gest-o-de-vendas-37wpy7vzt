import { useState, useEffect, useCallback } from 'react'
import { Users as UsersIcon, UserPlus, KeyRound, Power, Loader2, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  const { user: currentUser } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null)
  const [toggleTarget, setToggleTarget] = useState<UserRecord | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getUsers()
      setUsers(list)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os usuários.',
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
            <UsersIcon className="h-6 w-6 text-primary" /> Usuários
          </h2>
          <p className="text-muted-foreground text-sm">Gerencie quem pode acessar o sistema.</p>
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
    </div>
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
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await createUser({ name: name.trim(), email: email.trim().toLowerCase(), password })
      toast({
        title: 'Usuário criado',
        description: `${name.trim()} já pode acessar o sistema.`,
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
