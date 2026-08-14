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
      // OBS: "Salão" e "Ficha" NÃO são canais de venda — são tipos de consumo
      // interno (balcão/salão) e devem ser PULADOS. "Alecrim - Lanches -
      // Saudáveis" é outra loja (outro CNPJ) e também deve ser pulada. Por isso
      // essas chaves foram removidas do CHANNEL_MAP: ao não serem reconhecidas
      // pelo mapChannel, a venda é ignorada (regra de parceiro não reconhecido).
    }

    function mapChannel(raw) {
      var c = (raw || '').trim().toLowerCase()
      if (!c) return ''
      var original = raw || ''

      // Normalização de caracteres Unicode de traço/hífen para hífen ASCII comum.
      // Garante que nomes como "Alecrim – Lanches – Saudáveis" (com en-dash U+2013
      // ou em-dash U+2014) deem match exato com a chave do CHANNEL_MAP
      // "alecrim - lanches - saudáveis" (que usa hífen ASCII U+002D).
      c = c.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')

      // 1) Match EXATO (case-insensitive) — vale para TODAS as chaves,
      //    inclusive as curtas ("loja", "mesa", "tel", "wpp", "ifood", ...).
      if (CHANNEL_MAP[c]) {
        $app
          .logger()
          .info('Saipos channel map: "' + original + '" -> "' + CHANNEL_MAP[c] + '" (match exato)')
        return CHANNEL_MAP[c]
      }

      // 1b) Fallback "Telefone": a API da Saipos retorna variações como
      //     "Telefone - Loja X", "Telefone 2", "telefone (ramal)" que não têm
      //     chave exata no CHANNEL_MAP. Se o nome do parceiro COMEÇAR com
      //     "telefone" (case-insensitive), classificamos como "Telefone".
      //     Observação: "tel." e "telefonico"/"telefônico" são chaves exatas
      //     (já tratadas acima); este fallback cobre apenas o prefixo "telefone"
      //     seguido de outro texto.
      if (c.indexOf('telefone') === 0) {
        $app
          .logger()
          .info('Saipos channel map: "' + original + '" -> "Telefone" (prefixo "telefone")')
        return 'Telefone'
      }

      // 2) Substring APENAS para chaves com 2+ palavras — elas são específicas
      //    o suficiente para não causar falsos positivos (ex: "cardápio web",
      //    "central de pedidos", "loja / restaurante"). Chaves de palavra única
      //    ("loja", "tel", "mesa", "wpp", ...) só valem em match exato, evitando
      //    que parceiros como "Loja do Zé Delivery" ou "TelEntrega Rápida" sejam
      //    classificados incorretamente.
      //    Observação: removida também a direção inversa (k.indexOf(c) >= 0),
      //    que causava matches absurdos (ex: input "tel" batia com "telefone").
      for (var k in CHANNEL_MAP) {
        var words = k.split(/\s+/)
        var wordCount = 0
        for (var wi = 0; wi < words.length; wi++) {
          if (words[wi].length > 0) wordCount++
        }
        if (wordCount >= 2 && c.indexOf(k) >= 0) {
          $app
            .logger()
            .info(
              'Saipos channel map: "' +
                original +
                '" -> "' +
                CHANNEL_MAP[k] +
                '" (substring multiword: "' +
                k +
                '")',
            )
          return CHANNEL_MAP[k]
        }
      }

      $app.logger().info('Saipos channel map: "' + original + '" -> "" (sem correspondência)')
      return ''
    }

    // Extrai o canal de venda de um item do /v1/search_sales.
    //
    // ORDEM DE CONSULTA (correção v0.0.51 — regressão introduzida em 09/08):
    // A v0.0.50 trocou a fonte primária de desc_store_partner para
    // desc_partner_sale. O problema é que "Telefone" NÃO é marketplace: a
    // Saipos não preenche desc_partner_sale para vendas por telefone — esse
    // nome vem em desc_store_partner. Até 08/08 funcionava (desc_store_partner
    // era consultado); depois parou. A nova ordem restabelece as duas fontes:
    //
    // 1) desc_partner_sale (fonte primária — marketplaces: iFood, 99Food,
    //    Central de Pedidos, Cardápio Web, ...). Lido de partner_sale e, se
    //    ausente, de partner_delivery (onde vêm os parceiros de delivery).
    // 2) desc_store_partner (fonte secundária — Telefone, WhatsApp, ...).
    //    Lido do campo top-level desc_store_partner (ou aninhado em
    //    partner_sale / store_partner).
    // 3) Fallback: se AMBAS as fontes falharem (ausentes/vazias ou não
    //    reconhecidas pelo mapChannel), id_sale_type 2/3/4 (Ficha/Salão/Balcão)
    //    -> "Loja / Restaurante". Demais id_sale_type -> venda pulada.
    //
    // DIAGNÓSTICO: se ambas as fontes forem consultadas (tinham nome) e nenhuma
    // for reconhecida pelo mapChannel, os nomes são registrados em
    // unmappedPartners. A venda só não é pulada nesse caso se id_sale_type for
    // 2/3/4 (fallback Loja/Restaurante).
    //
    // IMPORTANTE: as DUAS consultas (desc_partner_sale e desc_store_partner)
    // passam obrigatoriamente pelo mapChannel — nenhum valor é usado cru.
    var STORE_SALE_TYPES = { 2: true, 3: true, 4: true }

    // Lê desc_partner_sale de partner_sale e (fallback) partner_delivery.
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

    // Lê desc_store_partner (Telefone, WhatsApp, ...). Tenta o campo top-level
    // e, se ausente, campos aninhados em partner_sale / store_partner.
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
      // 1) desc_partner_sale (marketplaces: iFood, 99Food, Central de Pedidos,
      //    Cardápio Web, ...). mapChannel é obrigatório.
      var psName = getDescPartnerSale(entry)
      if (psName) {
        var psMapped = mapChannel(psName)
        if (psMapped) return psMapped
      }

      // 2) desc_store_partner (Telefone, WhatsApp, ...). Só chegamos aqui se a
      //    1ª tentativa veio vazia ou não foi reconhecida. mapChannel é
      //    obrigatório.
      var spName = getDescStorePartner(entry)
      if (spName) {
        var spMapped = mapChannel(spName)
        if (spMapped) return spMapped
      }

      // 3) Ambas as fontes foram consultadas e nenhuma foi reconhecida pelo
      //    mapChannel -> registra os nomes em unmappedPartners para diagnóstico.
      //    O fallback por id_sale_type 2/3/4 (Loja/Restaurante) ainda se aplica
      //    (é a exceção que evita pular vendas presenciais); demais tipos ->
      //    venda pulada (retorna vazio).
      if (psName && unmappedPartners) unmappedPartners.add(psName)
      if (spName && unmappedPartners) unmappedPartners.add(spName)

      var saleType = entry.id_sale_type
      if (saleType != null && STORE_SALE_TYPES[saleType]) {
        return 'Loja / Restaurante'
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

    // Garante que NUNCA retorna NaN/Infinity — sempre um número finito (ou 0).
    // PocketBase rejeita NaN em campos number required como "cannot be blank".
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

    // Normaliza a flag de cancelamento da Saipos. O campo `canceled` chega em
    // formatos variados conforme o endpoint/versão: string "1" (cancelado) ou
    // "0" (ativo), número 1, string "Y"/"S"/"SIM"/"true"/"yes", ou boolean true.
    // A comparação direta `=== 1` nunca dá match quando chega como string "1",
    // então normalizamos tudo para string maiúscula antes de comparar.
    function isCanceledFlag(v) {
      if (v === true) return true
      if (v == null) return false
      var s = String(v).trim().toUpperCase()
      return s === '1' || s === 'Y' || s === 'S' || s === 'SIM' || s === 'TRUE' || s === 'YES'
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
    var skippedOtherStore = 0
    // Vendas puladas porque o parceiro (desc_partner_sale) não foi reconhecido
    // pelo mapChannel (ex: "Ficha", "Salão", "Alecrim - Lanches - Saudáveis").
    var skippedUnrecognizedPartner = 0
    var totalHistories = 0
    var firstHistoryKeys = null
    var unmappedPartners = new Set()
    // Diagnóstico: acumula TODOS os valores únicos de desc_partner_sale
    // (de partner_sale e partner_delivery) para o resumo final de parceiros.
    // Não interfere na lógica de extractChannel/mapChannel/CHANNEL_MAP — é
    // apenas coleta para um console.log de diagnóstico ao final da sincronização.
    var partnerSummary = new Set()
    // Código da loja do Alecrim no Saipos. O token da API retorna vendas de
    // TODAS as lojas associadas a ele; este sistema é exclusivo do Alecrim,
    // então qualquer venda de outra loja é ignorada (não processada nem salva).
    // Registros "Desconhecido" já existentes no banco NÃO são deletados aqui —
    // apenas deixam de ser criados em novas sincronizações.
    var ALECRIM_STORE_ID = '29090'

    for (var i = 0; i < allRecords.length; i++) {
      var rec = allRecords[i]

      // Filtro por loja: apenas vendas do Alecrim (id_store = 29090) são
      // processadas. Vendas de outras lojas têm partner_sale.desc_partner_sale
      // com nomes que o mapChannel não reconhece (cairiam como "Desconhecido")
      // e não pertencem a este estabelecimento.
      var recStoreId = rec.id_store != null ? String(rec.id_store) : ''
      if (recStoreId !== ALECRIM_STORE_ID) {
        skippedOtherStore++
        continue
      }

      // Data do turno (shift_date) — recomendado pela Saipos para filtros por dia.
      var rawDate = rec.shift_date || rec.data_venda || rec.date || rec.data || rec.sale_date || ''
      var dateStr = parseDateStr(rawDate)
      if (!dateStr) {
        skipped++
        continue
      }

      // Cancelamento: o campo `canceled` da Saipos chega como string "1"
      // (cancelado) ou "0" (ativo), mas também pode vir como número 1, "Y",
      // "S", "true" ou boolean. isCanceledFlag normaliza todos esses formatos.
      var recCanceled = rec.canceled || rec.cancelado || rec.canceled_sn || rec.is_canceled || ''
      if (isCanceledFlag(recCanceled)) continue

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
        if (isCanceledFlag(canceled)) continue

        // Diagnóstico: coleta os valores únicos de desc_partner_sale vindos de
        // partner_sale e partner_delivery. Não altera a lógica — alimenta apenas
        // o resumo de parceiros exibido ao final da sincronização.
        var _psEntry = entry.partner_sale
        if (_psEntry && typeof _psEntry === 'object') {
          var _psName = _psEntry.desc_partner_sale || _psEntry.partner || _psEntry.name || ''
          if (_psName) partnerSummary.add(_psName)
        }
        var _pdEntry = entry.partner_delivery
        if (_pdEntry && typeof _pdEntry === 'object') {
          var _pdName = _pdEntry.desc_partner_sale || _pdEntry.partner || _pdEntry.name || ''
          if (_pdName) partnerSummary.add(_pdName)
        }
        // desc_store_partner agora é uma fonte consultada (Telefone, WhatsApp,
        // ...), então também entra no resumo de parceiros para diagnóstico.
        var _spName = entry.desc_store_partner
        if (!_spName && _psEntry && typeof _psEntry === 'object') {
          _spName = _psEntry.desc_store_partner
        }
        if (_spName) partnerSummary.add(String(_spName))

        // Canal: extractChannel consulta desc_partner_sale (partner_sale e
        // partner_delivery — marketplaces: iFood, 99Food, ...) e, se não
        // reconhecido, desc_store_partner (Telefone, WhatsApp, ...). Ambas as
        // consultas passam pelo mapChannel. Se ambas falharem, fallback por
        // id_sale_type 2/3/4 -> "Loja / Restaurante". Parceiros não reconhecidos
        // das duas fontes são registrados em unmappedPartners para diagnóstico.
        var channel = extractChannel(entry, unmappedPartners)
        if (!channel) {
          skippedUnrecognizedPartner++
          continue
        }

        // Receita: total_amount (número) é o total da venda. Se for
        // null/undefined/0, caímos para total_amount_items como fallback.
        var total = parseNum(entry.total_amount)
        if (!total) total = parseNum(entry.total_amount_items || 0)

        // Ticket médio da venda: se houver campo `ticket`, usamos ele; senão o
        // próprio total da venda representa o ticket médio unitário.
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
        // Cada venda não cancelada == 1 pedido.
        groups[key].orders += 1
        groups[key].revenue += total
        groups[key].ticketSum += saleTicket
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

    // --- Resumo de parceiros (diagnóstico) ---
    // Lista todos os valores únicos de desc_partner_sale (partner_sale /
    // partner_delivery) e desc_store_partner encontrados durante a
    // sincronização, com o canal mapeado por mapChannel (ou "NÃO MAPEADO").
    // Não altera a lógica de extractChannel/mapChannel/CHANNEL_MAP — é apenas
    // um log de diagnóstico.
    console.log('[Saipos sync] Resumo de parceiros:')
    var _partnerNames = Array.from(partnerSummary)
    if (_partnerNames.length === 0) {
      console.log('[Saipos sync]   (nenhum parceiro encontrado)')
    } else {
      for (var _pi = 0; _pi < _partnerNames.length; _pi++) {
        var _partnerName = _partnerNames[_pi]
        var _mappedChannel = mapChannel(_partnerName)
        console.log(
          '[Saipos sync]   "' + _partnerName + '" -> ' + (_mappedChannel || 'NÃO MAPEADO'),
        )
      }
    }
    $app
      .logger()
      .info('[Saipos sync] Resumo de parceiros: ' + _partnerNames.length + ' valor(es) único(s)')

    var collection = $app.findCollectionByNameOrId('daily_sales')
    var inserted = 0
    var updated = 0
    var keys = Object.keys(groups)

    for (var j = 0; j < keys.length; j++) {
      var g = groups[keys[j]]

      // Garantias anti-NaN/Infinity: revenue, average_ticket e orders nunca
      // podem chegar NaN/blank ao PocketBase (senão: "cannot be blank").
      var revenue = g.revenue
      if (!isFinite(revenue) || isNaN(revenue)) revenue = 0
      revenue = Math.round(revenue * 100) / 100

      var avg = g.orders > 0 ? g.ticketSum / g.orders : 0
      if (!isFinite(avg) || isNaN(avg)) avg = 0
      avg = Math.round(avg * 100) / 100

      var orders = g.orders
      if (!isFinite(orders) || isNaN(orders)) orders = 0

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
        } else {
          var nr = new Record(collection)
          nr.set('date', g.date)
          nr.set('channel', g.channel)
          nr.set('orders', orders)
          nr.set('revenue', revenue)
          nr.set('average_ticket', avg)
          $app.save(nr)
          inserted++
        }
      } catch (saveErr) {
        var errMsg = saveErr && saveErr.message ? String(saveErr.message) : 'Erro desconhecido'
        // Log detalhado do registro que falhou na validação.
        $app
          .logger()
          .warn(
            'Saipos sync: validação falhou ao salvar daily_sales -> ' +
              'date=' +
              g.date +
              ' | channel=' +
              g.channel +
              ' | orders=' +
              orders +
              ' | revenue=' +
              revenue +
              ' | average_ticket=' +
              avg +
              ' | ticketSum=' +
              g.ticketSum +
              ' | erro=' +
              errMsg,
          )
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
            '). Registro: date=' +
            g.date +
            ', channel=' +
            g.channel +
            ', revenue=' +
            revenue +
            ', average_ticket=' +
            avg +
            '.',
          validationError: true,
          validationMessage: errMsg,
          failedRecord: {
            date: g.date,
            channel: g.channel,
            orders: orders,
            revenue: revenue,
            average_ticket: avg,
          },
          diagnostic: firstPageDiagnostic || null,
        })
      }
    }

    return e.json(200, {
      success: true,
      insertedCount: inserted,
      updatedCount: updated,
      skippedUnrecognizedPartnerCount: skippedUnrecognizedPartner,
      skippedCount: skipped,
      skippedOtherStoreCount: skippedOtherStore,
      segments: segments.length,
      totalSales: allRecords.length,
      diagnostic: firstPageDiagnostic || null,
      unmappedPartners: Array.from(unmappedPartners),
    })
  },
  $apis.requireAuth(),
)
