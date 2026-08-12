import { useState, useEffect } from 'react'
import { Target, Save, Edit3, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { Goal, CHANNELS } from '@/types'
import { getGoals, updateGoal } from '@/services/api'
import { cn } from '@/lib/utils'

export default function Metas() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
    setEditState((prev) => {
      const updated = {
        ...prev[id],
        [field]: field === 'notes' || field === 'period' ? value : Number(value) || 0,
      }

      // Auto calc ticket if orders or revenue changes and standard ticket wasn't manually edited this keystroke
      if (field === 'goal_orders' || field === 'goal_revenue') {
        const o = Number(updated.goal_orders) || 0
        const r = Number(updated.goal_revenue) || 0
        updated.standard_ticket = o > 0 ? r / o : 0
      }
      return { ...prev, [id]: updated }
    })
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
            Defina os objetivos de vendas para cada canal.
          </p>
        </div>

        <div className="flex gap-2">
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
                    <th className="px-4 py-4 font-medium text-right w-32">Ticket Padrão</th>
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
                        <td className="px-4 py-4 text-right text-muted-foreground">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={state.standard_ticket}
                              onChange={(e) =>
                                handleChange(g.id, 'standard_ticket', e.target.value)
                              }
                              className="h-8 text-right bg-muted/30"
                            />
                          ) : (
                            formatCurrency(Number(state.standard_ticket))
                          )}
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
