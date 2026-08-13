import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, getDaysInMonth, getDate } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getGoals, getDailySalesByMonth } from '@/services/api'
import { useRealtime } from '@/hooks/use-realtime'
import { Goal, DailySale, CHANNELS, Channel } from '@/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { ArrowUpRight, DollarSign, ShoppingBag, Target, TrendingUp, Bike } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getWorkingDaysInMonth, getWorkingDaysPassed } from '@/lib/working-days'
import { SyncSaiposButton } from '@/components/SyncSaiposButton'

const DELIVERY_CHANNELS = CHANNELS.filter(
  (ch) => ch !== 'Loja / Restaurante' && ch !== 'Desconhecido',
)

const CHANNEL_COLORS: Record<string, string> = {
  'Loja / Restaurante': 'hsl(var(--chart-1))',
  'Central de Pedidos': 'hsl(var(--chart-2))',
  iFood: 'hsl(var(--chart-3))',
  'Cardápio Web': 'hsl(var(--chart-4))',
  '99Food': 'hsl(var(--chart-5))',
  WhatsApp: 'hsl(var(--chart-6))',
  Telefone: 'hsl(var(--chart-7))',
  Desconhecido: 'hsl(var(--muted-foreground))',
}

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM')

  const [sales, setSales] = useState<DailySale[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [s, g] = await Promise.all([getDailySalesByMonth(monthParam), getGoals()])
      setSales(s)
      setGoals(g)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [monthParam])

  useRealtime('daily_sales', () => {
    loadData()
  })
  useRealtime('goals', () => {
    loadData()
  })

  const metrics = useMemo(() => {
    let totalOrders = 0
    let totalRevenue = 0
    let totalGoalRevenue = 0

    const channelStats = CHANNELS.reduce(
      (acc, ch) => {
        acc[ch] = { orders: 0, revenue: 0, goalRevenue: 0, goalOrders: 0 }
        return acc
      },
      {} as Record<
        Channel,
        { orders: number; revenue: number; goalRevenue: number; goalOrders: number }
      >,
    )

    sales.forEach((s) => {
      totalOrders += s.orders
      totalRevenue += s.revenue
      if (channelStats[s.channel]) {
        channelStats[s.channel].orders += s.orders
        channelStats[s.channel].revenue += s.revenue
      }
    })

    goals.forEach((g) => {
      totalGoalRevenue += g.goal_revenue
      if (channelStats[g.channel]) {
        channelStats[g.channel].goalRevenue = g.goal_revenue
        channelStats[g.channel].goalOrders = g.goal_orders
      }
    })

    const ticket = totalOrders > 0 ? totalRevenue / totalOrders : 0
    const progress = totalGoalRevenue > 0 ? (totalRevenue / totalGoalRevenue) * 100 : 0

    const daysInM = getDaysInMonth(new Date(`${monthParam}-02T00:00:00`))
    const isCurrentMonth = monthParam === format(new Date(), 'yyyy-MM')
    const daysPassed = isCurrentMonth ? Math.max(1, getDate(new Date())) : daysInM
    const projRevenue = (totalRevenue / daysPassed) * daysInM
    const projOrders = Math.round((totalOrders / daysPassed) * daysInM)

    const deliveryOrders = DELIVERY_CHANNELS.reduce(
      (acc, ch) => acc + (channelStats[ch]?.orders ?? 0),
      0,
    )
    const deliveryRevenue = DELIVERY_CHANNELS.reduce(
      (acc, ch) => acc + (channelStats[ch]?.revenue ?? 0),
      0,
    )
    const deliveryTicket = deliveryOrders > 0 ? deliveryRevenue / deliveryOrders : 0

    const [yearStr, monthStr] = monthParam.split('-')
    const yearNum = parseInt(yearStr, 10)
    const monthIdx = parseInt(monthStr, 10) - 1
    const totalWorkingDays = getWorkingDaysInMonth(yearNum, monthIdx)
    const workingDaysPassed = getWorkingDaysPassed(yearNum, monthIdx)

    const channelProjections = CHANNELS.reduce(
      (acc, ch) => {
        const rev = channelStats[ch].revenue
        acc[ch] = workingDaysPassed > 0 ? (rev / workingDaysPassed) * totalWorkingDays : 0
        return acc
      },
      {} as Record<Channel, number>,
    )

    const totalProjection =
      workingDaysPassed > 0 ? (totalRevenue / workingDaysPassed) * totalWorkingDays : 0

    return {
      totalOrders,
      totalRevenue,
      totalGoalRevenue,
      ticket,
      progress,
      channelStats,
      projRevenue,
      projOrders,
      deliveryOrders,
      deliveryRevenue,
      deliveryTicket,
      channelProjections,
      totalProjection,
    }
  }, [sales, goals, monthParam])

  const barChartData = CHANNELS.map((ch) => ({
    name: ch.split(' / ')[0], // short name
    Realizado: metrics.channelStats[ch].revenue,
    Meta: metrics.channelStats[ch].goalRevenue,
    fill: CHANNEL_COLORS[ch],
  }))

  const pieData = CHANNELS.filter((ch) => metrics.channelStats[ch].orders > 0).map((ch) => ({
    name: ch,
    value: metrics.channelStats[ch].orders,
    fill: CHANNEL_COLORS[ch],
  }))

  const lineChartData = useMemo(() => {
    const days = getDaysInMonth(new Date(`${monthParam}-02T00:00:00`))
    const data = []
    for (let i = 1; i <= days; i++) {
      const dStr = `${monthParam}-${i.toString().padStart(2, '0')}`
      const daySales = sales.filter((s) => s.date === dStr)
      data.push({
        day: i,
        Pedidos: daySales.reduce((acc, s) => acc + s.orders, 0),
        Faturamento: daySales.reduce((acc, s) => acc + s.revenue, 0),
      })
    }
    return data
  }, [sales, monthParam])

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

  if (loading)
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SyncSaiposButton onSuccess={loadData} />
      </div>
      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento Atual
            </CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Projeção: {formatCurrency(metrics.projRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Pedidos
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Projeção: {metrics.projOrders} pedidos
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.ticket)}</div>
            <p className="text-xs text-muted-foreground mt-1">Geral do mês</p>
          </CardContent>
        </Card>

        <Card className="shadow-subtle hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Meta Atingida
            </CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.progress.toFixed(1)}%</div>
            <Progress value={Math.min(metrics.progress, 100)} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Total de Delivery KPI */}
      <Card className="shadow-subtle border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-primary">Total de Delivery</CardTitle>
          <Bike className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pedidos</p>
              <div className="text-xl font-bold text-foreground">{metrics.deliveryOrders}</div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Faturamento</p>
              <div className="text-xl font-bold text-foreground">
                {formatCurrency(metrics.deliveryRevenue)}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tkt Médio</p>
              <div className="text-xl font-bold text-foreground">
                {formatCurrency(metrics.deliveryTicket)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-subtle">
          <CardHeader>
            <CardTitle className="text-base">Faturamento x Meta por Canal</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartContainer
              config={{
                Realizado: { color: 'hsl(var(--primary))' },
                Meta: { color: 'hsl(var(--muted-foreground))' },
              }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 0, left: 30, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => `R$${v / 1000}k`} fontSize={12} />
                  <YAxis dataKey="name" type="category" width={80} fontSize={12} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(val) => formatCurrency(val as number)} />
                    }
                  />
                  <Bar dataKey="Realizado" radius={[0, 4, 4, 0]}>
                    {barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-subtle">
          <CardHeader>
            <CardTitle className="text-base">Evolução Diária de Pedidos</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ChartContainer
              config={{ Pedidos: { color: 'hsl(var(--primary))' } }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={lineChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="Pedidos"
                    stroke="var(--color-Pedidos)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-subtle overflow-hidden">
        <CardHeader className="bg-muted/30 pb-4 border-b border-border">
          <CardTitle className="text-base">Resumo do Mês</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium text-right">Pedidos</th>
                <th className="px-4 py-3 font-medium text-right">Faturamento</th>
                <th className="px-4 py-3 font-medium text-right">Tkt Médio</th>
                <th className="px-4 py-3 font-medium text-right">Projeção Fechto Mês</th>
                <th className="px-4 py-3 font-medium text-right">% Meta (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CHANNELS.map((ch) => {
                const stat = metrics.channelStats[ch]
                const tkt = stat.orders > 0 ? stat.revenue / stat.orders : 0
                const perc = stat.goalRevenue > 0 ? (stat.revenue / stat.goalRevenue) * 100 : 0
                return (
                  <tr key={ch} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{ch}</td>
                    <td className="px-4 py-3 text-right">{stat.orders}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(stat.revenue)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(tkt)}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(metrics.channelProjections[ch])}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          perc >= 100
                            ? 'bg-emerald-100 text-emerald-800'
                            : perc >= 80
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800',
                        )}
                      >
                        {perc.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-muted/50 font-semibold border-t-2 border-border text-foreground">
                <td className="px-4 py-4">Total Geral</td>
                <td className="px-4 py-4 text-right">{metrics.totalOrders}</td>
                <td className="px-4 py-4 text-right">{formatCurrency(metrics.totalRevenue)}</td>
                <td className="px-4 py-4 text-right">{formatCurrency(metrics.ticket)}</td>
                <td className="px-4 py-4 text-right">{formatCurrency(metrics.totalProjection)}</td>
                <td className="px-4 py-4 text-right">{metrics.progress.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
