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

    // --- Helpers (tudo inline — o JSVM não enxerga declarações de top-level) ---

    function pad2(n) {
      n = String(n)
      return n.length < 2 ? '0' + n : n
    }

    // Converte "YYYY-MM-DD" (ou Date) em um objeto Date em UTC meia-noite,
    // para podermos iterar dias sem sofrer com fuso local.
    function parseStartDate(s) {
      var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/)
      if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      var d = new Date(s)
      if (!isNaN(d.getTime())) return d
      return null
    }

    // Formato ISO 8601 esperado pelo /v1/search_sales (ex: 2024-07-23T00:00:00).
    function toISO(d) {
      return (
        d.getUTCFullYear() +
        '-' +
        pad2(d.getUTCMonth() + 1) +
        '-' +
        pad2(d.getUTCDate()) +
        'T' +
        pad2(d.getUTCHours()) +
        ':' +
        pad2(d.getUTCMinutes()) +
        ':' +
        pad2(d.getUTCSeconds())
      )
    }

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
      if (!c) return ''
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

    // Extrai o array de items da resposta da Saipos, tentando múltiplos níveis
    // de aninhamento comuns em APIs REST (PostgREST, etc.). O /v1/search_sales
    // retorna um array direto no topo, mas mantemos a flexibilidade.
    function extractItems(json) {
      if (Array.isArray(json)) return json
      if (!json || typeof json !== 'object') return []
      var candidates = [
        json.data && json.data.data,
        json.data && json.data.results,
        json.data && json.data.items,
        json.data,
        json.items,
        json.results,
        json.sales,
        json.vendas,
        json.rows,
      ]
      for (var i = 0; i < candidates.length; i++) {
        if (Array.isArray(candidates[i])) return candidates[i]
      }
      var keys = Object.keys(json)
      for (var k = 0; k < keys.length; k++) {
        if (Array.isArray(json[keys[k]])) return json[keys[k]]
      }
      return []
    }

    // Realiza a requisição à API do Saipos com retry automático (até 3
    // tentativas) quando a resposta indicar erro PGRST003 ("Timed out
    // acquiring connection from connection pool"). Aguarda 2s entre tentativas.
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

    // Faz UMA chamada paginada ao /v1/search_sales para um intervalo de até
    // 15 dias (startISO..endISO em ISO 8601). Retorna { items, diagnostic }.
    function fetchSegment(startISO, endISO) {
      var allItems = []
      var offset = 0
      var limit = 1000
      var hasMore = true
      var maxPages = 500
      var segDiagnostic = null

      for (var page = 0; page < maxPages && hasMore; page++) {
        var apiUrl =
          'https://data.saipos.io/v1/search_sales' +
          '?p_date_column_filter=shift_date' +
          '&p_filter_date_start=' +
          encodeURIComponent(startISO) +
          '&p_filter_date_end=' +
          encodeURIComponent(endISO) +
          '&p_limit=' +
          limit +
          '&p_offset=' +
          offset

        var requestResult = requestWithRetry(apiUrl, 60)
        if (requestResult.errorResponse) return { errorResponse: requestResult.errorResponse }
        var res = requestResult.res

        if (res.statusCode === 401 || res.statusCode === 403) {
          return { errorResponse: e.json(401, { error: 'Token Saipos Inválido' }) }
        }
        if (res.statusCode === 404) {
          $app.logger().error('Endpoint não encontrado na API do Saipos', 'url', apiUrl)
          return {
            errorResponse: e.json(404, {
              error: 'Endpoint não encontrado na API do Saipos: ' + apiUrl,
            }),
          }
        }
        if (res.statusCode === 429) {
          var retryAfter = res.headers['Retry-After'] || res.headers['retry-after'] || '60'
          return {
            errorResponse: e.json(429, {
              error:
                'Limite de requisições atingido. Tente novamente em ' + retryAfter + ' segundos.',
              retryAfter: parseInt(retryAfter),
            }),
          }
        }
        if (res.statusCode === 400) {
          // Período inválido (ex: > 15 dias) ou outro erro de validação da API.
          var b400 = ''
          try {
            if (res.body) b400 = new TextDecoder().decode(res.body).substring(0, 500)
          } catch (_) {}
          $app.logger().error('Saipos 400 no segmento ' + startISO + '..' + endISO + ': ' + b400)
          return {
            errorResponse: e.json(502, {
              error:
                'A API do Saipos rejeitou o período (HTTP 400). Verifique se o intervalo é válido. Detalhe: ' +
                b400,
            }),
          }
        }
        if (res.statusCode !== 200) {
          return {
            errorResponse: e.json(502, {
              error: 'Erro na API do Saipos (HTTP ' + res.statusCode + ')',
            }),
          }
        }

        var items = extractItems(res.json)

        // Diagnóstico da primeira página deste segmento.
        if (page === 0) {
          var rj0 = res.json
          var rjType0 = Array.isArray(rj0) ? 'array' : rj0 === null ? 'null' : typeof rj0
          var topKeys0 =
            rj0 && typeof rj0 === 'object' && !Array.isArray(rj0) ? Object.keys(rj0) : []
          var rawSnippet0 = ''
          if (items.length === 0) {
            try {
              if (res.body) rawSnippet0 = new TextDecoder().decode(res.body).substring(0, 500)
            } catch (_) {}
          }
          segDiagnostic = {
            statusCode: res.statusCode,
            responseType: rjType0,
            topLevelKeys: topKeys0,
            itemsLength: items.length,
            firstItemKeys: items.length > 0 ? Object.keys(items[0]) : [],
            segmentStart: startISO,
            segmentEnd: endISO,
            rawBodySnippet: rawSnippet0,
          }
          $app.logger().warn('Saipos sync diagnóstico: ' + JSON.stringify(segDiagnostic))
        }

        if (items.length === 0) {
          hasMore = false
          break
        }

        allItems = allItems.concat(items)

        if (items.length < limit) {
          hasMore = false
        } else {
          offset += limit
        }
      }

      return { items: allItems, diagnostic: segDiagnostic }
    }
    // (errorResponse devolvido diretamente nos ramos de erro acima)

    // --- Segmentação do período em chunks de no máximo 15 dias ---
    // O /v1/search_sales rejeita períodos maiores que 15 dias, então quebramos
    // o intervalo solicitado em segmentos contíguos de 15 dias cada.
    var startD = parseStartDate(startDateRaw)
    var endD = parseStartDate(endDateRaw)
    if (!startD || !endD) {
      return e.json(400, {
        error: 'Formato de data inválido. Use YYYY-MM-DD (ex: 2024-07-01).',
      })
    }
    if (endD.getTime() < startD.getTime()) {
      return e.json(400, { error: 'endDate deve ser maior ou igual a startDate.' })
    }

    var MAX_DAYS = 15
    var DAY_MS = 24 * 60 * 60 * 1000
    var segments = []
    var cursor = new Date(startD.getTime())
    var finalEnd = new Date(endD.getTime())
    while (cursor.getTime() <= finalEnd.getTime()) {
      var segEnd = new Date(cursor.getTime() + (MAX_DAYS - 1) * DAY_MS)
      if (segEnd.getTime() > finalEnd.getTime()) segEnd = new Date(finalEnd.getTime())
      segments.push({ start: new Date(cursor.getTime()), end: new Date(segEnd.getTime()) })
      cursor = new Date(segEnd.getTime() + DAY_MS)
    }

    $app
      .logger()
      .info(
        'Saipos sync: período ' +
          startDateRaw +
          '..' +
          endDateRaw +
          ' dividido em ' +
          segments.length +
          ' segmento(s) de até ' +
          MAX_DAYS +
          ' dias',
      )

    var allRecords = []
    var firstPageDiagnostic = null

    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si]
      var startISO = toISO(seg.start)
      var endISO = toISO(
        new Date(seg.end.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000),
      )
      var segResult = fetchSegment(startISO, endISO)
      if (segResult.errorResponse) return segResult.errorResponse
      allRecords = allRecords.concat(segResult.items)
      if (firstPageDiagnostic === null) firstPageDiagnostic = segResult.diagnostic
    }

    // --- Mapeamento da resposta para daily_sales ---
    // O /v1/search_sales retorna um array de vendas no formato plano
    // (shift_date, total_amount, canceled, partner_sale, id_sale_type, ...).
    // Cada venda vira UMA entrada (não há mais array `histories`). Mantemos
    // compatibilidade: se um item trouxer `histories`, processamos cada um.
    var groups = {}
    var skipped = 0
    var totalHistories = 0
    var firstHistoryKeys = null

    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]

      // Data do turno (shift_date) — recomendado pela Saipos para filtros por dia.
      var rawDate = rec.shift_date || rec.data_venda || rec.date || rec.data || rec.sale_date || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      // Cancelamento vem como "Y"/"N" no search_sales.
      var recCanceled = rec.canceled || rec.cancelado || rec.canceled_sn || rec.is_canceled || ''
      var recIsCanceled =
        recCanceled === true ||
        recCanceled === 'Y' ||
        recCanceled === 'y' ||
        recCanceled === 'S' ||
        recCanceled === 'SIM' ||
        recCanceled === 'true' ||
        recCanceled === 'yes' ||
        recCanceled === 1
      if (recIsCanceled) continue

      var histories = Array.isArray(rec.histories) ? rec.histories : null
      if (histories) {
        totalHistories += histories.length
        if (firstHistoryKeys === null && histories.length > 0) {
          firstHistoryKeys = Object.keys(histories[0])
        }
      }

      var entries = histories && histories.length > 0 ? histories : [rec]

      for (var h = 0; h < entries.length; h++) {
        var entry = entries[h]

        // Cancelamento no nível da entrada.
        var canceled =
          entry.canceled ||
          entry.cancelado ||
          entry.canceled_sn ||
          entry.está_cancelado ||
          entry.is_canceled ||
          ''
        if (
          canceled === true ||
          canceled === 'Y' ||
          canceled === 'y' ||
          canceled === 'S' ||
          canceled === 'SIM' ||
          canceled === 'true' ||
          canceled === 'yes' ||
          canceled === 1
        )
          continue

        // Canal: preferimos desc_store_partner (nome do parceiro/canal no
        // search_sales). Depois id_sale_type (1=Entrega,2=Retirada,3=Salão,
        // 4=Ficha) como fallback para classificar loja vs. entrega.
        var rawCh =
          (entry.partner_sale &&
            (entry.partner_sale.desc_store_partner || entry.partner_sale.partner)) ||
          entry.channel ||
          entry.channel_name ||
          entry.canal_venda ||
          entry.canal ||
          entry.origem ||
          entry.sales_channel ||
          ''
        var channel = mapChannel(rawCh)
        if (!channel) {
          // Fallback pelo tipo de venda.
          var st = entry.id_sale_type
          if (st === 1)
            channel = '' // entrega — tentaremos mapear abaixo
          else if (st === 2 || st === 3 || st === 4) channel = 'Loja / Restaurante'
        }
        if (!channel) {
          // Tenta extrair canal do nome do parceiro (desc_store_partner) de
          // forma mais flexível, ou marca como Desconhecido.
          var partnerName = ''
          if (entry.partner_sale && entry.partner_sale.desc_store_partner) {
            partnerName = entry.partner_sale.desc_store_partner
          }
          channel = mapChannel(partnerName) || 'Desconhecido'
        }

        // Valor: total_amount é o total da venda no search_sales. Pode estar
        // dentro do sub-objeto `totals` ou direto no item (formato antigo).
        var total = parseNum(
          (entry.totals && (entry.totals.total_amount || entry.totals.total)) ||
            entry.total_amount ||
            entry.revenue ||
            entry.total ||
            entry.amount ||
            entry.valor_total ||
            entry.valor ||
            entry.receita ||
            0,
        )
        // Pedidos: cada venda == 1 pedido no search_sales.
        var recOrders = parseNum(
          entry.orders ||
            entry.order_count ||
            entry.count ||
            entry.quantidade_pedidos ||
            entry.quantidade ||
            0,
        )
        var key = dateStr + '|' + channel

        if (!groups[key]) {
          groups[key] = { date: dateStr, channel: channel, orders: 0, revenue: 0 }
        }
        groups[key].orders += recOrders > 0 ? recOrders : 1
        groups[key].revenue += total
      }
    }

    $app
      .logger()
      .warn(
        'Saipos sync: total de ' +
          allRecords.length +
          ' vendas processadas em ' +
          segments.length +
          ' segmento(s). ' +
          totalHistories +
          ' histories (compat). Chaves do 1º history: ' +
          JSON.stringify(firstHistoryKeys || []),
      )

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

      try {
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
      } catch (saveErr) {
        var errMsg = saveErr && saveErr.message ? String(saveErr.message) : 'Erro desconhecido'
        $app
          .logger()
          .error(
            'Saipos sync: falha ao salvar daily_sales (validação): ' +
              errMsg +
              ' | diagnóstico: ' +
              JSON.stringify(firstPageDiagnostic),
          )
        return e.json(400, {
          error:
            'Falha ao salvar vendas: validação falhou (' +
            errMsg +
            '). Verifique as chaves do 1º item extraído para ajustar o mapeamento de campos.',
          validationError: true,
          validationMessage: errMsg,
          diagnostic: firstPageDiagnostic || null,
        })
      }
    }

    return e.json(200, {
      success: true,
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: skipped,
      segments: segments.length,
      totalSales: allRecords.length,
      diagnostic: firstPageDiagnostic || null,
    })
  },
  $apis.requireAuth(),
)
