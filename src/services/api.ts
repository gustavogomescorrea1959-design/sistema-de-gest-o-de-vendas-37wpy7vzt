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
