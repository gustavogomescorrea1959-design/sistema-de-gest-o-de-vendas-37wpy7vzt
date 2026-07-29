routerAdd(
  'POST',
  '/backend/v1/sync-saipos',
  (e) => {
    var token = $secrets.get('SAIPOS_API_TOKEN')
    if (!token) {
      token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI5ZGMyZGM4My0wNTg4LTdhMzEtOGE1MS00NjQyMzdkMzM1OWUiLCJpYXQiOjE3ODUyNDM4NzZ9.mAsya8DaWs7CqTBfU8qHS8tJIpv8KUO9pbpFiHJWXdg'
    }

    var body = e.requestInfo().body || {}
    function pad(n) {
      return n < 10 ? '0' + n : '' + n
    }
    function fmtDate(d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    }
    var now = new Date()
    var endDate = body.endDate || fmtDate(now)
    var startD = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    var startDate = body.startDate || fmtDate(startD)

    var CHANNEL_MAP = {
      ifood: 'iFood',
      'i food': 'iFood',
      'i-food': 'iFood',
      'cardapio web': 'Cardápio Web',
      'cardápio web': 'Cardápio Web',
      cardapioweb: 'Cardápio Web',
      '99food': '99Food',
      '99 food': '99Food',
      '99foods': '99Food',
      whatsapp: 'WhatsApp',
      'whats app': 'WhatsApp',
      wpp: 'WhatsApp',
      telefone: 'Telefone',
      tel: 'Telefone',
      phone: 'Telefone',
      'central de pedidos': 'Central de Pedidos',
      'central pedidos': 'Central de Pedidos',
      central: 'Central de Pedidos',
      loja: 'Loja / Restaurante',
      restaurante: 'Loja / Restaurante',
      'loja / restaurante': 'Loja / Restaurante',
      balcao: 'Loja / Restaurante',
      balcão: 'Loja / Restaurante',
      mesa: 'Loja / Restaurante',
      salao: 'Loja / Restaurante',
      salão: 'Loja / Restaurante',
      presencial: 'Loja / Restaurante',
    }

    function mapChannel(raw) {
      var c = (raw || '').trim().toLowerCase()
      if (CHANNEL_MAP[c]) return CHANNEL_MAP[c]
      for (var k in CHANNEL_MAP) {
        if (c.indexOf(k) >= 0 || k.indexOf(c) >= 0) return CHANNEL_MAP[k]
      }
      return ''
    }

    function parseDateStr(raw) {
      var s = (raw || '').trim()
      var m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) return m[3] + '-' + m[2] + '-' + m[1]
      var im = s.match(/(\d{4})-(\d{2})-(\d{2})/)
      if (im) return im[0].substring(0, 10)
      return ''
    }

    function parseNum(raw) {
      if (typeof raw === 'number') return raw
      var s = (raw || '').toString().trim()
      if (!s) return 0
      s = s.replace(/[R$\s]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      return parseFloat(s) || 0
    }

    var allRecords = []
    var page = 1
    var hasMore = true
    var maxPages = 100

    while (hasMore && page <= maxPages) {
      var apiUrl =
        'https://data-api.saipos.com/v1/sales?startDate=' +
        startDate +
        '&endDate=' +
        endDate +
        '&page=' +
        page +
        '&perPage=100'
      var res
      try {
        res = $http.send({
          url: apiUrl,
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          timeout: 30,
        })
      } catch (err) {
        return e.json(503, { error: 'Erro de conexão com a API do Saipos: ' + err.message })
      }

      if (res.statusCode === 401 || res.statusCode === 403) {
        return e.json(401, { error: 'Token do Saipos inválido ou expirado' })
      }
      if (res.statusCode === 429) {
        var retryAfter = res.headers['Retry-After'] || res.headers['retry-after'] || '60'
        return e.json(429, {
          error: 'Limite de requisições atingido. Tente novamente em ' + retryAfter + ' segundos.',
          retryAfter: parseInt(retryAfter),
        })
      }
      if (res.statusCode !== 200) {
        return e.json(502, { error: 'Erro na API do Saipos (HTTP ' + res.statusCode + ')' })
      }

      var data = res.json || {}
      var items = data.data || data.items || data.sales || data.vendas || data.results || []
      if (!Array.isArray(items)) items = []
      allRecords = allRecords.concat(items)

      var pag = data.pagination || data.meta || data.paginacao || {}
      var totalPages =
        pag.totalPages || pag.total_pages || pag.last_page || pag.total_paginas || pag.lastPage || 1
      hasMore = page < totalPages
      page++
    }

    var groups = {}
    var skipped = 0
    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]
      var canceled = rec.cancelado || rec.canceled || rec.cancelado_sn || rec.está_cancelado || ''
      if (
        canceled === true ||
        canceled === 'S' ||
        canceled === 'SIM' ||
        canceled === 'true' ||
        canceled === 'yes'
      )
        continue

      var rawDate = rec.data_venda || rec.date || rec.data || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      var rawCh = rec.canal_venda || rec.channel || rec.canal || rec.origem || ''
      var channel = mapChannel(rawCh)
      if (!channel) {
        skipped++
        continue
      }

      var total = parseNum(rec.valor_total || rec.total || rec.valor || rec.receita || 0)
      var recOrders = parseNum(rec.quantidade_pedidos || rec.orders || rec.quantidade || 0)
      var key = dateStr + '|' + channel
      if (!groups[key]) {
        groups[key] = { date: dateStr, channel: channel, orders: 0, revenue: 0 }
      }
      groups[key].orders += recOrders > 0 ? recOrders : 1
      groups[key].revenue += total
    }

    var collection = $app.findCollectionByNameOrId('daily_sales')
    var inserted = 0
    var updated = 0
    var keys = Object.keys(groups)
    for (var j = 0; j < keys.length; j++) {
      var g = groups[keys[j]]
      var avg = g.orders > 0 ? Math.round((g.revenue / g.orders) * 100) / 100 : 0
      var filter = "date = '" + g.date + "' && channel = '" + g.channel + "'"
      var existing = []
      try {
        existing = $app.findRecordsByFilter('daily_sales', filter, '', 1, 0)
      } catch (_) {}

      if (existing.length > 0) {
        existing[0].set('orders', g.orders)
        existing[0].set('revenue', Math.round(g.revenue * 100) / 100)
        existing[0].set('average_ticket', avg)
        $app.save(existing[0])
        updated++
      } else {
        var nr = new Record(collection)
        nr.set('date', g.date)
        nr.set('channel', g.channel)
        nr.set('orders', g.orders)
        nr.set('revenue', Math.round(g.revenue * 100) / 100)
        nr.set('average_ticket', avg)
        $app.save(nr)
        inserted++
      }
    }

    return e.json(200, {
      success: true,
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: skipped,
    })
  },
  $apis.requireAuth(),
)
