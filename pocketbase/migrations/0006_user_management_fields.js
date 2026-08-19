// Adiciona gestão de acessos: campos `role` e `active` na collection `users`,
// aperta as regras de acesso (criação só via hook do admin; listagem/edição
// liberadas para o admin) e marca a conta existente do Gustavo como admin ativa.
//
// - `role` (select: admin | user): identifica o administrador. Regras de acesso
//   usam `@request.auth.role = 'admin'` para liberar operações administrativas.
// - `active` (bool): permite desativar/reativar um usuário. O hook de auth
//   (users_auth_block.js) bloqueia o login de usuários inativos.
//
// A criação direta via SDK fica bloqueada (createRule = null -> só superuser),
// forçando o admin a usar o endpoint /backend/v1/users/create, onde a validação
// (email único + senha >= 8) acontece no servidor.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // role (select) — não required (registros antigos podem ficar sem role até
    // serem marcados; regras tratam role vazio como não-admin).
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          values: ['admin', 'user'],
          maxSelect: 1,
        }),
      )
    }

    // active (bool) — NUNCA required (bool required rejeita false). Default true
    // garantido abaixo para todos os registros existentes.
    if (!users.fields.getByName('active')) {
      users.fields.add(new BoolField({ name: 'active' }))
    }

    // Aperta as regras de acesso:
    // - list/view: admin vê todos; usuário comum vê só a si mesmo.
    // - create: null (só superuser) -> SDK create bloqueado; admin usa o hook.
    // - update: só admin -> usuário comum não pode alterar nem o próprio role
    //   (evita escalonamento de privilégio). Reset de senha e toggle de status
    //   pelo admin são feitos via SDK (admin tem update) ou via hooks.
    // - delete: só admin.
    users.listRule = "@request.auth.role = 'admin' || id = @request.auth.id"
    users.viewRule = "@request.auth.role = 'admin' || id = @request.auth.id"
    users.createRule = null
    users.updateRule = "@request.auth.role = 'admin'"
    users.deleteRule = "@request.auth.role = 'admin'"

    app.save(users)

    // Garante que todos os usuários já existentes fiquem ativos (o novo campo
    // `active` vem NULL -> lido como false, o que trancaria todo mundo fora,
    // inclusive o admin). Seta active = 1 para todos.
    app
      .db()
      .newQuery('UPDATE `users` SET `active` = 1 WHERE `active` IS NULL OR `active` = 0')
      .execute()

    // Marca a conta do admin (Gustavo) como role = 'admin'. O email real no banco
    // é admin@gestao.com; se outro email foi usado, marcaríamos por role vazio ->
    // admin é o primeiro usuário. Aqui garantimos o admin@gestao.com explicitamente.
    try {
      const admin = app.findAuthRecordByEmail('_pb_users_auth_', 'admin@gestao.com')
      admin.set('role', 'admin')
      admin.set('active', true)
      app.save(admin)
    } catch (_) {
      // Fallback: se o email não for admin@gestao.com, marca o registro mais
      // antigo (primeiro usuário criado) como admin para não ficar sem admin.
      try {
        const all = app.findRecordsByFilter('_pb_users_auth_', "id != ''", 'created', 1, 0)
        if (all && all.length > 0) {
          all[0].set('role', 'admin')
          all[0].set('active', true)
          app.save(all[0])
        }
      } catch (_) {}
    }

    // Qualquer outro usuário existente (que não o admin) fica role = 'user'.
    app
      .db()
      .newQuery(
        "UPDATE `users` SET `role` = 'user' WHERE (`role` IS NULL OR `role` = '') AND `email` != 'admin@gestao.com'",
      )
      .execute()
  },
  (app) => {
    // Reverte as regras para o estado anterior. Campos novos são mantidos
    // (remoção de campos em auth collections é arriscada no JSVM e o down raramente roda).
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    app.save(users)
  },
)
