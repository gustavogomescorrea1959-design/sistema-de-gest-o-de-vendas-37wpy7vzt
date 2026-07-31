import pb from '@/lib/pocketbase/client'

export const getSetting = async (key: string): Promise<string> => {
  try {
    const record = await pb.collection('settings').getFirstListItem(`key = "${key}"`)
    return record.value || ''
  } catch {
    return ''
  }
}

export const saveSetting = async (key: string, value: string): Promise<void> => {
  try {
    const record = await pb.collection('settings').getFirstListItem(`key = "${key}"`)
    await pb.collection('settings').update(record.id, { value })
  } catch {
    await pb.collection('settings').create({ key, value })
  }
}
