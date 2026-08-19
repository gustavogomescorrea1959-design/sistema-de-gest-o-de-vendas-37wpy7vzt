// ===========================================================================
// Sincronização em massa: janeiro a agosto de 2026 (endpoint dedicado).
//
// Reutiliza a MESMA lógica do endpoint manual POST /backend/v1/sync-saipos:
//   - segmentos de no máximo 15 dias
//   - mesmos canais (CHANNEL_MAP), mesmas fontes (desc_partner_sale +
//     desc_store_partner) e mesmo tratamento de cancelados (isCanceledFlag)
//   - filtro por loja: apenas id_store = 29090 (Alecrim)
//   - upsert em daily_sales por (date, channel)
//
// O JSVM do PocketBase executa os callbacks de routerAdd em um pool de VMs
// SEPARADO do que os registra. Declarações de top-level (funções/const/let/var
// fora do callback) NÃO são visíveis em runtime (ReferenceError). Por isso toda
// a lógica está duplicada inline dentro do callback — idêntica à do sync_saipos.
// ===========================================================================
routerAdd(
  'POST',
  '/backend/v1/sync-saipos-all-2026',
  (e) => {
    // --- Token (igual ao endpoint manual) ---
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

    // Período fixo: janeiro a agosto de 2026. Aceita override via body para
    // flexibilidade, mas o padrão é exatamente o intervalo solicitado.
    var body = e.requestInfo().body || {}
    var startDateRaw = body.startDate || '2026-01-01'
    var endDateRaw = body.endDate || '2026-08-31'

    // --- Helpers (inline — cópia fiel do endpoint manual) ---

    function pad2(n) {
      n = String(n)
      return n.length < 2 ? '0' + n : n
    }

    function parseStartDate(s) {
      var m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/)
      if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
      var d = new Date(s)
      if (!isNaN(d.getTime())) return d
      return null
    }

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
      'tel.': 'Telefone',
      telefonico: 'Telefone',
      telefônico: 'Telefone',
      ligação: 'Telefone',
      ligacao: 'Telefone',
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
      presencial: 'Loja / Restaurante',
    }

    function mapChannel(raw) {
      var c = (raw || '').trim().toLowerCase()
      if (!c) return ''
      var original = raw || ''

      c = c.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')

      if (CHANNEL_MAP[c]) {
        return CHANNEL_MAP[c]
      }

      if (c.indexOf('telefone') === 0) {
        return 'Telefone'
      }

      for (var k in CHANNEL_MAP) {
        var words = k.split(/\s+/)
        var wordCount = 0
        for (var wi = 0; wi < words.length; wi++) {
          if (words[wi].length > 0) wordCount++
        }
        if (wordCount >= 2 && c.indexOf(k) >= 0) {
          return CHANNEL_MAP[k]
        }
      }

      return ''
    }

    var STORE_SALE_TYPES = { 2: true, 3: true, 4: true }

    function getDescPartnerSale(entry) {
      var ps = entry.partner_sale
      if (ps && typeof ps === 'object') {
        var n = ps.desc_partner_sale || ps.partner || ps.name || ''
        if (n) return String(n)
      }
      var pd = entry.partner_delivery
      if (pd && typeof pd === 'object') {
        var n2 = pd.desc_partner_sale || pd.partner || pd.name || ''
        if (n2) return String(n2)
      }
      if (entry.desc_partner_sale) return String(entry.desc_partner_sale)
      return ''
    }

    function getDescStorePartner(entry) {
      if (entry.desc_store_partner) return String(entry.desc_store_partner)
      var ps = entry.partner_sale
      if (ps && typeof ps === 'object' && ps.desc_store_partner) {
        return String(ps.desc_store_partner)
      }
      var sp = entry.store_partner
      if (sp && typeof sp === 'object') {
        var n = sp.desc_store_partner || sp.desc_partner_sale || sp.name || ''
        if (n) return String(n)
      }
      return ''
    }

    function extractChannel(entry, unmappedPartners) {
      var psName = getDescPartnerSale(entry)
      if (psName) {
        var psMapped = mapChannel(psName)
        if (psMapped) return psMapped
      }

      var spName = getDescStorePartner(entry)
      if (spName) {
        var spMapped = mapChannel(spName)
        if (spMapped) return spMapped
      }

      if (psName && unmappedPartners) unmappedPartners.add(psName)
      if (spName && unmappedPartners) unmappedPartners.add(spName)

      var saleType = entry.id_sale_type
      if (saleType != null && STORE_SALE_TYPES[saleType]) {
        return 'Loja / Restaurante'
      }

      if (!psName && !spName && saleType === 1) {
        return 'Telefone'
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
      if (typeof raw === 'number') return isFinite(raw) ? raw : 0
      if (raw == null) return 0
      var s = String(raw).trim()
      if (!s) return 0
      s = s.replace(/[R$\s]/g, '')
      if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.')
      else if (s.indexOf(',') >= 0) s = s.replace(',', '.')
      var n = parseFloat(s)
      return isFinite(n) ? n : 0
    }

    function isCanceledFlag(v) {
      if (v === true) return true
      if (v == null) return false
      var s = String(v).trim().toUpperCase()
      return s === '1' || s === 'Y' || s === 'S' || s === 'SIM' || s === 'TRUE' || s === 'YES'
    }

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
                error: 'Timeout: a API do Saipos demorou demais para responder. Tente novamente.',
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
                'Saipos 2026 PGRST003 (pool) tentativa ' +
                  (attempt + 1) +
                  '/' +
                  MAX_ATTEMPTS +
                  ' — retry em 2s',
              )
            sleep(2000)
            continue
          }
          $app
            .logger()
            .error('Saipos 2026 PGRST003: pool esgotado após ' + MAX_ATTEMPTS + ' tentativas')
          return {
            errorResponse: e.json(503, {
              error:
                'A API do Saipos está indisponível no momento (PGRST003). Tente novamente em alguns instantes.',
              code: 'PGRST003',
              retries: MAX_ATTEMPTS,
            }),
          }
        }

        return { res: res }
      }
      return { res: res }
    }

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
          var b400 = ''
          try {
            if (res.body) b400 = new TextDecoder().decode(res.body).substring(0, 500)
          } catch (_) {}
          $app
            .logger()
            .error('Saipos 2026 400 no segmento ' + startISO + '..' + endISO + ': ' + b400)
          return {
            errorResponse: e.json(502, {
              error: 'A API do Saipos rejeitou o período (HTTP 400). Detalhe: ' + b400,
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

    // --- Segmentação do período em chunks de no máximo 15 dias ---
    var startD = parseStartDate(startDateRaw)
    var endD = parseStartDate(endDateRaw)
    if (!startD || !endD) {
      return e.json(400, {
        error: 'Formato de data inválido. Use YYYY-MM-DD (ex: 2026-01-01).',
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
        'Saipos sync 2026: período ' +
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

    // --- Mapeamento da resposta para daily_sales (igual ao endpoint manual) ---
    var groups = {}
    var skipped = 0
    var skippedOtherStore = 0
    var skippedUnrecognizedPartner = 0
    var totalHistories = 0
    var unmappedPartners = new Set()
    var ALECRIM_STORE_ID = '29090'

    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]

      var recStoreId = rec.id_store != null ? String(rec.id_store) : ''
      if (recStoreId !== ALECRIM_STORE_ID) {
        skippedOtherStore++
        continue
      }

      var rawDate = rec.shift_date || rec.data_venda || rec.date || rec.data || rec.sale_date || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      var recCanceled = rec.canceled || rec.cancelado || rec.canceled_sn || rec.is_canceled || ''
      if (isCanceledFlag(recCanceled)) continue

      var histories = Array.isArray(rec.histories) ? rec.histories : null
      if (histories) {
        totalHistories += histories.length
      }

      var entries = histories && histories.length > 0 ? histories : [rec]

      for (var h = 0; h < entries.length; h++) {
        var entry = entries[h]

        var canceled =
          entry.canceled ||
          entry.cancelado ||
          entry.canceled_sn ||
          entry.está_cancelado ||
          entry.is_canceled ||
          ''
        if (isCanceledFlag(canceled)) continue

        var channel = extractChannel(entry, unmappedPartners)
        if (!channel) {
          skippedUnrecognizedPartner++
          continue
        }

        var total = parseNum(entry.total_amount)
        if (!total) total = parseNum(entry.total_amount_items || 0)

        var saleTicket = parseNum(entry.ticket)
        if (!saleTicket) saleTicket = total

        var key = dateStr + '|' + channel

        if (!groups[key]) {
          groups[key] = {
            date: dateStr,
            channel: channel,
            orders: 0,
            revenue: 0,
            ticketSum: 0,
          }
        }
        groups[key].orders += 1
        groups[key].revenue += total
        groups[key].ticketSum += saleTicket
      }
    }

    $app
      .logger()
      .warn(
        'Saipos sync 2026: ' +
          allRecords.length +
          ' venda(s) processada(s) em ' +
          segments.length +
          ' segmento(s). ' +
          totalHistories +
          ' histories (compat).',
      )

    // --- Salvamento no banco + estatísticas por mês ---
    // Upsert idêntico ao endpoint manual (findRecordsByFilter por date+channel).
    // Acrescenta um breakdown por mês (YYYY-MM) para o dashboard histórico.
    var collection = $app.findCollectionByNameOrId('daily_sales')
    var inserted = 0
    var updated = 0
    var saveErrors = 0
    var monthStats = {}
    var keys = Object.keys(groups)

    for (var j = 0; j < keys.length; j++) {
      var g = groups[keys[j]]

      var revenue = g.revenue
      if (!isFinite(revenue) || isNaN(revenue)) revenue = 0
      revenue = Math.round(revenue * 100) / 100

      var avg = g.orders > 0 ? g.ticketSum / g.orders : 0
      if (!isFinite(avg) || isNaN(avg)) avg = 0
      avg = Math.round(avg * 100) / 100

      var orders = g.orders
      if (!isFinite(orders) || isNaN(orders)) orders = 0

      var monthKey = (g.date || '').substring(0, 7)
      if (!monthStats[monthKey]) {
        monthStats[monthKey] = {
          month: monthKey,
          inserted: 0,
          updated: 0,
          revenue: 0,
          orders: 0,
        }
      }
      monthStats[monthKey].revenue += revenue
      monthStats[monthKey].orders += orders

      var filter = "date = '" + g.date + "' && channel = '" + g.channel + "'"
      var existing = []

      try {
        existing = $app.findRecordsByFilter('daily_sales', filter, '', 1, 0)
      } catch (_) {}

      try {
        if (existing.length > 0) {
          existing[0].set('orders', orders)
          existing[0].set('revenue', revenue)
          existing[0].set('average_ticket', avg)
          $app.save(existing[0])
          updated++
          monthStats[monthKey].updated++
        } else {
          var nr = new Record(collection)
          nr.set('date', g.date)
          nr.set('channel', g.channel)
          nr.set('orders', orders)
          nr.set('revenue', revenue)
          nr.set('average_ticket', avg)
          $app.save(nr)
          inserted++
          monthStats[monthKey].inserted++
        }
      } catch (saveErr) {
        saveErrors++
        var errMsg = saveErr && saveErr.message ? String(saveErr.message) : 'Erro desconhecido'
        $app
          .logger()
          .warn(
            'Saipos sync 2026: falha ao salvar daily_sales date=' +
              g.date +
              ' | channel=' +
              g.channel +
              ' | orders=' +
              orders +
              ' | revenue=' +
              revenue +
              ' | average_ticket=' +
              avg +
              ' | erro=' +
              errMsg,
          )
      }
    }

    // Ordena os meses cronologicamente para o retorno.
    var monthsArr = []
    var monthKeys = Object.keys(monthStats)
    monthKeys.sort()
    for (var mi = 0; mi < monthKeys.length; mi++) {
      var ms = monthStats[monthKeys[mi]]
      ms.revenue = Math.round(ms.revenue * 100) / 100
      monthsArr.push(ms)
    }

    $app
      .logger()
      .info(
        'Saipos sync 2026: concluído — inseridos=' +
          inserted +
          ' | atualizados=' +
          updated +
          ' | pulados(sem data)=' +
          skipped +
          ' | parceiro não reconhecido=' +
          skippedUnrecognizedPartner +
          ' | outra loja=' +
          skippedOtherStore +
          ' | erros de salvamento=' +
          saveErrors +
          ' | total vendas=' +
          allRecords.length,
      )

    return e.json(200, {
      success: true,
      period: { startDate: startDateRaw, endDate: endDateRaw },
      insertedCount: inserted,
      updatedCount: updated,
      skippedCount: skipped,
      skippedOtherStoreCount: skippedOtherStore,
      skippedUnrecognizedPartnerCount: skippedUnrecognizedPartner,
      segments: segments.length,
      totalSales: allRecords.length,
      saveErrors: saveErrors,
      months: monthsArr,
      unmappedPartners: Array.from(unmappedPartners),
      diagnostic: firstPageDiagnostic || null,
    })
  },
  $apis.requireAuth(),
)
