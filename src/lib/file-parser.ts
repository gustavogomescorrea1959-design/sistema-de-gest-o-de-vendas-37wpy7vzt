export interface ParsedSaleRow {
  date: string
  channel: string
  total: number
  canceled: boolean
}

const CHANNEL_MAP: Record<string, string> = {
  ifood: 'iFood',
  'cardápio web': 'Cardápio Web',
  'cardapio web': 'Cardápio Web',
  '99food': '99Food',
  '99 food': '99Food',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  'central de pedidos': 'Central de Pedidos',
}

function mapChannel(raw: string): string {
  const c = (raw || '').trim().toLowerCase()
  return CHANNEL_MAP[c] || 'Loja / Restaurante'
}

function parseDate(raw: string): string {
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return isoMatch[0]
  return raw.trim()
}

function parseNumber(raw: string): number {
  const cleaned = (raw || '').trim()
  if (!cleaned) return 0
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  return semicolons > commas ? ';' : ','
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function findColumnIndex(headers: string[], patterns: string[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h === pattern)
    if (idx !== -1) return idx
  }
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => h.includes(pattern))
    if (idx !== -1) return idx
  }
  return -1
}

export async function parseSalesFile(file: File): Promise<ParsedSaleRow[]> {
  const isCSV =
    file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === ''
  if (!isCSV) {
    throw new Error(
      'Formato não suportado. Exporte sua planilha como CSV (.csv) e tente novamente.',
    )
  }

  const text = await file.text()
  const cleaned = text.replace(/^\uFEFF/, '')
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    throw new Error('Arquivo vazio ou sem dados.')
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCSVLine(lines[0], delimiter).map((h) => h.toLowerCase().trim())

  const channelIdx = findColumnIndex(headers, ['canal de venda', 'canal'])
  const dateIdx = findColumnIndex(headers, ['data da venda', 'data'])
  const totalIdx = findColumnIndex(headers, ['total'])
  const canceledIdx = findColumnIndex(headers, ['está cancelado', 'cancelado'])

  if (dateIdx === -1 || totalIdx === -1) {
    throw new Error(
      'Colunas obrigatórias não encontradas. Verifique se o arquivo possui "Data da venda" e "Total".',
    )
  }

  const rows: ParsedSaleRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i], delimiter)
    const canceledRaw = canceledIdx !== -1 ? (cols[canceledIdx] || '').trim().toUpperCase() : 'N'
    const canceled = canceledRaw === 'S' || canceledRaw === 'SIM' || canceledRaw === 'TRUE'
    const total = parseNumber(cols[totalIdx] || '0')
    const channelRaw = channelIdx !== -1 ? (cols[channelIdx] || '').trim() : ''
    const dateRaw = cols[dateIdx] || ''

    rows.push({
      date: parseDate(dateRaw),
      channel: mapChannel(channelRaw),
      total,
      canceled,
    })
  }

  return rows
}
