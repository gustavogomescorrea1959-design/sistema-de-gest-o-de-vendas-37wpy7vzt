routerAdd(
  'POST',
  '/backend/v1/sync-saipos',
  (e) => {
    var token = $os.getenv('SAIPOS_API_TOKEN') || ''
    if (!token) {
      try {
        var settingsRec = $app.findFirstRecordByData('settings', 'key', 'SAIPOS_API_TOKEN')
        if (settingsRec) {
          token = settingsRec.getString('value')
        }
      } catch (_) {}
    }
    if (!token) {
      return e.json(500, {
        error: 'Token Saipos não configurado. Defina o secret SAIPOS_API_TOKEN.',
      })
    }
    token = token.replace(/^Bearer\s+/i, '').trim()
    var body = e.requestInfo().body || {}

    var startDateRaw = body.startDate || ''
    var endDateRaw = body.endDate || ''

    if (!startDateRaw || !endDateRaw) {
      return e.json(400, { error: 'startDate e endDate são obrigatórios.' })
    }

    var pFilterDateStart = startDateRaw + ' 00:00:00'
    var pFilterDateEnd = endDateRaw + ' 23:59:59'

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

    // Realiza a requisição à API do Saipos com retry automático (até 3 tentativas)
    // quando a resposta indicar erro PGRST003 ("Timed out acquiring connection
    // from connection pool"). Aguarda 2s entre tentativas.
    function requestWithRetry(url, timeoutSecs) {
      var MAX_ATTEMPTS = 3
      var res = null
      for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        res = null
        try {
          res = $http.send({
            url: url,
            method: 'GET',
            headers: {
              accept: 'application/json',
              Authorization: 'Bearer ' + token,
            },
            timeout: timeoutSecs,
          })
        } catch (err) {
          var errMsg = err && err.message ? String(err.message) : ''
          var lowErr = errMsg.toLowerCase()
          if (
            lowErr.indexOf('deadline') >= 0 ||
            lowErr.indexOf('timeout') >= 0 ||
            lowErr.indexOf('context deadline') >= 0
          ) {
            return {
              errorResponse: e.json(504, {
                error:
                  'Timeout: a API do Saipos demorou demais para responder. Tente um período menor ou tente novamente.',
              }),
            }
          }
          return {
            errorResponse: e.json(503, {
              error: 'Erro de conexão com a API do Saipos: ' + errMsg,
            }),
          }
        }

        // Detecta erro de pool de conexão do PostgREST (PGRST003)
        var isPoolTimeout = false
        try {
          var rj = res.json
          if (rj && rj.code === 'PGRST003') isPoolTimeout = true
        } catch (_) {}
        if (!isPoolTimeout) {
          var rawBody = ''
          try {
            if (res.body) rawBody = new TextDecoder().decode(res.body)
          } catch (_) {}
          if (
            rawBody.indexOf('PGRST003') >= 0 ||
            rawBody.indexOf('Timed out acquiring connection') >= 0
          ) {
            isPoolTimeout = true
          }
        }

        if (isPoolTimeout) {
          if (attempt < MAX_ATTEMPTS - 1) {
            $app
              .logger()
              .warn(
                'Saipos PGRST003 (pool de conexão) na tentativa ' +
                  (attempt + 1) +
                  '/' +
                  MAX_ATTEMPTS +
                  ' — retryando em 2s',
              )
            sleep(2000)
            continue
          }
          $app
            .logger()
            .error('Saipos PGRST003: pool de conexão esgotado após ' + MAX_ATTEMPTS + ' tentativas')
          return {
            errorResponse: e.json(503, {
              error:
                'A API do Saipos está indisponível no momento (PGRST003: Timed out acquiring connection from connection pool). Tente novamente em alguns instantes.',
              code: 'PGRST003',
              retries: MAX_ATTEMPTS,
            }),
          }
        }

        return { res: res }
      }
      return { res: res }
    }

    var allRecords = []
    var offset = 0
    var limit = 300
    var hasMore = true
    var maxPages = 500

    for (var page = 0; page < maxPages && hasMore; page++) {
      var apiUrl =
        'https://data.saipos.io/v1/sales_status_histories' +
        '?p_date_column_filter=shift_date' +
        '&p_filter_date_start=' +
        encodeURIComponent(pFilterDateStart) +
        '&p_filter_date_end=' +
        encodeURIComponent(pFilterDateEnd) +
        '&p_limit=' +
        limit +
        '&p_offset=' +
        offset

      var requestResult = requestWithRetry(apiUrl, 60)
      if (requestResult.errorResponse) return requestResult.errorResponse
      var res = requestResult.res

      if (res.statusCode === 401 || res.statusCode === 403) {
        return e.json(401, { error: 'Token Saipos Inválido' })
      }
      if (res.statusCode === 404) {
        $app.logger().error('Endpoint não encontrado na API do Saipos', 'url', apiUrl)
        return e.json(404, { error: 'Endpoint não encontrado na API do Saipos: ' + apiUrl })
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
      var items =
        data.data || data.items || data.sales || data.vendas || data.results || data.rows || []
      if (!Array.isArray(items)) {
        if (Array.isArray(data)) items = data
        else items = []
      }

      if (items.length === 0) {
        hasMore = false
        break
      }

      allRecords = allRecords.concat(items)

      if (items.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }
    }

    var groups = {}
    var skipped = 0

    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]
      var canceled =
        rec.cancelado ||
        rec.canceled ||
        rec.cancelado_sn ||
        rec.está_cancelado ||
        rec.is_canceled ||
        ''
      if (
        canceled === true ||
        canceled === 'S' ||
        canceled === 'SIM' ||
        canceled === 'true' ||
        canceled === 'yes' ||
        canceled === 1
      )
        continue

      var rawDate = rec.shift_date || rec.data_venda || rec.date || rec.data || rec.sale_date || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      var rawCh =
        rec.canal_venda ||
        rec.channel ||
        rec.canal ||
        rec.origem ||
        rec.sales_channel ||
        rec.channel_name ||
        ''
      var channel = mapChannel(rawCh)
      if (!channel) {
        skipped++
        continue
      }

      var total = parseNum(
        rec.valor_total || rec.total || rec.valor || rec.receita || rec.amount || rec.revenue || 0,
      )
      var recOrders = parseNum(
        rec.quantidade_pedidos || rec.orders || rec.quantidade || rec.order_count || 0,
      )
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
