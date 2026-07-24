routerAdd(
  'POST',
  '/backend/v1/import/sales/preview',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = body.rows || []

    var groups = {}

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      if (row.canceled === true || row.canceled === 'S') continue

      var date = row.date || ''
      var channel = row.channel || 'Loja / Restaurante'
      var total = Number(row.total) || 0

      var key = date + '|' + channel
      if (!groups[key]) {
        groups[key] = { date: date, channel: channel, orders: 0, revenue: 0 }
      }
      groups[key].orders++
      groups[key].revenue += total
    }

    var result = []
    var keys = Object.keys(groups)
    for (var j = 0; j < keys.length; j++) {
      var g = groups[keys[j]]
      var avgTicket = g.orders > 0 ? Math.round((g.revenue / g.orders) * 100) / 100 : 0
      result.push({
        date: g.date,
        channel: g.channel,
        orders: g.orders,
        revenue: Math.round(g.revenue * 100) / 100,
        average_ticket: avgTicket,
      })
    }

    result.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return a.channel < b.channel ? -1 : 1
    })

    return e.json(200, { groups: result })
  },
  $apis.requireAuth(),
)
