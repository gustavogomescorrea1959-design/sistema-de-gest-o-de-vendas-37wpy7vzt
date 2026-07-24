import type { Channel } from '@/types'
import { getDailySalesByDate, saveDailySale } from '@/services/api'
import type { ParsedRow } from '@/lib/file-parser'

const CHANNEL_MAP: Record<string, Channel> = {
  ifood: 'iFood',
  'cardápio web': 'Cardápio Web',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  '99food': '99Food',
  '99 food': '99Food',
  'central de pedidos': 'Central de Pedidos',
  'loja / restaurante': 'Loja / Restaurante',
}

const STORE_TYPES = ['ficha', 'salão', 'salao', 'balcão', 'balcao']

export interface ColumnMapping {
  dateCol: string
  channelCol: string
  pedidoCol: string
  revenueCol: string
  cancelledCol: string
}

export function detectColumns(headers: string[]): ColumnMapping {
  const find = (kw: string) => headers.find((h) => h.toLowerCase().includes(kw)) || ''
  return {
    dateCol: find('data da venda'),
    channelCol: find('canal de venda'),
    pedidoCol: headers.find((h) => h.toLowerCase().trim() === 'pedido') || '',
    revenueCol: headers.find((h) => h.toLowerCase().trim() === 'total') || '',
    cancelledCol: find('cancelado'),
  }
}

function mapChannel(rawChannel: string, pedido: string): Channel | null {
  const ch = rawChannel.trim().toLowerCase()
  if (ch) return CHANNEL_MAP[ch] || null
  const p = pedido.trim().toLowerCase()
  return STORE_TYPES.includes(p) ? 'Loja / Restaurante' : null
}

function parseDate(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

function parseNumber(str: string): number {
  const cleaned = str.trim().replace(/[R$\s]/g, '')
  if (!cleaned) return 0
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (cleaned.includes(',')) return parseFloat(cleaned.replace(',', '.')) || 0
  return parseFloat(cleaned) || 0
}

export interface ImportResult {
  totalRows: number
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export async function importSales(rows: ParsedRow[], cols: ColumnMapping): Promise<ImportResult> {
  const result: ImportResult = {
    totalRows: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  type Group = { date: string; channel: Channel; orders: number; revenue: number }
  const groups: Record<string, Group> = {}

  for (const row of rows) {
    const cancelled = (row[cols.cancelledCol] || '').trim().toUpperCase()
    if (cancelled === 'S') {
      result.skipped++
      continue
    }

    const date = parseDate(row[cols.dateCol] || '')
    if (!date) {
      result.skipped++
      result.errors.push(`Data inválida: "${row[cols.dateCol] || ''}"`)
      continue
    }

    const channel = mapChannel(row[cols.channelCol] || '', row[cols.pedidoCol] || '')
    if (!channel) {
      result.skipped++
      result.errors.push(`Canal não identificado: Pedido "${row[cols.pedidoCol] || ''}"`)
      continue
    }

    const total = parseNumber(row[cols.revenueCol] || '0')
    const key = `${date}|${channel}`
    if (!groups[key]) groups[key] = { date, channel, orders: 0, revenue: 0 }
    groups[key].orders++
    groups[key].revenue += total
  }

  const byDate: Record<string, Group[]> = {}
  Object.values(groups).forEach((g) => {
    if (!byDate[g.date]) byDate[g.date] = []
    byDate[g.date].push(g)
  })

  for (const [date, dateGroups] of Object.entries(byDate)) {
    const existing = await getDailySalesByDate(date)
    for (const g of dateGroups) {
      const found = existing.find((r) => r.channel === g.channel)
      const avgTicket = g.orders > 0 ? Math.round((g.revenue / g.orders) * 100) / 100 : 0
      try {
        await saveDailySale({
          id: found?.id,
          date: g.date,
          channel: g.channel,
          orders: g.orders,
          revenue: Math.round(g.revenue * 100) / 100,
          average_ticket: avgTicket,
        })
        found ? result.updated++ : result.created++
      } catch {
        result.skipped++
        result.errors.push(`Erro ao salvar: ${g.date} - ${g.channel}`)
      }
    }
  }

  return result
}
