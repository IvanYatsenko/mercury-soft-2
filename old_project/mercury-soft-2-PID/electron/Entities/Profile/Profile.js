const getXBetweenTwoPoints = (y, x1, y1, x2, y2) =>
  ((y - y1) * (x2 - x1)) / (y2 - y1) + x1
const getYBetweenTwoPoints = (x, x1, y1, x2, y2) =>
  ((x - x1) * (y2 - y1)) / (x2 - x1) + y1

class Profile {
  constructor(profile) {
    this.profile = profile
  }

  predictTemperature = (second) => {
    if (second <= this.profile[0].second) {
      return this.profile[0].temperature
    }
    if (second >= this.getLastSecond()) {
      return this.profile[this.profile.length - 1].temperature
    }
    const endPointIndex = this.profile.findIndex((p) => p.second > second)
    const startPointIndex = endPointIndex - 1

    const { second: s1, temperature: t1 } = this.profile[startPointIndex]
    const { second: s2, temperature: t2 } = this.profile[endPointIndex]
    return getYBetweenTwoPoints(second, s1, t1, s2, t2)
  }

  predictSecond = (temperature) => {
    const endPointIndex = this.profile.findIndex(
      (p) => p.temperature > temperature,
    )
    if (endPointIndex <= 0) {
      return 0
    }
    const startPointIndex = endPointIndex - 1
    const { second: s1, temperature: t1 } = this.profile[startPointIndex]
    const { second: s2, temperature: t2 } = this.profile[endPointIndex]
    const floatSec = getXBetweenTwoPoints(temperature, s1, t1, s2, t2)
    return Math.round(floatSec)
  }

  getLastSecond = () => this.profile[this.profile.length - 1].second

  getPosition = (second) => {
    const current = this.profile.findIndex((step) => step.second > second)
    return this.profile[current]
  }

  getPrevPosition = (second) => {
    const current = this.profile.findIndex((step) => step.second > second)
    if (current > 0) {
      return this.profile[current - 1]
    }
    return this.profile[0]
  }

  getNextPosition = (second) => {
    const current = this.profile.findIndex((step) => step.second > second)
    if (current == this.profile.length - 1) {
      return this.profile[current]
    }
    return this.profile[current + 1]
  }

  calcSecond = (temp, second) => {
    const nextCheckpointIdx = this.profile.findIndex((p) => p.second > second)
    const prevCheckpointIdx = nextCheckpointIdx - 1

    if (prevCheckpointIdx < 0) {
      return second
    }

    const nextCheckpoint = this.profile[nextCheckpointIdx]
    const prevCheckpoint = this.profile[prevCheckpointIdx]

    if (nextCheckpoint.temperature >= prevCheckpoint.temperature) {
      if (temp + 4 >= nextCheckpoint.temperature) {
        return second
      }

      return this.predictSecond(temp)
    }

    const { second: s1, temperature: t1 } = this.profile[prevCheckpointIdx]
    const { second: s2, temperature: t2 } = this.profile[nextCheckpointIdx]
    const floatSec = getXBetweenTwoPoints(temp, s1, t1, s2, t2)

    return Math.round(floatSec)
  }
}

export default Profile
