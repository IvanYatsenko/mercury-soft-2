import fs from 'node:fs'
import path from 'node:path'
const fsPromises = fs.promises

export class JSONFile {
  constructor(filepath) {
    this.filepath = filepath

    if (!fs.existsSync(filepath)) {
      fsPromises.writeFile(this.filepath, '{}')
    }
  }

  filepath = null

  canSync = false

  get folder() {
    return path.dirname(this.filepath)
  }

  get toJS() {
    return {}
  }

  sync = () => {
    this.canSync = false
    fs.open(this.filepath, 'w', (err, fd) => {
      fs.writeFile(fd, JSON.stringify(this.toJS, null, '  '), () => {
        fs.fdatasync(fd, () => {
          this.canSync = true
        })
      })
    })
  }

  init = () => {
    try {
      return JSON.parse(fs.readFileSync(this.filepath))
    } catch {
      return {}
    }
  }
}

export class JSONFileWithState extends JSONFile {
  constructor(filename, defaultValues) {
    super(filename)
    let stateBuf = this.init()
    this.state = { ...defaultValues, ...stateBuf }
    this.canSync = true
  }

  state = {}

  get toJS() {
    return this.state
  }

  clear = () => {
    this.state = {}
  }
}
