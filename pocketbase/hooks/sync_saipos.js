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

    // Extrai o array de items da resposta da Saipos, tentando múltiplos níveis
    // de aninhamento comuns em APIs REST (PostgREST, etc.). Ordem: mais aninhado
    // primeiro, depois níveis menores, por último array direto.
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
      // Última tentativa: qualquer array no primeiro nível do objeto
      var keys = Object.keys(json)
      for (var k = 0; k < keys.length; k++) {
        if (Array.isArray(json[keys[k]])) return json[keys[k]]
      }
      return []
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
    var firstPageDiagnostic = null

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

      var items = extractItems(res.json)

      // Captura diagnóstico da primeira página para retornar no JSON de resposta
      // (além do log) — assim o frontend consegue exibir a estrutura real da
      // resposta da Saipos mesmo quando os logs não aparecem no stream de hooks.
      if (page === 0) {
        var rj0 = res.json
        var rjType0 = Array.isArray(rj0) ? 'array' : rj0 === null ? 'null' : typeof rj0
        var topKeys0 = rj0 && typeof rj0 === 'object' && !Array.isArray(rj0) ? Object.keys(rj0) : []
        var rawSnippet0 = ''
        if (items.length === 0) {
          try {
            if (res.body) rawSnippet0 = new TextDecoder().decode(res.body).substring(0, 500)
          } catch (_) {}
        }
        var firstHistoryKeys0 = []
        if (
          items.length > 0 &&
          Array.isArray(items[0].histories) &&
          items[0].histories.length > 0
        ) {
          firstHistoryKeys0 = Object.keys(items[0].histories[0])
        }
        firstPageDiagnostic = {
          statusCode: res.statusCode,
          responseType: rjType0,
          topLevelKeys: topKeys0,
          itemsLength: items.length,
          firstItemKeys: items.length > 0 ? Object.keys(items[0]) : [],
          historyKeys: firstHistoryKeys0,
          rawBodySnippet: rawSnippet0,
        }
        $app.logger().warn('Saipos sync diagnóstico: ' + JSON.stringify(firstPageDiagnostic))
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
    var totalHistories = 0
    var firstHistoryKeys = null

    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]

      // A data do turno vem do item pai (shift_date); os dados de vendas
      // (revenue, orders, channel, average_ticket) estão aninhados dentro do
      // array `histories`. Se o item não tiver `histories`, tenta mapear o
      // próprio item diretamente (compatibilidade com formatos antigos).
      var rawDate = rec.shift_date || rec.data_venda || rec.date || rec.data || rec.sale_date || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      var recCanceled =
        rec.cancelado ||
        rec.canceled ||
        rec.cancelado_sn ||
        rec.está_cancelado ||
        rec.is_canceled ||
        ''
      var recIsCanceled =
        recCanceled === true ||
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
          $app
            .logger()
            .warn(
              'Saipos sync: item ' +
                (i + 1) +
                ' tem ' +
                histories.length +
                ' histories. Chaves do 1º history: ' +
                JSON.stringify(firstHistoryKeys),
            )
        }
      }

      // Lista de entradas a processar: cada history vira uma entrada de venda;
      // se não houver histories, processa o próprio item (formato antigo).
      var entries = histories && histories.length > 0 ? histories : [rec]

      for (var h = 0; h < entries.length; h++) {
        var entry = entries[h]

        var canceled =
          entry.cancelado ||
          entry.canceled ||
          entry.cancelado_sn ||
          entry.está_cancelado ||
          entry.is_canceled ||
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

        var rawCh =
          entry.channel ||
          entry.channel_name ||
          entry.canal_venda ||
          entry.canal ||
          entry.origem ||
          entry.sales_channel ||
          ''
        var channel = mapChannel(rawCh)
        if (!channel) channel = 'Desconhecido'

        var total = parseNum(
          entry.revenue ||
            entry.total ||
            entry.amount ||
            entry.valor_total ||
            entry.valor ||
            entry.receita ||
            0,
        )
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
          totalHistories +
          ' histories processados em ' +
          allRecords.length +
          ' items. Chaves do 1º history: ' +
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
        // Falha de validação ao salvar (ex.: revenue/average_ticket em branco
        // porque o mapeamento de campos da Saipos está divergente). Retorna o
        // diagnóstico da primeira página — incluindo as chaves do 1º item
        // extraído — para o frontend poder exibi-las ao usuário e o time
        // ajustar o mapeamento.
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
      diagnostic: firstPageDiagnostic || null,
    })
  },
  $apis.requireAuth(),
)
