routerAdd(
  'GET',
  '/backend/v1/sync-saipos/test',
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
      return e.json(200, {
        valid: false,
        message: 'Token Saipos não configurado. Defina o secret SAIPOS_API_TOKEN.',
        statusCode: 0,
        responseBody: '',
        requestUrl: '',
      })
    }
    token = token.replace(/^Bearer\s+/i, '').trim()

    // Intervalo de datas padrão para teste: últimos 7 dias (formato YYYY-MM-DD HH:MM:SS)
    function pad(n) {
      n = String(n)
      return n.length < 2 ? '0' + n : n
    }
    function formatDateTime(d) {
      return (
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        ' ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes()) +
        ':' +
        pad(d.getSeconds())
      )
    }
    var now = new Date()
    var start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    var pFilterDateStart = formatDateTime(start)
    var pFilterDateEnd = formatDateTime(now)

    var testUrl =
      'https://data.saipos.io/v1/sales_status_histories' +
      '?p_date_column_filter=shift_date' +
      '&p_filter_date_start=' +
      encodeURIComponent(pFilterDateStart) +
      '&p_filter_date_end=' +
      encodeURIComponent(pFilterDateEnd) +
      '&p_limit=1&p_offset=0'

    function getResponseBody(r) {
      if (!r) return ''
      try {
        if (r.body) {
          var raw = new TextDecoder().decode(r.body)
          return raw
        }
      } catch (_) {}
      try {
        if (r.json) return JSON.stringify(r.json)
      } catch (_) {}
      return ''
    }

    // Realiza a requisição à API do Saipos com retry automático (até 3
    // tentativas) quando a resposta indicar erro PGRST003 ("Timed out
    // acquiring connection from connection pool"). Aguarda 2s entre tentativas.
    var MAX_ATTEMPTS = 3
    var res = null
    var poolTimeoutFinal = false
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      res = null
      poolTimeoutFinal = false
      try {
        res = $http.send({
          url: testUrl,
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: 'Bearer ' + token,
          },
          timeout: 30,
        })
      } catch (err) {
        var errMsg = err && err.message ? String(err.message) : ''
        var lowErr = errMsg.toLowerCase()
        var isTimeout =
          lowErr.indexOf('deadline') >= 0 ||
          lowErr.indexOf('timeout') >= 0 ||
          lowErr.indexOf('context deadline') >= 0
        return e.json(200, {
          valid: false,
          message: isTimeout
            ? 'Timeout: a API do Saipos demorou demais para responder.'
            : 'Erro de conexão com o Saipos: ' + errMsg,
          statusCode: 0,
          errorType: isTimeout ? 'timeout' : 'connection',
          responseBody: '',
          requestUrl: testUrl,
        })
      }

      // Detecta erro de pool de conexão do PostgREST (PGRST003)
      var isPoolTimeout = false
      try {
        var rj = res.json
        if (rj && rj.code === 'PGRST003') isPoolTimeout = true
      } catch (_) {}
      if (!isPoolTimeout) {
        var poolBody = getResponseBody(res)
        if (
          poolBody.indexOf('PGRST003') >= 0 ||
          poolBody.indexOf('Timed out acquiring connection') >= 0
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
        poolTimeoutFinal = true
      }
      break
    }

    if (poolTimeoutFinal) {
      return e.json(200, {
        valid: false,
        message:
          'A API do Saipos está indisponível no momento (PGRST003: Timed out acquiring connection from connection pool). Tente novamente em alguns instantes.',
        statusCode: res ? res.statusCode : 0,
        errorType: 'pool_timeout',
        responseBody: getResponseBody(res),
        requestUrl: testUrl,
        retries: MAX_ATTEMPTS,
      })
    }

    var bodyStr = getResponseBody(res)

    if (res.statusCode === 401 || res.statusCode === 403) {
      return e.json(200, {
        valid: false,
        message: 'Token Saipos Inválido',
        statusCode: res.statusCode,
        errorType: 'auth',
        responseBody: bodyStr,
        requestUrl: testUrl,
      })
    }
    if (res.statusCode === 404) {
      $app.logger().error('Endpoint não encontrado na API do Saipos (test route)', 'url', testUrl)
      return e.json(200, {
        valid: false,
        message: 'Endpoint não encontrado na API do Saipos',
        statusCode: res.statusCode,
        errorType: 'notfound',
        responseBody: bodyStr,
        requestUrl: testUrl,
      })
    }
    if (res.statusCode === 429) {
      return e.json(200, {
        valid: true,
        message: 'Token válido (limite de requisições atingido)',
        statusCode: res.statusCode,
        errorType: 'rate',
        responseBody: bodyStr,
        requestUrl: testUrl,
        data: res.json || null,
      })
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Extrai items tentando múltiplos níveis de aninhamento comuns em APIs
      // REST (PostgREST, etc.). Ordem: mais aninhado primeiro.
      function extractItemsTest(json) {
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
      var testItems = extractItemsTest(res.json)

      // Diagnóstico: estrutura da resposta da Saipos. Retornado no JSON (além
      // do log) para o frontend conseguir exibi-lo mesmo quando os logs não
      // aparecem no stream de hooks.
      var rjType = Array.isArray(res.json) ? 'array' : res.json === null ? 'null' : typeof res.json
      var topKeys =
        res.json && typeof res.json === 'object' && !Array.isArray(res.json)
          ? Object.keys(res.json)
          : []
      var rawSnippet = ''
      if (testItems.length === 0) {
        try {
          if (res.body) rawSnippet = new TextDecoder().decode(res.body).substring(0, 500)
        } catch (_) {}
      }
      var diagnostic = {
        statusCode: res.statusCode,
        responseType: rjType,
        topLevelKeys: topKeys,
        itemsLength: testItems.length,
        firstItemKeys: testItems.length > 0 ? Object.keys(testItems[0]) : [],
        rawBodySnippet: rawSnippet,
      }
      $app.logger().warn('Saipos test diagnóstico: ' + JSON.stringify(diagnostic))

      return e.json(200, {
        valid: true,
        message: 'Token válido',
        statusCode: res.statusCode,
        errorType: 'other',
        responseBody: bodyStr,
        requestUrl: testUrl,
        data: res.json || null,
        diagnostic: diagnostic,
      })
    }
    return e.json(200, {
      valid: false,
      message: 'Erro na API do Saipos (HTTP ' + res.statusCode + ')',
      statusCode: res.statusCode,
      errorType: 'other',
      responseBody: bodyStr,
      requestUrl: testUrl,
    })
  },
  $apis.requireAuth(),
)
