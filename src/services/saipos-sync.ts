import pb from '@/lib/pocketbase/client'

export interface SaiposDiagnostic {
  statusCode?: number
  responseType?: string
  topLevelKeys?: string[]
  itemsLength?: number
  firstItemKeys?: string[]
  historyKeys?: string[]
  totalHistories?: number
  rawBodySnippet?: string
  /** Início do primeiro segmento de 15 dias consultado (ISO 8601). */
  segmentStart?: string
  /** Fim do primeiro segmento de 15 dias consultado (ISO 8601). */
  segmentEnd?: string
}

export interface SyncSaiposResult {
  success: boolean
  insertedCount: number
  updatedCount: number
  skippedCount: number
  /** Vendas ignoradas por pertencerem a outra loja (id_store != 29090). */
  skippedOtherStoreCount?: number
  /** Quantos segmentos de até 15 dias o período foi dividido. */
  segments?: number
  /** Total de vendas brutas retornadas pelo /v1/search_sales. */
  totalSales?: number
  diagnostic?: SaiposDiagnostic | null
  // Present quando a sincronização extrai itens mas falha ao salvar por erro
  // de validação (ex.: revenue/average_ticket em branco).
  validationError?: boolean
  validationMessage?: string
  error?: string
}

export interface SaiposTokenTest {
  valid: boolean
  message: string
  statusCode?: number
  responseBody?: string
  requestUrl?: string
  data?: unknown
  diagnostic?: SaiposDiagnostic | null
  errorType?: 'timeout' | 'connection' | 'auth' | 'notfound' | 'rate' | 'other'
}

export async function syncSaipos(startDate: string, endDate: string): Promise<SyncSaiposResult> {
  return pb.send('/backend/v1/sync-saipos', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function testSaiposToken(): Promise<SaiposTokenTest> {
  return pb.send('/backend/v1/sync-saipos/test', { method: 'GET' })
}
