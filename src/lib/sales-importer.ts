import pb from '@/lib/pocketbase/client'
import type { ParsedSaleRow } from './file-parser'

export interface SalesPreviewGroup {
  date: string
  channel: string
  orders: number
  revenue: number
  average_ticket: number
}

export interface ImportResult {
  created: number
  updated: number
  total: number
}

export async function previewImport(rows: ParsedSaleRow[]): Promise<SalesPreviewGroup[]> {
  const result = await pb.send('/backend/v1/import/sales/preview', {
    method: 'POST',
    body: JSON.stringify({ rows }),
    headers: { 'Content-Type': 'application/json' },
  })
  return result.groups
}

export async function confirmImport(records: SalesPreviewGroup[]): Promise<ImportResult> {
  const result = await pb.send('/backend/v1/import/sales/confirm', {
    method: 'POST',
    body: JSON.stringify({ records }),
    headers: { 'Content-Type': 'application/json' },
  })
  return result
}
