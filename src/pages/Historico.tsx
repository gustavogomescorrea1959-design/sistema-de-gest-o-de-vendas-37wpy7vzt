import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import {
  Loader2,
  RefreshCw,
  LineChart as LineChartIcon,
  CalendarRange,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { ClientResponseError } from 'pocketbase'
import { getDailySalesByDateRange } from '@/services/api'
import { syncSaiposAll2026 } from '@/services/saipos-sync'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { CHANNELS, Channel, DailySale } from '@/types'
import { useAuth } from '@/hooks/use-auth'

// Período: janeiro a outubro de 2026 (inclui setembro e meses correntes).
const START_DATE = '2026-01-01'
const END_DATE = '2026-10-31'

// Lista canônica de meses do período de 2026 (exibidos no eixo X e na tabela).
const MONTHS = [
  { key: '2026-01', label: 'Jan' },
  { key: '2026-02', label: 'Fev' },
  { key: '2026-03', label: 'Mar' },
  { key: '2026-04', label: 'Abr' },
  { key: '2026-05', label: 'Mai' },
  { key: '2026-06', label: 'Jun' },
  { key: '2026-07', label: 'Jul' },
  { key: '2026-08', label: 'Ago' },
  { key: '2026-09', label: 'Set' },
  { key: '2026-10', label: 'Out' },
]

const CHANNEL_COLORS: Record<Channel, string> = {
  'Loja / Restaurante': 'hsl(var(--chart-1))',
  'Central de Pedidos': 'hsl(var(--chart-2))',
  iFood: 'hsl(var(--chart-3))',
  'Cardápio Web': 'hsl(var(--chart-4))',
  '99Food': 'hsl(var(--chart-5))',
  WhatsApp: 'hsl(var(--chart-6))',
  Telefone: 'hsl(var(--chart-7))',
}

export default function Historico() {
  const { isAdmin } = useAuth()
  const [sales, setSales] = useState<DailySale[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedChannels, setSelectedChannels] = useState<Set<Channel>>(
    () => new Set(CHANNELS as readonly Channel[]),
  )
  const { toast } = useToast()

  const loadData = async () => {
    try {
      const records = await getDailySalesByDateRange(START_DATE, END_DATE)
      setSales(records)
    } catch (e: unknown) {
      console.error('Erro ao carregar dados do Histórico:', e)
      const err = e as { message?: string }
      toast({
        title: 'Erro ao carregar vendas do Histórico',
        description:
          err?.message || 'Não foi possível carregar os dados. Tente recarregar a página.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useRealtime('daily_sales', () => loadData())

  // Estrutura principal: matrizes por canal e mês para Faturamento, Pedidos e Ticket Médio.
  // Apenas canais reconhecidos (CHANNELS) entram — registros legados de canais
  // removidos (ex.: "Desconhecido") são ignorados, igual ao Dashboard.
  const {
    matrix,
    ordersMatrix,
    ticketMatrix,
    monthTotals,
    monthOrderTotals,
    channelTotals,
    channelOrderTotals,
    grandTotal,
    grandOrdersTotal,
  } = useMemo(() => {
    const m = {} as Record<Channel, Record<string, number>>
    const om = {} as Record<Channel, Record<string, number>>
    const tm = {} as Record<Channel, Record<string, number>>
    const mt = {} as Record<string, number>
    const mot = {} as Record<string, number>
    const ct = {} as Record<Channel, number>
    const cot = {} as Record<Channel, number>
    let grand = 0
    let grandOrders = 0

    CHANNELS.forEach((ch) => {
      m[ch] = {}
      om[ch] = {}
      tm[ch] = {}
      ct[ch] = 0
      cot[ch] = 0
      MONTHS.forEach((mo) => {
        m[ch][mo.key] = 0
        om[ch][mo.key] = 0
        tm[ch][mo.key] = 0
      })
    })

    sales.forEach((s) => {
      if (!CHANNELS.includes(s.channel as Channel)) return
      const monthKey = s.date.substring(0, 7)
      if (!m[s.channel as Channel] || m[s.channel as Channel][monthKey] === undefined) return
      const rev = s.revenue || 0
      const ord = s.orders || 0

      m[s.channel as Channel][monthKey] += rev
      om[s.channel as Channel][monthKey] += ord

      mt[monthKey] = (mt[monthKey] || 0) + rev
      mot[monthKey] = (mot[monthKey] || 0) + ord

      ct[s.channel as Channel] += rev
      cot[s.channel as Channel] += ord

      grand += rev
      grandOrders += ord
    })

    // Calcula ticket médio mensal = faturamento do mês / pedidos do mês por canal
    CHANNELS.forEach((ch) => {
      MONTHS.forEach((mo) => {
        const rev = m[ch][mo.key] || 0
        const ord = om[ch][mo.key] || 0
        tm[ch][mo.key] = ord > 0 ? Math.round((rev / ord) * 100) / 100 : 0
      })
    })

    return {
      matrix: m,
      ordersMatrix: om,
      ticketMatrix: tm,
      monthTotals: mt,
      monthOrderTotals: mot,
      channelTotals: ct,
      channelOrderTotals: cot,
      grandTotal: grand,
      grandOrdersTotal: grandOrders,
    }
  }, [sales])

  // Dados para o gráfico de Faturamento: um ponto por mês, uma linha por canal selecionado.
  const lineChartData = useMemo(() => {
    return MONTHS.map((mo) => {
      const point: Record<string, number | string> = { month: mo.label }
      CHANNELS.forEach((ch) => {
        if (selectedChannels.has(ch)) {
          point[ch] = Math.round((matrix[ch]?.[mo.key] || 0) * 100) / 100
        }
      })
      return point
    })
  }, [matrix, selectedChannels])

  // Dados para o gráfico de Pedidos por Canal
  const ordersChartData = useMemo(() => {
    return MONTHS.map((mo) => {
      const point: Record<string, number | string> = { month: mo.label }
      CHANNELS.forEach((ch) => {
        if (selectedChannels.has(ch)) {
          point[ch] = ordersMatrix[ch]?.[mo.key] || 0
        }
      })
      return point
    })
  }, [ordersMatrix, selectedChannels])

  // Dados para o gráfico de Ticket Médio por Canal
  const ticketChartData = useMemo(() => {
    return MONTHS.map((mo) => {
      const point: Record<string, number | string> = { month: mo.label }
      CHANNELS.forEach((ch) => {
        if (selectedChannels.has(ch)) {
          point[ch] = ticketMatrix[ch]?.[mo.key] || 0
        }
      })
      return point
    })
  }, [ticketMatrix, selectedChannels])

  // Configuração dinâmica do gráfico: só inclui os canais selecionados.
  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {}
    CHANNELS.forEach((ch) => {
      if (selectedChannels.has(ch)) {
        cfg[ch] = { label: ch, color: CHANNEL_COLORS[ch] }
      }
    })
    return cfg
  }, [selectedChannels])

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)

  const toggleChannel = (ch: Channel) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(ch)) next.delete(ch)
      else next.add(ch)
      return next
    })
  }

  const selectAll = () => setSelectedChannels(new Set(CHANNELS as readonly Channel[]))
  const clearAll = () => setSelectedChannels(new Set())

  // Dispara a sincronização em massa de 2026 (jan a out) no backend.
  const handleSync2026 = async (periodStart = '2026-01-01', periodEnd = '2026-09-30') => {
    setSyncing(true)
    try {
      const result = await syncSaiposAll2026(periodStart, periodEnd)
      const months = result.months || []
      const monthsLine =
        months.length > 0
          ? months
              .map(
                (m) =>
                  `${format(parseISO(m.month + '-02'), 'MMM', { locale: ptBR })}: ${formatCurrency(
                    m.revenue,
                  )}`,
              )
              .join(' • ')
          : ''
      toast({
        title: 'Sincronização concluída!',
        description: `${result.insertedCount} novo(s), ${result.updatedCount} atualizado(s), ${
          result.skippedCount || 0
        } pulado(s) — ${result.segments || 0} segmento(s), ${result.totalSales || 0} venda(s) bruta(s).${
          monthsLine ? '\n' + monthsLine : ''
        }`,
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
      await loadData()
    } catch (err: unknown) {
      const e = err as ClientResponseError
      const status = e?.status ?? 0
      let title = 'Erro na sincronização'
      let message = e?.response?.error || e?.message || 'Erro ao sincronizar dados da Saipos'
      if (status === 504) {
        title = 'Timeout / API demorou para responder'
        message =
          'A API do Saipos demorou demais para responder ao processar o período. Tente novamente ou selecione sincronizar apenas Setembro.'
      } else if (status === 0 || status === 503) {
        title = 'Erro de conexão com a Saipos'
      }
      toast({ title, description: message, variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho + ação de sincronização em massa */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Histórico 2026</h2>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            Evolução do faturamento por canal — janeiro a outubro de 2026
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => handleSync2026('2026-09-01', '2026-09-30')}
              disabled={syncing}
              variant="outline"
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sincronizar Setembro
            </Button>
            <Button
              onClick={() => handleSync2026('2026-01-01', '2026-09-30')}
              disabled={syncing}
              variant="default"
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizar Jan–Set 2026
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Filtro de canais */}
      <Card className="shadow-subtle">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Filtro de Canais</CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
                Selecionar todos
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
                Limpar
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs">
            Selecione quais canais de venda exibir no gráfico. A tabela sempre mostra todos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((ch) => {
              const checked = selectedChannels.has(ch)
              return (
                <label
                  key={ch}
                  className={
                    'flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors select-none ' +
                    (checked
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border bg-muted/40 hover:bg-muted')
                  }
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleChannel(ch)} />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                  />
                  <span className="text-sm font-medium">{ch}</span>
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos de Evolução: Faturamento, Pedidos e Ticket Médio */}
      <div className="space-y-6">
        {/* Gráfico 1: Evolução do Faturamento por Canal */}
        <Card className="shadow-subtle">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-primary" />
              Evolução do Faturamento por Canal
            </CardTitle>
            <CardDescription className="text-xs">
              Faturamento mensal de cada canal de venda (jan–out 2026)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[380px]">
            {selectedChannels.size === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Selecione ao menos um canal para exibir o gráfico.
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={lineChartData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      fontSize={12}
                      tickFormatter={(v) => `R$${(v as number) / 1000}k`}
                      tickLine={false}
                      axisLine={false}
                      width={70}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const m = payload?.[0]?.payload?.month as string | undefined
                            return m ? `Mês: ${m}` : ''
                          }}
                          formatter={(val) => formatCurrency(val as number)}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    {CHANNELS.filter((ch) => selectedChannels.has(ch)).map((ch) => (
                      <Line
                        key={ch}
                        type="monotone"
                        dataKey={ch}
                        stroke={CHANNEL_COLORS[ch]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico 2: Evolução de Pedidos por Canal */}
          <Card className="shadow-subtle">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-primary" />
                Evolução de Pedidos por Canal
              </CardTitle>
              <CardDescription className="text-xs">
                Total de pedidos mensais em cada canal de venda (jan–out 2026)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[340px]">
              {selectedChannels.size === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Selecione ao menos um canal para exibir o gráfico.
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={ordersChartData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} width={50} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, payload) => {
                              const m = payload?.[0]?.payload?.month as string | undefined
                              return m ? `Mês: ${m}` : ''
                            }}
                            formatter={(val) => `${val} pedidos`}
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      {CHANNELS.filter((ch) => selectedChannels.has(ch)).map((ch) => (
                        <Line
                          key={ch}
                          type="monotone"
                          dataKey={ch}
                          stroke={CHANNEL_COLORS[ch]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 3: Evolução do Ticket Médio por Canal */}
          <Card className="shadow-subtle">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Evolução do Ticket Médio por Canal
              </CardTitle>
              <CardDescription className="text-xs">
                Ticket médio mensal (Faturamento / Pedidos) por canal (jan–out 2026)
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[340px]">
              {selectedChannels.size === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Selecione ao menos um canal para exibir o gráfico.
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={ticketChartData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis
                        fontSize={12}
                        tickFormatter={(v) => `R$${v}`}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, payload) => {
                              const m = payload?.[0]?.payload?.month as string | undefined
                              return m ? `Mês: ${m}` : ''
                            }}
                            formatter={(val) => formatCurrency(val as number)}
                          />
                        }
                      />
                      <ChartLegend content={<ChartLegendContent />} />
                      {CHANNELS.filter((ch) => selectedChannels.has(ch)).map((ch) => (
                        <Line
                          key={ch}
                          type="monotone"
                          dataKey={ch}
                          stroke={CHANNEL_COLORS[ch]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabela mensal: linhas = canais, colunas = meses */}
      <Card className="shadow-subtle overflow-hidden">
        <CardHeader className="bg-muted/30 pb-4 border-b border-border">
          <CardTitle className="text-base">Faturamento Mensal por Canal</CardTitle>
          <CardDescription className="text-xs">
            Cada célula mostra o faturamento (R$) do canal naquele mês
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[180px]">
                  Canal
                </TableHead>
                {MONTHS.map((mo) => (
                  <TableHead key={mo.key} className="text-right min-w-[110px]">
                    {mo.label}
                  </TableHead>
                ))}
                <TableHead className="text-right min-w-[130px] bg-primary/5">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CHANNELS.map((ch) => {
                const total = channelTotals[ch] || 0
                if (total === 0 && !sales.some((s) => s.channel === ch)) return null
                return (
                  <TableRow key={ch} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground sticky left-0 bg-card z-10">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                        />
                        {ch}
                      </span>
                    </TableCell>
                    {MONTHS.map((mo) => {
                      const val = matrix[ch]?.[mo.key] || 0
                      return (
                        <TableCell
                          key={mo.key}
                          className={'text-right ' + (val === 0 ? 'text-muted-foreground/50' : '')}
                        >
                          {val === 0 ? '—' : formatCurrency(val)}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right font-semibold bg-primary/5">
                      {formatCurrency(total)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Linha de total por mês */}
              <TableRow className="bg-muted/50 font-semibold border-t-2 border-border">
                <TableCell className="sticky left-0 bg-muted/50 z-10">Total por mês</TableCell>
                {MONTHS.map((mo) => (
                  <TableCell key={mo.key} className="text-right">
                    {formatCurrency(monthTotals[mo.key] || 0)}
                  </TableCell>
                ))}
                <TableCell className="text-right bg-primary/10 text-primary">
                  {formatCurrency(grandTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Faturamento Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(grandTotal)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Canais Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {CHANNELS.filter((ch) => (channelTotals[ch] || 0) > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Mês de Pico</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const peak = MONTHS.reduce(
                (max, mo) =>
                  (monthTotals[mo.key] || 0) > max.rev
                    ? { rev: monthTotals[mo.key] || 0, mo }
                    : max,
                { rev: 0, mo: MONTHS[0] },
              )
              return (
                <div className="text-xl font-bold">
                  {peak.rev > 0
                    ? format(parseISO(peak.mo.key + '-02'), 'MMM', { locale: ptBR })
                    : '—'}
                </div>
              )
            })()}
          </CardContent>
        </Card>
        <Card className="shadow-subtle">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Canal Líder</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const leader = CHANNELS.reduce(
                (max, ch) =>
                  (channelTotals[ch] || 0) > max.rev ? { rev: channelTotals[ch] || 0, ch } : max,
                { rev: 0, ch: CHANNELS[0] as Channel },
              )
              return (
                <div className="text-xl font-bold truncate">{leader.rev > 0 ? leader.ch : '—'}</div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Badge informativo do período */}
      <div className="flex items-center justify-center">
        <Badge variant="secondary" className="text-xs">
          Período: 01/01/2026 a 31/10/2026 — dados de saipos_sales (daily_sales)
        </Badge>
      </div>
    </div>
  )
}
