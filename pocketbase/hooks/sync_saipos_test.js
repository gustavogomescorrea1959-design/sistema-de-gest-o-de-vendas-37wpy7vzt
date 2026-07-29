routerAdd(
  'GET',
  '/backend/v1/sync-saipos/test',
  (e) => {
    var token = $secrets.get('SAIPOS_API_TOKEN')
    if (!token) {
      token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI5ZGMyZGM4My0wNTg4LTdhMzEtOGE1MS00NjQyMzdkMzM1OWUiLCJpYXQiOjE3ODUyNDM4NzZ9.mAsya8DaWs7CqTBfU8qHS8tJIpv8KUO9pbpFiHJWXdg'
    }

    var res
    try {
      res = $http.send({
        url: 'https://data-api.saipos.com/v1/sales?page=1&perPage=1',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        timeout: 15,
      })
    } catch (err) {
      return e.json(200, { valid: false, message: 'Erro de conexão com o Saipos: ' + err.message })
    }

    if (res.statusCode === 401 || res.statusCode === 403) {
      return e.json(200, { valid: false, message: 'Token inválido ou expirado' })
    }
    if (res.statusCode === 429) {
      return e.json(200, { valid: true, message: 'Token válido (limite de requisições atingido)' })
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return e.json(200, { valid: true, message: 'Token válido' })
    }
    return e.json(200, {
      valid: false,
      message: 'Erro na API do Saipos (HTTP ' + res.statusCode + ')',
    })
  },
  $apis.requireAuth(),
)
