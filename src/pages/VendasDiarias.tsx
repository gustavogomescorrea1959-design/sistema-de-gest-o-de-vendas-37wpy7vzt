import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarIcon,
  Save,
  Trash2,
  Loader2,
  Store,
  Headset,
  Utensils,
  Globe,
  Bike,
  MessageCircle,
  Phone,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { CHANNELS, Channel, DailySale } from '@/types'
import { getDailySalesByDate, saveDailySale, deleteDailySalesByDate } from '@/services/api'
import { ImportSalesButton } from '@/components/ImportSalesButton'
import { useRealtime } from '@/hooks/use-realtime'

const ICONS: Record<Channel, React.ElementType> = {
  'Loja / Restaurante': Store,
  'Central de Pedidos': Headset,
  iFood: Utensils,
  'Cardápio Web': Globe,
  '99Food': Bike,
  WhatsApp: MessageCircle,
  Telefone: Phone,
}

type FormData = Record<Channel, { id?: string; orders: string; revenue: string }>

const initialFormData = (): FormData => {
  return CHANNELS.reduce((acc, ch) => {
    acc[ch] = { orders: '', revenue: '' }
    return acc
  }, {} as FormData)
}

export default function VendasDiarias() {
  const [date, setDate] = useState<Date>(new Date())
  const [formData, setFormData] = useState<FormData>(initialFormData())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const loadData = async (selectedDate: Date) => {
    setLoading(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const records = await getDailySalesByDate(dateStr)

      const newForm = initialFormData()
      records.forEach((r) => {
        newForm[r.channel] = {
          id: r.id,
          orders: r.orders.toString(),
          revenue: r.revenue.toString(),
        }
      })
      setFormData(newForm)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar os dados.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(date)
  }, [date])

  useRealtime('daily_sales', () => loadData(date))

  const handleSave = async () => {
    setSaving(true)
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const promises = CHANNELS.map((ch) => {
        const d = formData[ch]
        const orders = parseInt(d.orders) || 0
        const revenue = parseFloat(d.revenue) || 0

        if (orders === 0 && revenue === 0 && !d.id) return null // skip empty

        const avg = orders > 0 ? revenue / orders : 0

        return saveDailySale({
          id: d.id,
          date: dateStr,
          channel: ch,
          orders,
          revenue,
          average_ticket: avg,
        })
      }).filter(Boolean)

      await Promise.all(promises)
      toast({ title: 'Sucesso', description: 'Dados salvos com sucesso!' })
      loadData(date) // refresh IDs
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar os dados.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Tem certeza que deseja apagar todos os registros deste dia?')) return
    setSaving(true)
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      await deleteDailySalesByDate(dateStr)
      setFormData(initialFormData())
      toast({ title: 'Limpado', description: 'Registros do dia removidos.' })
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao limpar.' })
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (ch: Channel, field: 'orders' | 'revenue', val: string) => {
    if (val !== '' && !/^\d*\.?\d*$/.test(val)) return // simple number validation
    setFormData((prev) => ({ ...prev, [ch]: { ...prev[ch], [field]: val } }))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lançamento de Vendas</h2>
          <p className="text-muted-foreground text-sm">
            Registre os resultados de cada canal para o dia selecionado.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ImportSalesButton onSuccess={() => loadData(date)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-[240px] justify-start text-left font-medium shadow-sm',
                  !date && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP', { locale: ptBR }) : <span>Selecione uma data</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card className="shadow-subtle border-border/60">
        <CardHeader className="bg-muted/20 border-b pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Dados de {format(date, 'dd/MM/yyyy')}</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={saving || loading}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            </div>
          </div>
        </CardHeader>
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
                    <th className="px-6 py-4 font-medium">Canal de Venda</th>
                    <th className="px-6 py-4 font-medium w-32">Pedidos</th>
                    <th className="px-6 py-4 font-medium w-48">Faturamento (R$)</th>
                    <th className="px-6 py-4 font-medium w-32 text-right">Tkt Médio</th>
                    <th className="px-4 py-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {CHANNELS.map((ch) => {
                    const Icon = ICONS[ch]
                    const data = formData[ch]
                    const o = parseInt(data.orders) || 0
                    const r = parseFloat(data.revenue) || 0
                    const tkt = o > 0 ? r / o : 0
                    const isFilled = data.orders !== '' || data.revenue !== ''
                    const isComplete = data.orders !== '' && data.revenue !== ''

                    return (
                      <tr key={ch} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="font-medium text-foreground">{ch}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Input
                            value={data.orders}
                            onChange={(e) => handleChange(ch, 'orders', e.target.value)}
                            className="h-9 text-right"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-6 py-4 relative">
                          <span className="absolute left-9 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">
                            R$
                          </span>
                          <Input
                            value={data.revenue}
                            onChange={(e) => handleChange(ch, 'revenue', e.target.value)}
                            className="h-9 text-right pl-8"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-muted-foreground">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(tkt)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div
                            className={cn(
                              'w-2.5 h-2.5 rounded-full mx-auto transition-colors',
                              !isFilled
                                ? 'bg-muted-foreground/30'
                                : isComplete
                                  ? 'bg-emerald-500'
                                  : 'bg-amber-400',
                            )}
                            title={!isFilled ? 'Vazio' : isComplete ? 'Preenchido' : 'Incompleto'}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        <div className="p-6 bg-muted/10 border-t flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full sm:w-auto shadow-sm"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Dados do Dia
          </Button>
        </div>
      </Card>
    </div>
  )
}
