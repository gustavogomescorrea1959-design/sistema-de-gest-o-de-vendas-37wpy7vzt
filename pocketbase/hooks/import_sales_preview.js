// @deps xlsx@0.18.5
routerAdd(
  'POST',
  '/backend/v1/import/sales/preview',
  (e) => {
    const XLSX = require('xlsx')
    const body = e.requestInfo().body || {}
    const data = body.data || ''

    if (!data) return e.badRequestError('No file data provided')

    let workbook
    try {
      workbook = XLSX.read(data, { type: 'base64' })
    } catch (err) {
      return e.badRequestError('Falha ao processar arquivo')
    }

    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return e.badRequestError('Nenhuma aba encontrada')

    const sheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    if (rows.length === 0) return e.badRequestError('Nenhuma linha de dados encontrada')

    const headers = Object.keys(rows[0])
    const columnMap = {
      date: headers.find((h) => h === 'Data da venda') || '',
      channel: headers.find((h) => h === 'Canal de venda') || '',
      orderType: headers.find((h) => h === 'Pedido') || '',
      revenue: headers.find((h) => h === 'Total') || '',
      cancelled: headers.find((h) => h.toLowerCase().includes('cancelado')) || '',
    }

    const normalizeChannel = function (ch) {
      const trimmed = String(ch || '').trim()
      if (trimmed === '') return ''
      const lower = trimmed.toLowerCase().replace(/\s+/g, ' ')
      if (lower === '99 food' || lower === '99food') return '99Food'
      if (lower === 'ifood') return 'iFood'
      if (lower === 'cardápio web' || lower === 'cardapio web') return 'Cardápio Web'
      if (lower === 'whatsapp') return 'WhatsApp'
      if (lower === 'telefone') return 'Telefone'
      if (lower === 'loja / restaurante' || lower === 'loja/restaurante')
        return 'Loja / Restaurante'
      if (lower === 'central de pedidos') return 'Central de Pedidos'
      return ''
    }

    const groups = {}
    let totalRows = 0
    let skippedRows = 0
    const skippedReasons = []

    rows.forEach(function (row, idx) {
      totalRows++

      const cancelledVal = String(row[columnMap.cancelled] || '')
        .trim()
        .toUpperCase()
      if (cancelledVal === 'S') {
        skippedRows++
        skippedReasons.push({ row: idx + 2, reason: 'Pedido cancelado' })
        return
      }

      const dateRaw = String(row[columnMap.date] || '').trim()
      const dateMatch = dateRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (!dateMatch) {
        skippedRows++
        skippedReasons.push({ row: idx + 2, reason: 'Data inválida ou ausente' })
        return
      }
      const dateStr = dateMatch[3] + '-' + dateMatch[2] + '-' + dateMatch[1]

      const channelRaw = String(row[columnMap.channel] || '').trim()
      let channel = normalizeChannel(channelRaw)

      if (!channel) {
        const pedido = String(row[columnMap.orderType] || '')
          .trim()
          .toLowerCase()
        if (
          pedido === 'ficha' ||
          pedido === 'salão' ||
          pedido === 'salao' ||
          pedido === 'balcão' ||
          pedido === 'balcao'
        ) {
          channel = 'Loja / Restaurante'
        } else {
          skippedRows++
          skippedReasons.push({ row: idx + 2, reason: 'Canal não identificado' })
          return
        }
      }

      let revenue = 0
      const revenueRaw = row[columnMap.revenue]
      if (typeof revenueRaw === 'number') {
        revenue = revenueRaw
      } else {
        revenue = parseFloat(String(revenueRaw || '0').replace(',', '.')) || 0
      }

      const key = dateStr + '|' + channel
      if (!groups[key]) {
        groups[key] = { date: dateStr, channel: channel, orders: 0, revenue: 0 }
      }
      groups[key].orders++
      groups[key].revenue += revenue
    })

    const groupList = []
    for (const key in groups) {
      const g = groups[key]
      groupList.push({
        date: g.date,
        channel: g.channel,
        orders: g.orders,
        revenue: Math.round(g.revenue * 100) / 100,
        average_ticket: g.orders > 0 ? Math.round((g.revenue / g.orders) * 100) / 100 : 0,
      })
    }

    return e.json(200, {
      columns: columnMap,
      totalRows: totalRows,
      skippedRows: skippedRows,
      skippedReasons: skippedReasons.slice(0, 50),
      groups: groupList,
    })
  },
  $apis.requireAuth(),
)
