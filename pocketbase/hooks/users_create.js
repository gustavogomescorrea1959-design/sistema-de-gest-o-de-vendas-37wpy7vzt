// Cria um novo usuário na collection `users`. Acesso restrito a admin
// autenticado (role = 'admin'). Valida email único e senha >= 8 caracteres.
//
// Regras de acesso da collection `users` têm createRule = null (só superuser),
// então o admin É OBRIGADO a usar este endpoint — SDK create direto é barrado.
//
// Body JSON: { name, email, password }
routerAdd(
  'POST',
  '/backend/v1/users/create',
  (e) => {
    // --- Guarda de admin: só admin autenticado pode criar usuários. ---
    var auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }
    // auth pode ser superuser ou record de users. Aceitamos ambos: superuser
    // tem isSuperuser(); record de users tem role = 'admin'.
    var isAdmin = false
    try {
      if (auth.isSuperuser && auth.isSuperuser()) {
        isAdmin = true
      }
    } catch (_) {}
    if (!isAdmin) {
      try {
        if (auth.getString && auth.getString('role') === 'admin') {
          isAdmin = true
        }
      } catch (_) {}
    }
    if (!isAdmin) {
      return e.json(403, { error: 'Apenas o administrador pode criar usuários.' })
    }

    var body = e.requestInfo().body || {}
    var name = (body.name || '').toString().trim()
    var email = (body.email || '').toString().trim().toLowerCase()
    var password = (body.password || '').toString()

    // --- Validações de entrada ---
    if (!name) {
      return e.json(400, { error: 'Nome é obrigatório.' })
    }
    if (!email || email.indexOf('@') < 0) {
      return e.json(400, { error: 'Email inválido.' })
    }
    if (!password || password.length < 8) {
      return e.json(400, { error: 'A senha deve ter no mínimo 8 caracteres.' })
    }

    // --- Email único ---
    var emailExists = false
    try {
      $app.findAuthRecordByEmail('_pb_users_auth_', email)
      emailExists = true
    } catch (_) {}
    if (emailExists) {
      return e.json(400, { error: 'Já existe um usuário com este email.' })
    }

    // --- Criação ---
    var collection = $app.findCollectionByNameOrId('_pb_users_auth_')
    var record = new Record(collection)
    record.setEmail(email)
    record.setPassword(password)
    record.setVerified(true)
    record.set('name', name)
    record.set('role', 'user')
    record.set('active', true)

    try {
      $app.save(record)
    } catch (saveErr) {
      var errMsg = saveErr && saveErr.message ? String(saveErr.message) : 'Erro ao salvar.'
      $app.logger().error('users_create: falha ao salvar usuário ' + email + ': ' + errMsg)
      // Pode ser email duplicado detectado tardiamente, validação de senha, etc.
      return e.json(400, { error: 'Falha ao criar usuário: ' + errMsg })
    }

    return e.json(200, {
      id: record.get('id'),
      email: record.get('email'),
      name: record.get('name'),
      role: record.get('role'),
      active: record.get('active'),
      verified: record.get('verified'),
      created: record.get('created'),
      updated: record.get('updated'),
    })
  },
  $apis.requireAuth(),
)
