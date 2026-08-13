migrate(
  (app) => {
    const dailySales = app.findCollectionByNameOrId('daily_sales')
    dailySales.fields.add(
      new SelectField({
        name: 'channel',
        type: 'select',
        required: true,
        values: [
          'Loja / Restaurante',
          'Central de Pedidos',
          'iFood',
          'Cardápio Web',
          '99Food',
          'WhatsApp',
          'Telefone',
          'Desconhecido',
        ],
        maxSelect: 1,
      }),
    )
    app.save(dailySales)

    const goals = app.findCollectionByNameOrId('goals')
    goals.fields.add(
      new SelectField({
        name: 'channel',
        type: 'select',
        required: true,
        values: [
          'Loja / Restaurante',
          'Central de Pedidos',
          'iFood',
          'Cardápio Web',
          '99Food',
          'WhatsApp',
          'Telefone',
          'Desconhecido',
        ],
        maxSelect: 1,
      }),
    )
    app.save(goals)
  },
  (app) => {
    const dailySales = app.findCollectionByNameOrId('daily_sales')
    dailySales.fields.add(
      new SelectField({
        name: 'channel',
        type: 'select',
        required: true,
        values: [
          'Loja / Restaurante',
          'Central de Pedidos',
          'iFood',
          'Cardápio Web',
          '99Food',
          'WhatsApp',
          'Telefone',
        ],
        maxSelect: 1,
      }),
    )
    app.save(dailySales)

    const goals = app.findCollectionByNameOrId('goals')
    goals.fields.add(
      new SelectField({
        name: 'channel',
        type: 'select',
        required: true,
        values: [
          'Loja / Restaurante',
          'Central de Pedidos',
          'iFood',
          'Cardápio Web',
          '99Food',
          'WhatsApp',
          'Telefone',
        ],
        maxSelect: 1,
      }),
    )
    app.save(goals)
  },
)
