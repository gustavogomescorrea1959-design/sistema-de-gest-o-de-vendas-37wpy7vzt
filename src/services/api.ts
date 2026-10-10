import pb from '@/lib/pocketbase/client'
import { Goal, DailySale } from '@/types'

export const getGoals = async (): Promise<Goal[]> => {
  return pb.collection('goals').getFullList<Goal>({ sort: 'created' })
}

export const updateGoal = async (id: string, data: Partial<Goal>) => {
  return pb.collection('goals').update<Goal>(id, data)
}

export const getDailySalesByMonth = async (monthPrefix: string): Promise<DailySale[]> => {
  return pb.collection('daily_sales').getFullList<DailySale>({
    filter: `date >= "${monthPrefix}-01" && date <= "${monthPrefix}-31"`,
    sort: 'date',
  })
}

export const getDailySalesByDate = async (date: string): Promise<DailySale[]> => {
  return pb.collection('daily_sales').getFullList<DailySale>({
    filter: `date = "${date}"`,
  })
}

// Histórico: todas as vendas diárias dentro de um intervalo de datas
// (inclusive). Usado pelo dashboard Histórico (jan–ago 2026) para agrupar
// faturamento por mês e canal. Usa paginação manual com batch de 500 registros
// e delay de 100ms para evitar HTTP 429 (rate limiting do PocketBase).
export const getDailySalesByDateRange = async (
  startDate: string,
  endDate: string,
): Promise<DailySale[]> => {
  const records: DailySale[] = []
  const perPage = 500
  let page = 1
  let hasMore = true

  while (hasMore) {
    try {
      const res = await pb.collection('daily_sales').getList<DailySale>(page, perPage, {
        filter: `date >= "${startDate}" && date <= "${endDate}"`,
        sort: 'date',
      })
      records.push(...res.items)
      if (res.items.length < perPage || page >= res.totalPages) {
        hasMore = false
      } else {
        page++
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 429) {
        // Se atingir 429, aguarda 1 segundo e tenta a mesma página novamente
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }
      throw err
    }
  }

  return records
}
export const saveDailySale = async (data: Partial<DailySale>) => {
  if (data.id) {
    return pb.collection('daily_sales').update<DailySale>(data.id, data)
  }
  return pb.collection('daily_sales').create<DailySale>(data)
}

export const deleteDailySalesByDate = async (date: string) => {
  const records = await getDailySalesByDate(date)
  await Promise.all(records.map((r) => pb.collection('daily_sales').delete(r.id)))
}

export interface ImportPreviewResult {
  columns: Record<string, string>
  totalRows: number
  skippedRows: number
  skippedReasons: Array<{ row: number; reason: string }>
  groups: Array<{
    date: string
    channel: string
    orders: number
    revenue: number
    average_ticket: number
  }>
}

export interface ImportSummary {
  created: number
  updated: number
  errors: Array<{ date: string; channel: string; error: string }>
}

export const previewSalesImport = async (
  filename: string,
  data: string,
): Promise<ImportPreviewResult> => {
  return pb.send('/backend/v1/import/sales/preview', {
    method: 'POST',
    body: JSON.stringify({ filename, data }),
    headers: { 'Content-Type': 'application/json' },
  })
}

export const confirmSalesImport = async (
  groups: ImportPreviewResult['groups'],
): Promise<ImportSummary> => {
  return pb.send('/backend/v1/import/sales/confirm', {
    method: 'POST',
    body: JSON.stringify({ groups }),
    headers: { 'Content-Type': 'application/json' },
  })
}
