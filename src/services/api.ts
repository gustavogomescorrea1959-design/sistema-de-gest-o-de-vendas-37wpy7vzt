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
// faturamento por mês e canal.
export const getDailySalesByDateRange = async (
  startDate: string,
  endDate: string,
): Promise<DailySale[]> => {
  return pb.collection('daily_sales').getFullList<DailySale>({
    filter: `date >= "${startDate}" && date <= "${endDate}"`,
    sort: 'date',
  })
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
