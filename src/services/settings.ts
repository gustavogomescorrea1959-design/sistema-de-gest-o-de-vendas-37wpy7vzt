import pb from '@/lib/pocketbase/client'

export interface Setting {
  id: string
  key: string
  value: string
  created: string
  updated: string
}

export const getSetting = async (key: string): Promise<string | null> => {
  try {
    const record = await pb.collection('settings').getFirstListItem(`key = "${key}"`)
    return record.value
  } catch {
    return null
  }
}

export const updateSetting = async (key: string, value: string): Promise<void> => {
  try {
    const record = await pb.collection('settings').getFirstListItem(`key = "${key}"`)
    await pb.collection('settings').update(record.id, { value })
  } catch {
    await pb.collection('settings').create({ key, value })
  }
}

export const getSaiposToken = () => getSetting('SAIPOS_API_TOKEN')

export const updateSaiposToken = (token: string) => {
  const cleanToken = token.replace(/^Bearer\s+/i, '').trim()
  return updateSetting('SAIPOS_API_TOKEN', cleanToken)
}
