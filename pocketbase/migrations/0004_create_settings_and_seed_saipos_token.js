migrate(
  (app) => {
    var collection = new Collection({
      name: 'settings',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'key', type: 'text', required: true },
        { name: 'value', type: 'text', required: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_settings_key ON settings (key)'],
    })
    app.save(collection)

    var saiposToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI5ZGMyZGM4My0wNTg4LTdhMzEtOGE1MS00NjQyMzdkMzM1OWUiLCJpYXQiOjE3ODUyNDM4NzZ9.mAsya8DaWs7CqTBfU8qHS8tJIpv8KUO9pbpFiHJWXdg'

    try {
      app.findFirstRecordByData('settings', 'key', 'SAIPOS_API_TOKEN')
    } catch (_) {
      var col = app.findCollectionByNameOrId('settings')
      var record = new Record(col)
      record.set('key', 'SAIPOS_API_TOKEN')
      record.set('value', saiposToken)
      app.save(record)
    }
  },
  (app) => {
    try {
      var col = app.findCollectionByNameOrId('settings')
      app.delete(col)
    } catch (_) {}
  },
)
