// Bloqueia o login (authWithPassword) de usuários inativos (active = false).
// Dispara ANTES da autenticação ser finalizada: se o usuário estiver
// inativo, lança um erro 400 que o SDK repassa ao cliente.
//
// Não bloqueia superuser nem usuários sem o campo `active` (compat com
// registros antigos — a migration 0006 garante active = true para todos os
// existentes, mas este guard mantém segurança caso algum fique NULL).
onRecordAuthWithPasswordRequest((e) => {
  var record = e.record
  if (!record) {
    e.next()
    return
  }

  // Superusers não têm o campo `active` — nunca bloquear.
  try {
    if (record.isSuperuser && record.isSuperuser()) {
      e.next()
      return
    }
  } catch (_) {}

  // Usuários da collection `users`: bloqueia se active = false.
  try {
    if (record.getBool && record.getBool('active') === false) {
      throw new BadRequestError('Usuário desativado. Contate o administrador.')
    }
  } catch (err) {
    // Re-lança erros BadRequestError (nosso), mas engole erros de getBool em
    // records sem o campo (não deveria acontecer após a migration 0006, mas
    // mantém compat com qualquer auth collection que não tenha `active`).
    if (err && err.name === 'BadRequestError') {
      throw err
    }
  }

  e.next()
}, '_pb_users_auth_')
