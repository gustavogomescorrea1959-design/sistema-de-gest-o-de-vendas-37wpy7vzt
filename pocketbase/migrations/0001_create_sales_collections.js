migrate(
  (app) => {
    const channels = [
      'Loja / Restaurante',
      'Central de Pedidos',
      'iFood',
      'Cardápio Web',
      '99Food',
      'WhatsApp',
      'Telefone',
    ]

    const goals = new Collection({
      name: 'goals',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'channel', type: 'select', required: true, values: channels, maxSelect: 1 },
        { name: 'goal_orders', type: 'number', required: true, min: 0 },
        { name: 'goal_revenue', type: 'number', required: true, min: 0 },
        { name: 'standard_ticket', type: 'number', required: true, min: 0 },
        { name: 'period', type: 'text', required: true },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_goals_channel ON goals (channel)'],
    })
    app.save(goals)

    const dailySales = new Collection({
      name: 'daily_sales',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'date', type: 'text', required: true },
        { name: 'channel', type: 'select', required: true, values: channels, maxSelect: 1 },
        { name: 'orders', type: 'number', required: true, min: 0 },
        { name: 'revenue', type: 'number', required: true, min: 0 },
        { name: 'average_ticket', type: 'number', required: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_daily_sales_date_channel ON daily_sales (date, channel)',
        'CREATE INDEX idx_daily_sales_date ON daily_sales (date)',
      ],
    })
    app.save(dailySales)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('daily_sales'))
    app.delete(app.findCollectionByNameOrId('goals'))
  },
)
