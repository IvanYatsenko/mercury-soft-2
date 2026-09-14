import { makeAutoObservable, runInAction } from 'mobx'

class ProfilesStore {
  profiles = []
  isLoading = false

  constructor(connect, ovenStore) {
    this.connect = connect
    makeAutoObservable(this)
    this.ovenStore = ovenStore
    if (window.ipcRenderer) {
      connect.on('init-profiles-client', (_event, data) => {
        runInAction(() => {
          this.profiles = [...data]
          this.isLoading = false
        })
      })
      connect.send('init-profiles')
    } else {
      connect.on('init-profiles-client', (data) => {
        runInAction(() => {
          this.profiles = [...data]
          this.isLoading = false
        })
      })
      connect.emit('init-profiles')
    }
    this.isLoading = true
  }

  removeProfile(filepath) {
    this.isLoading = true
    if (window.ipcRenderer) {
      this.connect.send('removeProfile', filepath)
    } else {
      this.connect.emit('removeProfile', filepath)
    }
  }

  updateProfile(profileData, profilePath) {
    this.isLoading = true
    if (window.ipcRenderer) {
      this.connect.send('updateProfile', profileData, profilePath)
    } else {
      this.connect.emit('updateProfile', profileData, profilePath)
    }
  }

  updateShelvesByPoints(profileData) {
    if (window.ipcRenderer) {
      this.connect.send('updateShelvesByPoints', profileData)
    } else {
      this.connect.emit('updateShelvesByPoints', profileData)
    }
  }

  updatePointsByShelves(profileData) {
    if (window.ipcRenderer) {
      this.connect.send('updatePointsByShelves', profileData)
    } else {
      this.connect.emit('updatePointsByShelves', profileData)
    }
  }

  placeCurrentFirst() {}

  createProfile(profileData) {
    this.isLoading = true
    if (window.ipcRenderer) {
      this.connect.send('createProfile', profileData)
    } else {
      this.connect.emit('createProfile', profileData)
    }
  }
}
export default ProfilesStore
