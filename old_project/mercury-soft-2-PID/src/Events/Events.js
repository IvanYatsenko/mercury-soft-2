export const closeApp = async () => {
  window.close()
}

export const loadFile = async () => {
  const str = await window.api.loadFile()
  console.log(str)
}

export const coolingOven = async (temp) => {
  const newTemp = await window.api.coolingOven(temp)
  return newTemp
}

export const heatingOven = async (temp) => {
  const newTemp = await window.api.heatingOven(temp)
  return newTemp
}

export const togglePreservationTemperature = async () => {
  await window.api.togglePreservationTemperature()
}