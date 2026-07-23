migrate(
  (app) => {
    const channels = [
      { c: 'Loja / Restaurante', o: 1000, r: 80000, t: 80 },
      { c: 'Central de Pedidos', o: 100, r: 35000, t: 350 },
      { c: 'iFood', o: 700, r: 50000, t: 71 },
      { c: 'Cardápio Web', o: 150, r: 15000, t: 100 },
      { c: '99Food', o: 50, r: 2500, t: 50 },
      { c: 'WhatsApp', o: 100, r: 15000, t: 150 },
      { c: 'Telefone', o: 50, r: 7000, t: 140 },
    ]

    const goalsCol = app.findCollectionByNameOrId('goals')

    if (app.countRecords('goals') === 0) {
      for (const ch of channels) {
        const rec = new Record(goalsCol)
        rec.set('channel', ch.c)
        rec.set('goal_orders', ch.o)
        rec.set('goal_revenue', ch.r)
        rec.set('standard_ticket', ch.t)
        rec.set('period', 'Mensal')
        rec.set('notes', 'Meta padrão inicial')
        app.save(rec)
      }
    }

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'admin@gestao.com')
    } catch (_) {
      const admin = new Record(users)
      admin.setEmail('admin@gestao.com')
      admin.setPassword('Skip@Pass')
      admin.setVerified(true)
      admin.set('name', 'Administrador')
      app.save(admin)
    }
  },
  (app) => {
    // Irreversible or manual cleanup
  },
)
