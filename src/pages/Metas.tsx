import { useState, useEffect } from 'react'
import { Target, Save, Edit3, Loader2, Sparkles, RefreshCw, Lock, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Goal, CHANNELS } from '@/types'
import { getGoals, updateGoal, recalculateGoals } from '@/services/api'

export default function Metas() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editState, setEditState] = useState<Record<string, Partial<Goal>>>({})
  const { toast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await getGoals()
      // Ensure all channels are represented even if missing in DB
      const sortedData = CHANNELS.map(
        (ch) =>
          data.find((g) => g.channel === ch) ||
          ({
            id: '',
            channel: ch,
            goal_orders: 0,
            goal_revenue: 0,
            standard_ticket: 0,
            period: 'Mensal',
            notes: '',
          } as Goal),
      )
      setGoals(sortedData as Goal[])

      const initialEditState: Record<string, Partial<Goal>> = {}
      sortedData.forEach((g) => {
        if (g.id) initialEditState[g.id] = { ...g }
      })
      setEditState(initialEditState)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar as metas.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const promises = Object.values(editState)
        .map((data) => {
          if (data.id) return updateGoal(data.id, data)
          return null
        })
        .filter(Boolean)

      await Promise.all(promises)
      toast({ title: 'Metas atualizadas', description: 'As novas metas foram salvas com sucesso.' })
      setIsEditing(false)
      loadData()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao salvar as metas.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (id: string, field: keyof Goal, value: string) => {
    // standard_ticket não é editável manualmente — definido automaticamente pelo sistema
    if (field === 'standard_ticket') return

    setEditState((prev) => {
      const updated = {
        ...prev[id],
        [field]: field === 'notes' || field === 'period' ? value : Number(value) || 0,
      }

      return { ...prev, [id]: updated }
    })
  }

  const handleRecalculateNow = async () => {
    setRecalculating(true)
    try {
      const res = await recalculateGoals()
      toast({
        title: 'Metas recalculadas com sucesso!',
        description: `O Ticket Médio Padrão dos canais foi atualizado com base nos últimos 3 meses (${res.pastMonths.map((m) => m.monthKey).join(', ')}).`,
      })
      await loadData()
    } catch (e: unknown) {
      const err = e as { message?: string }
      toast({
        variant: 'destructive',
        title: 'Erro ao recalcular metas',
        description: err?.message || 'Falha ao executar o recálculo automático.',
      })
    } finally {
      setRecalculating(false)
    }
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Metas Mensais
          </h2>
          <p className="text-muted-foreground text-sm">
            Defina os objetivos de vendas para cada canal. O Padrão do Ticket Médio é calculado
            automaticamente pelo sistema.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleRecalculateNow}
            disabled={recalculating || isEditing}
            title="Recalcula o Ticket Médio Padrão pela média dos últimos 3 meses e ajusta Metas de Faturamento e Pedidos"
          >
            {recalculating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalcular Automaticamente
          </Button>

          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Metas
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit3 className="h-4 w-4 mr-2" /> Editar Metas
            </Button>
          )}
        </div>
      </div>

      {/* Caixa informativa sobre a regra automática */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p className="font-medium text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Regra Automática de Metas (1º dia de cada mês)
          </p>
          <p>
            • <strong>Padrão do Ticket Médio:</strong> definido automaticamente pelo sistema pela
            média dos últimos 3 meses de cada canal (campo somente leitura).
          </p>
          <p>
            • <strong>Meta de Faturamento:</strong> corrigida pela variação apurada no Ticket Médio
            de cada canal.
          </p>
          <p>
            • <strong>Meta de Pedidos:</strong> ajustada com base no novo Faturamento e no novo
            Ticket Médio.
          </p>
        </div>
      </div>

      <Card className="shadow-subtle">
        <CardContent className="p-0">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium">Canal</th>
                    <th className="px-4 py-4 font-medium text-right w-32">Meta Pedidos</th>
                    <th className="px-4 py-4 font-medium text-right w-40">Meta Fat. (R$)</th>
                    <th className="px-4 py-4 font-medium text-right w-44">
                      <span className="inline-flex items-center gap-1">
                        Ticket Padrão
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </span>
                    </th>
                    <th className="px-6 py-4 font-medium min-w-[200px]">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {goals.map((g) => {
                    const state = editState[g.id] || g
                    return (
                      <tr key={g.channel} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{g.channel}</td>
                        <td className="px-4 py-4 text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={state.goal_orders}
                              onChange={(e) => handleChange(g.id, 'goal_orders', e.target.value)}
                              className="h-8 text-right"
                            />
                          ) : (
                            state.goal_orders
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={state.goal_revenue}
                              onChange={(e) => handleChange(g.id, 'goal_revenue', e.target.value)}
                              className="h-8 text-right"
                            />
                          ) : (
                            formatCurrency(Number(state.goal_revenue))
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-medium text-foreground">
                              {formatCurrency(Number(state.standard_ticket))}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-5 font-normal text-muted-foreground border-dashed"
                              title="Definido pelo sistema (média dos últimos 3 meses)"
                            >
                              Auto
                            </Badge>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <Input
                              value={state.notes || ''}
                              onChange={(e) => handleChange(g.id, 'notes', e.target.value)}
                              className="h-8 text-sm"
                              placeholder="Opcional..."
                            />
                          ) : (
                            <span className="text-muted-foreground truncate block max-w-[200px]">
                              {state.notes || '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
