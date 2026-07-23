import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Index() {
  const { isAuthenticated, signIn } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao acessar',
        description: 'Email ou senha incorretos. Verifique suas credenciais.',
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-elevation animate-slide-up border-border/50">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Gestão de Vendas</CardTitle>
          <CardDescription className="text-muted-foreground">
            Acesse o painel para gerenciar suas metas e resultados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@gestao.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="transition-colors focus-visible:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="transition-colors focus-visible:ring-primary"
              />
            </div>
            <Button type="submit" className="w-full mt-6" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? 'Entrando...' : 'Entrar no Sistema'}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Acesso restrito. Solicite uma conta ao administrador.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
