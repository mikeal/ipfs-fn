# ipfs-fn

Functional transforms for ipfs files.

`ipfs-fn` is a way to write repeatable transformations of ipfs files into other ipfs files.

With `ipfs-fn`, a function is defined for a given route of data. That function can then create additional ipfs files.

When those files are written to ipfs, meta-information is stored about the source hash that created them.

If a file changes, it can be detected and the transforms run again. Transforms can be skipped when the file has already been created. If you change a transform function, you can clear the cached metadata to re-run.

When any file in a directory changes, the directory hash will change and directory level functions can also be run again.

### API

```javascript

let fn = require('ipfs-fn')

module.exports = fn('/gharchive/*.json.gz', async api => {
  api.file // source file from ipfs
  api.createFile('/gharchive/filename-meta.csv') // get new file wrapper
  /* The service stores meta information about the file 
     that associates it with the current service instance 
     including the hash, and with the source files hash.
  */
})

/* Directories */
module.exports = fn('/gharchive/', async api => {
  api.files // source files from ipfs
  api.createFile('/gharchive/filename-meta-summary.csv') // get new file wrapper
})
```

#### Storage

- /gharchive
  /.gharchive.fn/${functionName}/${desthash}.json
  /.gharchive.fn/${functionName}/${sourcehash}.json
  
### CLI

```
fn file.js ipfs://destination/gharchive // grabs functionName from filename.
fn --force                              // re-runs transforms and writes new files.
fn --concurrency=4                      // number of transforms to run at a time.
fn --clear functionName                 // cleans cached metadata for functionName
fn --test                               // don't write output files, just give information about the files being written
```
