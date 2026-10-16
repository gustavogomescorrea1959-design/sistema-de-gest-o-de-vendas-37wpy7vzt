// Cria a collection `user_permissions` para controle de acesso por funcionalidade / página,
// por usuário (não por perfil).
// Cada registro associa um `user` a uma lista de páginas/módulos permitidos (`pages` JSON ou Select/Text).
//
// Regras de acesso:
// - list/view: admin ou o próprio usuário (`@request.auth.role = 'admin' || user = @request.auth.id`)
// - create/update/delete: somente admin (`@request.auth.role = 'admin'`)
//
// Módulos padrão:
// - dashboard: Dashboard (/dashboard)
// - vendas-diarias: Vendas Diárias (/vendas-diarias)
// - metas: Metas (/metas)
// - historico: Histórico (/historico)
// - usuarios: Usuários (/usuarios - apenas admins podem alterar, mas deixamos listado)
migrate(
  (app) => {
    // 1. Cria a collection user_permissions se não existir
    try {
      app.findCollectionByNameOrId('user_permissions')
      return // Já existe
    } catch (_) {}

    const userPermissions = new Collection({
      name: 'user_permissions',
      type: 'base',
      listRule: "@request.auth.role = 'admin' || user = @request.auth.id",
      viewRule: "@request.auth.role = 'admin' || user = @request.auth.id",
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin'",
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'pages',
          type: 'json',
          required: false,
          maxSize: 2000000,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_user_permissions_user ON user_permissions (user)'],
    })

    app.save(userPermissions)

    // 2. Cria permissões padrão para os usuários existentes caso não tenham
    const allUsers = app.findRecordsByFilter('_pb_users_auth_', "id != ''", 'created', 100, 0)
    const defaultPages = ['dashboard', 'vendas-diarias', 'metas', 'historico']

    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i]
      const isAdmin = u.getString('role') === 'admin'
      const permRecord = new Record(userPermissions)
      permRecord.set('user', u.get('id'))
      permRecord.set(
        'pages',
        isAdmin ? ['dashboard', 'vendas-diarias', 'metas', 'historico', 'usuarios'] : defaultPages,
      )
      try {
        app.save(permRecord)
      } catch (err) {
        // Se já existir ou falhar individualmente, não bloqueia a migration
        console.log('user_permissions seed warning: ' + err)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('user_permissions')
      app.delete(col)
    } catch (_) {}
  },
)
