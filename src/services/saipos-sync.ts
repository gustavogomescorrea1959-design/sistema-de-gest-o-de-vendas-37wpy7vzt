import pb from '@/lib/pocketbase/client'

export interface SyncSaiposResult {
  success: boolean
  insertedCount: number
  updatedCount: number
  skippedCount: number
}

export interface SaiposTokenTest {
  valid: boolean
  message: string
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
