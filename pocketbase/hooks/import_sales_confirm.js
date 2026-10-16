routerAdd(
  'POST',
  '/backend/v1/import/sales/confirm',
  (e) => {
    // --- Guarda de admin: só admin autenticado pode confirmar importação de vendas ---
    var auth = e.auth
    if (!auth) {
      return e.json(401, { error: 'Não autenticado.' })
    }
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
      return e.json(403, {
        error: 'Apenas administradores podem importar dados de vendas.',
      })
    }

    var body = e.requestInfo().body || {}
    var records = body.records || []

    var collection = $app.findCollectionByNameOrId('daily_sales')
    var createdCount = 0
    var updatedCount = 0
    var errors = []

    for (var i = 0; i < records.length; i++) {
      var rec = records[i]
      var date = rec.date || ''
      var channel = rec.channel || ''
      var orders = Number(rec.orders) || 0
      var revenue = Number(rec.revenue) || 0
      var avgTicket = Number(rec.average_ticket) || 0

      var filter = "date = '" + date + "' && channel = '" + channel + "'"
      var existing = []
      try {
        existing = $app.findRecordsByFilter('daily_sales', filter, '', 1, 0)
      } catch (err) {
        // filter error — treat as not found
      }

      if (existing.length > 0) {
        var record = existing[0]
        record.set('orders', orders)
        record.set('revenue', revenue)
        record.set('average_ticket', avgTicket)
        $app.save(record)
        updatedCount++
      } else {
        var newRecord = new Record(collection)
        newRecord.set('date', date)
        newRecord.set('channel', channel)
        newRecord.set('orders', orders)
        newRecord.set('revenue', revenue)
        newRecord.set('average_ticket', avgTicket)
        $app.save(newRecord)
        createdCount++
      }
    }

    return e.json(200, {
      created: createdCount,
      updated: updatedCount,
      total: records.length,
      errors: errors,
    })
  },
  $apis.requireAuth(),
)
