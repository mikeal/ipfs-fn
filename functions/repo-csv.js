const fn = require('../')
const fastcsv = require('fast-csv')

let test = fn.dir('/gharchive-csv/meta', async api => {
  for await (let file of api.files.entries()) {
    let reader = file.getFile().pipe(fastcsv({headers: true}))
    for await (let line of reader) {
      console.log(line)
    }
  }
})

test.run('/ip4/127.0.0.1/tcp/5001', 'test-repo-csv')