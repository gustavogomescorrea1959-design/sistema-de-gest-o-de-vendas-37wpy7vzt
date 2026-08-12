import pb from '@/lib/pocketbase/client'

export interface SaiposDiagnostic {
  statusCode?: number
  responseType?: string
  topLevelKeys?: string[]
  itemsLength?: number
  rawBodySnippet?: string
}

export interface SyncSaiposResult {
  success: boolean
  insertedCount: number
  updatedCount: number
  skippedCount: number
  diagnostic?: SaiposDiagnostic | null
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
