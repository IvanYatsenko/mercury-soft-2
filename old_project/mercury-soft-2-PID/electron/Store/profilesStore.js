import fs from 'node:fs'
import path from 'node:path'
import { uuid as uuidv4 } from 'uuidv4'
import { JSONFileWithState } from '../FileManager/JSONFile'
import { app } from 'electron'

const fsPromises = fs.promises

const userDataPath = app.getPath('userData')
const defaultProfileFolder = path.join(userDataPath, '/profiles')
const currentProfileFileName = path.join(userDataPath, '/currentProfile')

class Profile extends JSONFileWithState {
  constructor(
    filename,
    defaultValues = { points: [], name: '', mode: 'manual', shelves: [] },
  ) {
    super(filename, defaultValues)
  }

  get absolutePoints() {
    if (this.state.points.length === 0) {
      return []
    }

    const [first, ...rest] = this.state.points

    return rest.reduce(
      (arr, cur) => {
        const last = arr[arr.length - 1]
        arr.push({
          second: cur.second + last.second,
          temperature: cur.temperature,
        })
        return arr
      },
      [first],
    )
  }
}

class ProfilesStore {
  constructor() {
    console.time('load profiles')
    this.init().then(() => {
      console.timeEnd('load profiles')
    })
  }

  profilesFolder = defaultProfileFolder

  state = {
    isLoading: false,
  }

  profiles = []

  getProfiles() {
    return this.profiles.map((p) => {
      const { filepath, canSync, state } = p
      return { filepath, canSync, state }
    })
    // Profile2 {
    //   filepath: '/home/yia/.config/mercury-soft-2/profiles/dde2a586-0a77-427b-ba1b-361dd65e189c',
    //   canSync: true,
    //   sync: [Function (anonymous)],
    //   init: [Function (anonymous)],
    //   state: {
    //     points: [Array],
    //     name: 'Тест-01',
    //     mode: 'manual',
    //     shelves: [],
    //     board: false
    //   },
    //   clear: [Function (anonymous)]
    // }
  }

  currentProfileJson = new JSONFileWithState(currentProfileFileName, {
    currentProfile: undefined,
  })

  loadProfileFromFile = (profilePath) => {
    let profile = new Profile(profilePath)
    if (profile.state.mode == 'easy') {
      this.updateShelvesByPoints(JSON.stringify(profile.state))
      this.updatePointsByShelves(JSON.stringify(profile.state))
    }
    return profile
  }

  init = () => {
    if (!this.profilesFolder) {
      return
    }

    if (!fs.existsSync(this.profilesFolder)) {
      fs.mkdirSync(this.profilesFolder)
    }

    this.state.isLoading = true
    return fsPromises
      .readdir(this.profilesFolder)
      .then((files) =>
        Promise.all(
          files.map((filename) => {
            const filePath = path.join(this.profilesFolder, filename)
            return this.loadProfileFromFile(filePath)
          }),
        ),
      )
      .then((profiles) => {
        this.profiles = profiles
        this.placeCurrentFirst()
        this.state.isLoading = false
      })
  }

  create = (profileData, callback) => {
    const state = JSON.parse(profileData)
    this.state.isLoading = true
    const filename = uuidv4()
    const filepath = path.join(this.profilesFolder, filename)

    fs.open(filepath, 'w', (err, fd) => {
      fs.writeFile(fd, JSON.stringify(state, null, '  '), () => {
        fs.fdatasync(fd, () => {
          const newProfile = new Profile(filepath, state)

          this.updateShelvesByPoints(JSON.stringify(newProfile.state))
          this.updatePointsByShelves(JSON.stringify(newProfile.state))

          this.profiles.push(newProfile)
          this.state.isLoading = false
          callback()
        })
      })
    })
  }

  update = (profileData, profilePath, callback) => {
    const state = JSON.parse(profileData)
    this.state.isLoading = true
    // const filepath = path.join(this.profilesFolder, filename)

    fs.open(profilePath, 'w', (err, fd) => {
      fs.writeFile(fd, JSON.stringify(state, null, '  '), () => {
        // fs.fdatasync(fd, () => {
        //   // const newProfile = new Profile(filepath, state)

        //   // this.updateShelvesByPoints(JSON.stringify(newProfile.state))
        //   // this.updatePointsByShelves(JSON.stringify(newProfile.state))

        // })
        return fsPromises
          .readdir(this.profilesFolder)
          .then((files) =>
            Promise.all(
              files.map((filename) => {
                const filePath = path.join(this.profilesFolder, filename)
                return this.loadProfileFromFile(filePath)
              }),
            ),
          )
          .then((profiles) => {
            this.profiles = profiles
            this.placeCurrentFirst()
            this.state.isLoading = false
            callback()
          })
      })
    })
  }

  remove = (filepath, callback) => {
    this.state.isLoading = true
    this.currentProfileJson.state['currentProfile'] = undefined

    return fsPromises.unlink(filepath).then(() => {
      const newProfiles = this.profiles.filter((p) => p.filepath != filepath)
      this.profiles = [...newProfiles]
      this.state.isLoading = false
      callback()
    })
  }

  updatePointsByShelves = (profileJson) => {
    const state = JSON.parse(profileJson)
    //создание профиля по полкам
    const points = [{ second: 0, temperature: 30 }]

    let heatSpeed = 0.8

    let coolSpeed250 = 0.4
    let coolSpeed200 = 0.3
    let coolSpeed150 = 0.2

    for (let i = 0; i < state.shelves.length - 1; i++) {
      let a =
        (state.shelves[i].temperature - points[points.length - 1].temperature) /
        heatSpeed
      if (a < 0) {
        a = -a * heatSpeed * coolSpeed150
      }

      points.push({
        second: Math.round(a),
        temperature: state.shelves[i].temperature,
      })
      points.push(state.shelves[i])
    }

    let prevTemp = points[points.length - 1].temperature
    let coolTemp = state.shelves[state.shelves.length - 1].temperature

    let coolSpeed = coolSpeed250

    if (prevTemp > 200 && coolTemp < 200) {
      const coolingTime = (prevTemp - 200) / coolSpeed250
      points.push({ second: Math.round(coolingTime), temperature: 200 })
      prevTemp = 200
      coolSpeed = coolSpeed200
    }

    if (prevTemp > 150 && coolTemp < 150) {
      const coolingTime = (prevTemp - 150) / coolSpeed200
      points.push({ second: Math.round(coolingTime), temperature: 150 })
      prevTemp = 150
      coolSpeed = coolSpeed150
    }

    let coolingTime = (prevTemp - coolTemp) / coolSpeed
    if (coolingTime < 0) {
      coolingTime = (-coolingTime * coolSpeed) / heatSpeed
    }

    points.push({ second: Math.round(coolingTime), temperature: coolTemp })
    state.points = points
  }

  updateShelvesByPoints = (profileJson) => {
    const state = JSON.parse(profileJson)
    console.log('updateShelvesByPoints')
    const shelves = []

    state.points.filter((value, i) => {
      if (
        i < state.points.length - 1 &&
        value.temperature === state.points[i + 1].temperature
      ) {
        if (shelves.length < 2) {
          shelves.push(state.points[i + 1])
        }
      }
    })

    if (shelves.length < 1) {
      shelves.push({ second: 110, temperature: 150 })
    }

    if (shelves.length < 2) {
      shelves.push({ second: 50, temperature: 220 })
    }

    let lastTemp = 100
    const pLen = state.points.length
    if (pLen > 0) {
      lastTemp = state.points[pLen - 1].temperature
    }

    shelves.push({ second: 0, temperature: lastTemp })
    state.shelves = shelves
  }

  saveProfile = (profile) => {
    this.currentProfileJson.state['currentProfile'] = profile.filepath
    this.placeCurrentFirst()
  }

  placeCurrentFirst = () => {
    let currentProfile = this.currentProfileJson.state['currentProfile']

    if (currentProfile) {
      const index = this.profiles.findIndex(
        (p) => p.filepath === currentProfile,
      )
      if (index !== 0) {
        const temp = this.profiles[0]
        this.profiles[0] = this.profiles[index]
        this.profiles[index] = temp
      }
    }
  }
}

export default ProfilesStore
