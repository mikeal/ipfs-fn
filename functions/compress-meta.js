const fn = require('../')
const util = require('./util')
const zlib = require('zlib')
const JSONStream = require('json-stream')
const csvWriter = require('csv-write-stream')

let test = fn('/gharchive', async api => {
  let decompressed = api.file.getStream().pipe(zlib.createUnzip())
  let reader = decompressed.pipe(JSONStream())
  let writer = csvWriter()

  let [year, month, day] = api.file.name.split('-')
  let _name = api.file.name.slice(0, api.file.name.indexOf('.'))
  let dest = `/gharchive-csv/meta/${year}/${month}/${day}/${_name}.csv`

  writer.pipe(api.createFile(dest))

  for await (let event of reader) {
    /* Drop gist data and user follows */
    if (event.type !== 'GistEvent' &&
        event.type !== 'FollowEvent' &&
        event.type !== 'DownloadEvent') {
      let Type = event.type.slice(event.type.length - 'Event'.length)
      let Repo = util.identifyRepo(event)
      let Actor

      if (typeof event.actor === 'string') Actor = event.actor
      else if (event.actor) Actor = event.actor.login
      else {
        continue
      }

      if (Repo === '/') Repo = null

      if (!Type || !Actor || !Repo) {
        throw new Error('Cannot identify')
      }

      writer.write({Type, Actor, Repo})
    }
  }
  writer.end()
})
test.run('/ip4/127.0.0.1/tcp/5001', 'test')

