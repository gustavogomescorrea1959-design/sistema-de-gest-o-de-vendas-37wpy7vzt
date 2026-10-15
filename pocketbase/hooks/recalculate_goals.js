// ===========================================================================
// Recálculo automático de metas mensais (Padrão do Ticket Médio, Meta Faturamento e Meta Pedidos)
//
// Regras pedidas pelo usuário:
// 1º) O Padrão do Ticket Médio deve ser definido pelo sistema, utilizando a
//     média dos últimos 3 meses, de cada Canal. Essa atualização deve ser
//     efetuada sempre no primeiro dia do próximo mês.
// 2º) A Meta do Faturamento, para o próximo mês, deve ser corrigida pela
//     mesma variação que houver no Ticket Médio, de cada Canal.
//     (novo faturamento = faturamento atual * (novo ticket / ticket anterior))
// 3º) A Meta dos Pedidos deverá ser ajustada com base no novo Faturamento e no
//     novo Ticket Médio. (novos pedidos = round(novo faturamento / novo ticket))
//
// Cron mensal: dispara às 07:05 (UTC) no dia 1 de cada mês (0 7 1 * *).
// Segue o padrão de sync_saipos.js (fuso BRT UTC-3 e logs de diagnóstico).
//
// Também disponibiliza um endpoint POST /backend/v1/recalculate-goals
// para execução manual / teste a qualquer momento.
// ===========================================================================

routerAdd(
  'POST',
  '/backend/v1/recalculate-goals',
  (e) => {
    try {
      function pad2(n) {
        n = String(n)
        return n.length < 2 ? '0' + n : n
      }

      function getMonthInterval(year, monthIdx) {
        var startStr = year + '-' + pad2(monthIdx + 1) + '-01'
        var lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate()
        var endStr = year + '-' + pad2(monthIdx + 1) + '-' + pad2(lastDay)
        return { start: startStr, end: endStr }
      }

      var now = new Date()
      var brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
      var currentYear = brtNow.getUTCFullYear()
      var currentMonthIdx = brtNow.getUTCMonth()

      var body = e.requestInfo().body || {}
      var targetYear = body.targetYear ? parseInt(body.targetYear, 10) : currentYear
      var targetMonthIdx =
        body.targetMonth !== undefined ? parseInt(body.targetMonth, 10) - 1 : currentMonthIdx

      var pastMonths = []
      for (var offset = 3; offset >= 1; offset--) {
        var d = new Date(Date.UTC(targetYear, targetMonthIdx - offset, 1))
        var y = d.getUTCFullYear()
        var mIdx = d.getUTCMonth()
        var interval = getMonthInterval(y, mIdx)
        pastMonths.push({
          year: y,
          month: mIdx + 1,
          monthKey: y + '-' + pad2(mIdx + 1),
          start: interval.start,
          end: interval.end,
        })
      }

      var overallStart = pastMonths[0].start
      var overallEnd = pastMonths[pastMonths.length - 1].end

      $app
        .logger()
        .info(
          '[Recalculate Goals] Executando para o mês-alvo ' +
            targetYear +
            '-' +
            pad2(targetMonthIdx + 1) +
            '. Intervalo dos últimos 3 meses: ' +
            overallStart +
            ' até ' +
            overallEnd,
        )

      var CHANNELS_LIST = [
        'Loja / Restaurante',
        'Central de Pedidos',
        'iFood',
        'Cardápio Web',
        '99Food',
        'WhatsApp',
        'Telefone',
      ]

      var filterSales = "date >= '" + overallStart + "' && date <= '" + overallEnd + "'"
      var salesRecords = []
      try {
        salesRecords = $app.findRecordsByFilter('daily_sales', filterSales, 'date', 5000, 0)
      } catch (err) {
        $app
          .logger()
          .warn(
            '[Recalculate Goals] Erro ao buscar daily_sales: ' +
              (err && err.message ? err.message : String(err)),
          )
      }

      var channelMonthlyTotals = {}
      for (var ci = 0; ci < CHANNELS_LIST.length; ci++) {
        var chName = CHANNELS_LIST[ci]
        channelMonthlyTotals[chName] = {}
        for (var mi = 0; mi < pastMonths.length; mi++) {
          channelMonthlyTotals[chName][pastMonths[mi].monthKey] = { orders: 0, revenue: 0 }
        }
      }

      for (var si = 0; si < salesRecords.length; si++) {
        var rec = salesRecords[si]
        var ch = rec.getString('channel')
        var dateStr = rec.getString('date')
        if (!channelMonthlyTotals[ch]) continue
        var mKey = dateStr.substring(0, 7)
        if (channelMonthlyTotals[ch][mKey]) {
          channelMonthlyTotals[ch][mKey].orders += rec.getInt('orders') || 0
          channelMonthlyTotals[ch][mKey].revenue += rec.getFloat('revenue') || 0
        }
      }

      var goalsCollection = $app.findCollectionByNameOrId('goals')
      var allGoals = []
      try {
        allGoals = $app.findRecordsByFilter('goals', '', '', 100, 0)
      } catch (_) {}

      var updatedGoals = []

      for (var cj = 0; cj < CHANNELS_LIST.length; cj++) {
        var channel = CHANNELS_LIST[cj]
        var monthlyData = channelMonthlyTotals[channel]
        var monthTickets = []
        var totalOrders3m = 0
        var totalRevenue3m = 0

        for (var pmi = 0; pmi < pastMonths.length; pmi++) {
          var pKey = pastMonths[pmi].monthKey
          var mInfo = monthlyData[pKey] || { orders: 0, revenue: 0 }
          totalOrders3m += mInfo.orders
          totalRevenue3m += mInfo.revenue
          if (mInfo.orders > 0 && mInfo.revenue > 0) {
            monthTickets.push(mInfo.revenue / mInfo.orders)
          }
        }

        var newStandardTicket = 0
        if (monthTickets.length > 0) {
          var sumTkt = 0
          for (var ti = 0; ti < monthTickets.length; ti++) {
            sumTkt += monthTickets[ti]
          }
          newStandardTicket = sumTkt / monthTickets.length
        } else if (totalOrders3m > 0 && totalRevenue3m > 0) {
          newStandardTicket = totalRevenue3m / totalOrders3m
        }

        var goalRec = null
        for (var gi = 0; gi < allGoals.length; gi++) {
          if (allGoals[gi].getString('channel') === channel) {
            goalRec = allGoals[gi]
            break
          }
        }

        var oldStandardTicket = goalRec ? goalRec.getFloat('standard_ticket') || 0 : 0
        var oldRevenue = goalRec ? goalRec.getFloat('goal_revenue') || 0 : 0
        var oldOrders = goalRec ? goalRec.getInt('goal_orders') || 0 : 0

        if (newStandardTicket <= 0) {
          newStandardTicket = oldStandardTicket > 0 ? oldStandardTicket : 0
        }

        newStandardTicket = Math.round(newStandardTicket * 100) / 100

        var newGoalRevenue = oldRevenue
        if (oldStandardTicket > 0 && newStandardTicket > 0 && oldRevenue > 0) {
          var variation = newStandardTicket / oldStandardTicket
          newGoalRevenue = Math.round(oldRevenue * variation * 100) / 100
        }

        var newGoalOrders = oldOrders
        if (newStandardTicket > 0 && newGoalRevenue > 0) {
          newGoalOrders = Math.round(newGoalRevenue / newStandardTicket)
        }

        if (!goalRec) {
          goalRec = new Record(goalsCollection)
          goalRec.set('channel', channel)
          goalRec.set('period', 'Mensal')
          goalRec.set('notes', 'Criado automaticamente pelo recálculo mensal')
        }

        goalRec.set('standard_ticket', newStandardTicket)
        goalRec.set('goal_revenue', newGoalRevenue)
        goalRec.set('goal_orders', newGoalOrders)

        $app.save(goalRec)

        updatedGoals.push({
          channel: channel,
          oldStandardTicket: oldStandardTicket,
          newStandardTicket: newStandardTicket,
          oldRevenue: oldRevenue,
          newRevenue: newGoalRevenue,
          oldOrders: oldOrders,
          newOrders: newGoalOrders,
          monthsConsidered: monthTickets.length,
        })
      }

      $app
        .logger()
        .info(
          '[Recalculate Goals] Concluído com sucesso para ' +
            updatedGoals.length +
            ' canais. Diagnóstico: ' +
            JSON.stringify(updatedGoals),
        )

      return e.json(200, {
        success: true,
        targetMonth: targetYear + '-' + pad2(targetMonthIdx + 1),
        pastMonths: pastMonths,
        channels: updatedGoals,
      })
    } catch (err) {
      var errMsg = err && err.message ? String(err.message) : String(err)
      var errStack = err && err.stack ? String(err.stack) : ''
      $app
        .logger()
        .error('[Recalculate Goals] Erro no recálculo: ' + errMsg + ' | stack: ' + errStack)
      return e.json(500, { error: 'Falha no recálculo de metas: ' + errMsg })
    }
  },
  $apis.requireAuth(),
)

// ===========================================================================
// Cron mensal: executa no dia 1 de cada mês às 07:05 UTC (04:05 BRT)
// ===========================================================================
cronAdd('monthly_goals_recalculate', '5 7 1 * *', () => {
  try {
    var nowUtc = new Date().toISOString()
    var nowBrt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    console.log('[Monthly Goals Cron] Disparo: UTC = ' + nowUtc + ', BRT = ' + nowBrt)
    $app.logger().info('Monthly Goals Cron: iniciando recálculo automático de metas mensais')

    function pad2(n) {
      n = String(n)
      return n.length < 2 ? '0' + n : n
    }

    function getMonthInterval(year, monthIdx) {
      var startStr = year + '-' + pad2(monthIdx + 1) + '-01'
      var lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate()
      var endStr = year + '-' + pad2(monthIdx + 1) + '-' + pad2(lastDay)
      return { start: startStr, end: endStr }
    }

    var now = new Date()
    var brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    var currentYear = brtNow.getUTCFullYear()
    var currentMonthIdx = brtNow.getUTCMonth()

    // Como roda no dia 1 do mês, o mês-alvo que acabou de começar é currentMonthIdx.
    // Os 3 meses anteriores são exatamente os últimos 3 meses fechados.
    var pastMonths = []
    for (var offset = 3; offset >= 1; offset--) {
      var d = new Date(Date.UTC(currentYear, currentMonthIdx - offset, 1))
      var y = d.getUTCFullYear()
      var mIdx = d.getUTCMonth()
      var interval = getMonthInterval(y, mIdx)
      pastMonths.push({
        year: y,
        month: mIdx + 1,
        monthKey: y + '-' + pad2(mIdx + 1),
        start: interval.start,
        end: interval.end,
      })
    }

    var overallStart = pastMonths[0].start
    var overallEnd = pastMonths[pastMonths.length - 1].end

    $app
      .logger()
      .info(
        'Monthly Goals Cron: recalculando metas para ' +
          currentYear +
          '-' +
          pad2(currentMonthIdx + 1) +
          '. Média dos 3 meses: ' +
          overallStart +
          ' até ' +
          overallEnd,
      )

    var CHANNELS_LIST = [
      'Loja / Restaurante',
      'Central de Pedidos',
      'iFood',
      'Cardápio Web',
      '99Food',
      'WhatsApp',
      'Telefone',
    ]

    var filterSales = "date >= '" + overallStart + "' && date <= '" + overallEnd + "'"
    var salesRecords = []
    try {
      salesRecords = $app.findRecordsByFilter('daily_sales', filterSales, 'date', 5000, 0)
    } catch (err) {
      $app
        .logger()
        .warn(
          'Monthly Goals Cron: erro ao buscar daily_sales: ' +
            (err && err.message ? err.message : String(err)),
        )
    }

    var channelMonthlyTotals = {}
    for (var ci = 0; ci < CHANNELS_LIST.length; ci++) {
      var chName = CHANNELS_LIST[ci]
      channelMonthlyTotals[chName] = {}
      for (var mi = 0; mi < pastMonths.length; mi++) {
        channelMonthlyTotals[chName][pastMonths[mi].monthKey] = { orders: 0, revenue: 0 }
      }
    }

    for (var si = 0; si < salesRecords.length; si++) {
      var rec = salesRecords[si]
      var ch = rec.getString('channel')
      var dateStr = rec.getString('date')
      if (!channelMonthlyTotals[ch]) continue
      var mKey = dateStr.substring(0, 7)
      if (channelMonthlyTotals[ch][mKey]) {
        channelMonthlyTotals[ch][mKey].orders += rec.getInt('orders') || 0
        channelMonthlyTotals[ch][mKey].revenue += rec.getFloat('revenue') || 0
      }
    }

    var goalsCollection = $app.findCollectionByNameOrId('goals')
    var allGoals = []
    try {
      allGoals = $app.findRecordsByFilter('goals', '', '', 100, 0)
    } catch (_) {}

    var updatedCount = 0

    for (var cj = 0; cj < CHANNELS_LIST.length; cj++) {
      var channel = CHANNELS_LIST[cj]
      var monthlyData = channelMonthlyTotals[channel]
      var monthTickets = []
      var totalOrders3m = 0
      var totalRevenue3m = 0

      for (var pmi = 0; pmi < pastMonths.length; pmi++) {
        var pKey = pastMonths[pmi].monthKey
        var mInfo = monthlyData[pKey] || { orders: 0, revenue: 0 }
        totalOrders3m += mInfo.orders
        totalRevenue3m += mInfo.revenue
        if (mInfo.orders > 0 && mInfo.revenue > 0) {
          monthTickets.push(mInfo.revenue / mInfo.orders)
        }
      }

      var newStandardTicket = 0
      if (monthTickets.length > 0) {
        var sumTkt = 0
        for (var ti = 0; ti < monthTickets.length; ti++) {
          sumTkt += monthTickets[ti]
        }
        newStandardTicket = sumTkt / monthTickets.length
      } else if (totalOrders3m > 0 && totalRevenue3m > 0) {
        newStandardTicket = totalRevenue3m / totalOrders3m
      }

      var goalRec = null
      for (var gi = 0; gi < allGoals.length; gi++) {
        if (allGoals[gi].getString('channel') === channel) {
          goalRec = allGoals[gi]
          break
        }
      }

      var oldStandardTicket = goalRec ? goalRec.getFloat('standard_ticket') || 0 : 0
      var oldRevenue = goalRec ? goalRec.getFloat('goal_revenue') || 0 : 0
      var oldOrders = goalRec ? goalRec.getInt('goal_orders') || 0 : 0

      if (newStandardTicket <= 0) {
        newStandardTicket = oldStandardTicket > 0 ? oldStandardTicket : 0
      }

      newStandardTicket = Math.round(newStandardTicket * 100) / 100

      var newGoalRevenue = oldRevenue
      if (oldStandardTicket > 0 && newStandardTicket > 0 && oldRevenue > 0) {
        var variation = newStandardTicket / oldStandardTicket
        newGoalRevenue = Math.round(oldRevenue * variation * 100) / 100
      }

      var newGoalOrders = oldOrders
      if (newStandardTicket > 0 && newGoalRevenue > 0) {
        newGoalOrders = Math.round(newGoalRevenue / newStandardTicket)
      }

      if (!goalRec) {
        goalRec = new Record(goalsCollection)
        goalRec.set('channel', channel)
        goalRec.set('period', 'Mensal')
        goalRec.set('notes', 'Criado automaticamente pelo cron mensal de metas')
      }

      goalRec.set('standard_ticket', newStandardTicket)
      goalRec.set('goal_revenue', newGoalRevenue)
      goalRec.set('goal_orders', newGoalOrders)

      try {
        $app.save(goalRec)
        updatedCount++
      } catch (saveErr) {
        $app
          .logger()
          .warn(
            'Monthly Goals Cron: falha ao salvar metas de ' +
              channel +
              ': ' +
              (saveErr && saveErr.message ? saveErr.message : String(saveErr)),
          )
      }
    }

    $app
      .logger()
      .info('Monthly Goals Cron: finalizado com sucesso. Metas atualizadas: ' + updatedCount)
    console.log(
      '[Monthly Goals Cron] Finalizado com sucesso. Metas atualizadas: ' +
        updatedCount +
        ' de ' +
        CHANNELS_LIST.length,
    )
  } catch (error) {
    console.error('[Monthly Goals Cron] ERRO:', error)
    var errorStack = error && error.stack ? error.stack : ''
    var errorMessage = error && error.message ? error.message : String(error)
    $app
      .logger()
      .error(
        'Monthly Goals Cron: Exceção não tratada: ' +
          errorMessage +
          (errorStack ? ' | stack: ' + errorStack : ''),
      )
  }
})
