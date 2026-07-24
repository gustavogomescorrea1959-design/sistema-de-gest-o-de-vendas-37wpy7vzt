routerAdd(
  'POST',
  '/backend/v1/import/sales/confirm',
  (e) => {
    const body = e.requestInfo().body || {}
    const groups = body.groups || []

    if (!Array.isArray(groups) || groups.length === 0) {
      return e.badRequestError('Nenhum grupo fornecido')
    }

    let created = 0
    let updated = 0
    const errors = []

    const col = $app.findCollectionByNameOrId('daily_sales')

    for (const g of groups) {
      try {
        let existing = null
        try {
          const records = $app.findRecordsByFilter(
            'daily_sales',
            "date = '" + g.date + "' && channel = '" + g.channel + "'",
            '',
            1,
            0,
          )
          if (records.length > 0) existing = records[0]
        } catch (_) {}

        if (existing) {
          existing.set('orders', g.orders)
          existing.set('revenue', g.revenue)
          existing.set('average_ticket', g.average_ticket)
          $app.save(existing)
          updated++
        } else {
          const record = new Record(col)
          record.set('date', g.date)
          record.set('channel', g.channel)
          record.set('orders', g.orders)
          record.set('revenue', g.revenue)
          record.set('average_ticket', g.average_ticket)
          $app.save(record)
          created++
        }
      } catch (err) {
        errors.push({
          date: g.date || '',
          channel: g.channel || '',
          error: err.message || String(err),
        })
      }
    }

    return e.json(200, { created: created, updated: updated, errors: errors })
  },
  $apis.requireAuth(),
)
