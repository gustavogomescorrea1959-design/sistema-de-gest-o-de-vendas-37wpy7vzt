import type { RecordModel } from 'pocketbase'

export const CHANNELS = [
  'Loja / Restaurante',
  'Central de Pedidos',
  'iFood',
  'Cardápio Web',
  '99Food',
  'WhatsApp',
  'Telefone',
] as const

export type Channel = (typeof CHANNELS)[number]

export interface Goal extends RecordModel {
  channel: Channel
  goal_orders: number
  goal_revenue: number
  standard_ticket: number
  period: string
  notes: string
}

export interface DailySale extends RecordModel {
  date: string
  channel: Channel
  orders: number
  revenue: number
  average_ticket: number
}
