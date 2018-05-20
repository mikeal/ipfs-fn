const ipfsAPI = require('ipfs-api')
const streams = require('stream')
const bl = require('bl')

const arr = a => Array.from(a)

const mkdirp = (ipfs, paths) => {
  let _paths = new Set(paths.map(path => {
    return path.slice(0, path.lastIndexOf('/'))
  }))
  let opts = {parents: true}
  return Promise.all(arr(_paths).map(path => ipfs.files.mkdir(path, opts)))
}
const writeJSON = async (ipfs, writes) => {
  await mkdirp(ipfs, writes.map(w => w[0]))
  return Promise.all(writes.map(write => {
    let [path, value] = write
    return ipfs.files.write(path, Buffer.from(value), {create: true, truncate: true})
  }))
}

class API {
  constructor (fn, ipfs, name) {
    this._fn = fn
    this.ipfs = ipfs
    this.name = name
    this._files = new Set()
    this._writes = new Map()
  }
  get hash () {
    if (this.file) return this.file.hash
    if (this.files) return this.files.hash
    throw new Error('Either file or files must be set to get hash.')
  }
  createFile (path) {
    let pass = new streams.PassThrough({objectMode: true})
    let name = path.slice(path.lastIndexOf('/') + 1)
    let p = this.ipfs.files.add([{name, content:pass}])
    p.then(res => {
      this._writes.set(path, res[0])
      this._files.delete(p)
      this._check()
    })
    this._files.add(p)
    return pass
  }
  complete () {
    this._completeCalled = true
    return new Promise((resolve, reject) => {
      if (!this._files.size && this._completeCalled) {
        return resolve(this._complete())
      }
      this._resolve = resolve
    })
  }
  _check () {
    if (this._completeCalled && !this._files.size && this._resolve) {
      this._resolve(this._complete())
    }
  }
  async _complete () {
    console.log('_complete')
    // write metadata and return promise
    await mkdirp(this.ipfs, arr(this._writes.keys()))
    let writes = []

    await Promise.all(arr(this._writes.keys()).map(f => {
      return new Promise((resolve) => {
        this.ipfs.files.rm(f, () => {
          resolve()
        })
      })
    }))

    let res = await Promise.all(arr(this._writes.entries()).map(entry => {
      let [key, value] = entry
      return this.ipfs.files.cp([`/ipfs/${value.hash}`, key])
    }))

    let jsonwrites = [
      [ `/.fn/${this.name}/${this.hash}.json`,
        JSON.stringify([...this._writes])
      ],
      ...arr(this._writes.values()).map(value => {
        let tuple =
          [ `/.fn/${value.hash}.json`,
           JSON.stringify({ source: this.hash, fn: this.name })
          ]
        return tuple
      })
    ]

    await writeJSON(this.ipfs, jsonwrites)
    return this._writes
  }
}

const getFileAPI = async (ipfs, path) => {
  let stat = await ipfs.files.stat(path)
  stat.name = path.slice(path.lastIndexOf('/')+1)
  stat.path = path
  stat.getStream = () => {
    /* Wrapped in Core PassThrough stream for proper iterator suppoer */
    let pass = new streams.PassThrough({objectMode: true})
    ipfs.files.catReadableStream(stat.hash).pipe(pass)
    return pass
  }
  return stat
}

const getFilesAPI = async (ipfs, path) => {
  let stat = await ipfs.files.stat(path)
}

const isCached = async (ipfs, name, path, stat) => {
  if (!stat) {
    try {
      stat = await ipfs.files.stat(path)
    } catch (e) {
      if (e.message !== 'file does not exist') throw e
      return false
    }
  }
  try {
    await ipfs.files.stat(`/.fn/${name}/${stat.hash}.json`)
    return true
  } catch (e) {
    if (e.message !== 'file does not exist') throw e
    return false
  }
}

const getJSON = async (ipfs, path) => {
  let buff = await ipfs.files.read(path)
  return JSON.parse(buff.toString())
}

class FN {
  constructor (dir, handler, isDirectoryHandler=false) {
    if (dir.endsWith('/')) dir = dir.slice(0, dir.length - 1)
    this.dir = dir
    this.handler = handler
    this.isDirectoryHandler = isDirectoryHandler
  }
  async _run (ipfs, remote, name) {
    let results = {
      writes: {},
      skips: {}
    }

    let ls = await ipfs.files.ls(this.dir)

    // TODO: handle concurrency
    for (let file of ls) {
      // TODO: check per file cache
      let api = new API(this, ipfs, name)
      let path = `${this.dir}/${file.name}`
      console.log({path})
      api.file = await getFileAPI(ipfs, path)

      if (await isCached(ipfs, name, path, api.file)) {
        console.log(`${name}: Skipping ${path}, found cache.`)
        let _cacheFile = `/.fn/${name}/${api.file.hash}.json`
        results.skips[path] = await getJSON(ipfs, _cacheFile)
        continue
      }

      console.log("pre handler")
      await this.handler(api)
      console.log('post handler')
      let info = await api.complete()
      console.log('completed')
      results.writes[path] = [...info]
    }
    return results
  }
  async run (remote, name, concurrency=1) {
    let ipfs = ipfsAPI(remote)

    let stat = await ipfs.files.stat(this.dir)
    if (await isCached(ipfs, name, this.dir, stat)) {
      return console.log(`${name}: Skipping ${this.dir}, found cache.`)
    }

    // TODO: handle concurrency
    let results = await this._run(ipfs, remote, name)
    console.log(1)

    let _path = `/.fn/${name}/${stat.hash}.json`
    await new Promise((resolve) => {
      ipfs.files.rm(_path, () => {
        resolve()
      })
    })
    console.log(2)
    await mkdirp(ipfs, [_path])
    console.log(3)
    let value = Buffer.from(JSON.stringify(results))
    return ipfs.files.write(_path, value, {create: true})
  }
}


module.exports = (route, fn) => new FN(route, fn)
module.exports.dir = (route, fn) => new FN(route, fn, true)
