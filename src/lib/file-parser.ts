export interface ParsedRow {
  [key: string]: string
}

export interface ParsedFile {
  headers: string[]
  rows: ParsedRow[]
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(file)
  if (name.endsWith('.xlsx')) return parseXlsx(file)
  throw new Error('Formato não suportado. Use .csv ou .xlsx')
}

async function parseCsv(file: File): Promise<ParsedFile> {
  const text = await file.text()
  const delimiter = text.includes(';') ? ';' : ','
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0], delimiter)
  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter)
    const row: ParsedRow = {}
    headers.forEach((h, idx) => {
      row[h?.trim() || `col_${idx}`] = (values[idx] || '').trim()
    })
    rows.push(row)
  }
  return { headers, rows }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else inQuotes = !inQuotes
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

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer()
  const files = await unzip(buffer)

  const sharedStrings: string[] = []
  const ssFile = files.get('xl/sharedStrings.xml')
  if (ssFile) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(ssFile), 'text/xml')
    doc.querySelectorAll('si').forEach((si) => {
      let val = ''
      si.querySelectorAll('t').forEach((t) => {
        val += t.textContent || ''
      })
      sharedStrings.push(val)
    })
  }

  let sheetFile: Uint8Array | undefined
  for (const [name, data] of files) {
    if (name.match(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      sheetFile = data
      break
    }
  }
  if (!sheetFile) throw new Error('Planilha não encontrada no arquivo XLSX')

  const doc = new DOMParser().parseFromString(new TextDecoder().decode(sheetFile), 'text/xml')
  const rowEls = doc.querySelectorAll('row')
  let headers: string[] = []
  const rows: ParsedRow[] = []

  rowEls.forEach((rowEl, rowIdx) => {
    const cellMap: Record<number, string> = {}
    let maxCol = 0
    rowEl.querySelectorAll('c').forEach((cell) => {
      const ref = cell.getAttribute('r') || ''
      const colIdx = colToIndex(ref.match(/^[A-Z]+/)?.[0] || 'A')
      maxCol = Math.max(maxCol, colIdx)
      const type = cell.getAttribute('t') || ''
      const v = cell.querySelector('v')
      const val = v?.textContent || ''
      if (type === 's') cellMap[colIdx] = sharedStrings[parseInt(val)] || ''
      else if (type === 'inlineStr') cellMap[colIdx] = cell.querySelector('t')?.textContent || ''
      else cellMap[colIdx] = val
    })
    if (rowIdx === 0) {
      for (let c = 0; c <= maxCol; c++) headers.push(cellMap[c]?.trim() || `col_${c}`)
    } else {
      const row: ParsedRow = {}
      headers.forEach((h, idx) => {
        row[h] = cellMap[idx]?.trim() || ''
      })
      rows.push(row)
    }
  })

  return { headers, rows }
}

function colToIndex(col: string): number {
  let r = 0
  for (let i = 0; i < col.length; i++) r = r * 26 + (col.charCodeAt(i) - 64)
  return r - 1
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const view = new DataView(buffer)
  let offset = 0
  while (offset < buffer.byteLength - 4) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const compMethod = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 30, nameLen))
    const dataOffset = offset + 30 + nameLen + extraLen
    const compData = new Uint8Array(buffer, dataOffset, compSize)
    if (compMethod === 0) {
      files.set(name, compData)
    } else if (compMethod === 8) {
      const ds = new DecompressionStream('deflate-raw')
      const stream = new Blob([compData]).stream().pipeThrough(ds)
      const decompressed = await new Response(stream).arrayBuffer()
      files.set(name, new Uint8Array(decompressed))
    }
    offset = dataOffset + compSize
  }
  return files
}
