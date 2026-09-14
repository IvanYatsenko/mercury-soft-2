import fs from "node:fs"

export const writeFileAsync = async (filePath, logData) => {
    return new Promise((resolve, reject) => {
        try{
            fs.writeFile(filePath, logData, (err) => {
                if (err) {
                    reject(err.message)
                }
                return resolve()
            })
        } catch (e) {
            console.log(e)
        }
    })
}

export const appendFileAsync = async (filePath, logData) => {
    return new Promise((resolve, reject) => {
        try{
            fs.writeFile(filePath, logData, (err) => {
                if (err) {
                    reject(err.message)
                }
                return resolve()
            })
        } catch (e) {
            console.log(e)
        }
    })
}
