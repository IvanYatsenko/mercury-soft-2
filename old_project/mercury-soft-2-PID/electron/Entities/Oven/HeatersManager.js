import { SPEED300, SPEED400 } from '../../Constants/CONST'
import HeatersCommands300 from '../../HeatersCommands/HeatersCommands300'
import HeatersCommands400 from '../../HeatersCommands/HeatersCommands400'
import HeatersMode from '../../HeatersMods/HeatersMode'
import ModeBothHeaters from '../../HeatersMods/ModeBothHeaters'
import ModeConvection from '../../HeatersMods/ModeConvection'
import ModeCooling from '../../HeatersMods/ModeCooling'
import ModeLight300 from '../../HeatersMods/ModeLight300'
import ModeLight400 from '../../HeatersMods/ModeLight400'
import ModeOff from '../../HeatersMods/ModeOff'

class HeatersManager {
  constructor(manager, mercuryType) {
    if (mercuryType == '300') {
      this.commands = new HeatersCommands300(manager)
      this.speeds = SPEED300
    } else {
      this.commands = new HeatersCommands400(manager)
      this.speeds = SPEED400
    }

    this.manager = manager
    this.mercuryType = mercuryType

    this.curMode = new HeatersMode()

    this.tableSpeed = {} // Dict[mode, Dict[pow, speed]]

    this.setMode('convection')

    this.prevError = 0;
    this.integral = 0;
    this.prevTime = Date.now();
  }

  getPidCoefficient = (currentTemp) => {
    let Kp = 0.075;
    let Ki = 0.0002;
    let Kd = 1.4;

    if (currentTemp >= 160) {
      Kp = 0.1;
    }

    return {Kd, Ki, Kp};
  }

  updateHeatersState = (heaters) => this.commands.updateHeatersState(heaters)

  updateSpeedTable = (temp) => {
    for (const [key, tableSrcMode] of Object.entries(this.speeds)) {
      let tableSpeedMode = []
      tableSrcMode.forEach((item) => {
        let pow = item.pow
        let tsTable = item.ts

        if (tsTable.length == 0) {
          return
        }

        if (tsTable.length == 1) {
          tableSpeedMode.push({ pow: pow, speed: tsTable[0].speed })
          return
        }

        let i2 = tsTable.findIndex((o) => o.temp >= temp)
        if (i2 == -1) {
          i2 = tsTable.length - 1
        }

        if (i2 == 0) {
          i2 = 1
        }
        let o2 = tsTable[i2]

        let i1 = i2 - 1
        let o1 = tsTable[i1]

        let tempRange = o2.temp - o1.temp
        let koef = (temp - o1.temp) / tempRange

        let powSpeed = o1.speed * (1 - koef) + o2.speed * koef
        tableSpeedMode.push({ pow: pow, speed: powSpeed })
      })

      if (tableSpeedMode.length > 0) {
        this.tableSpeed[key] = tableSpeedMode
      }
    }
  }

  selectPower = (mode, speed) => {
    if (mode == 'convection') {
      return 1
    } else if (mode == 'bothHeaters' || mode == 'cooling' || mode == 'light') {
      let powSpeedTable = this.tableSpeed[mode]
      if (powSpeedTable.length == 0) {
        return 1
      }
      if (powSpeedTable.length == 1) {
        return powSpeedTable[0].pow
      }

      let i1 = 0
      let i2 = 1
      let found = false
      for (let i = 0; i < powSpeedTable.length - 1; i++) {
        let s1 = powSpeedTable[i]
        let s2 = powSpeedTable[i + 1]
        if ((s1 <= speed && s2 >= speed) || (s1 >= speed && s2 <= speed)) {
          i1 = i
          i2 = i + 1
          found = true
          break
        }
      }
      if (!found) {
        i1 = 0
        i2 = powSpeedTable.length - 1
      }

      let o2 = powSpeedTable[i2]
      let o1 = powSpeedTable[i1]

      let speedRange = o2.speed - o1.speed
      let koef = (speed - o1.speed) / speedRange
      let resPow = o1.pow * (1 - koef) + o2.pow * koef
      return resPow
    }

    return 1
  }

  selectMode = (speed, allowCool = false, allowLight = true) => {
    const coolSpeed = this.tableSpeed['cooling'].map((elem) => elem.speed)

    const coolMax = Math.max(...coolSpeed)

    const lightSpeed = this.tableSpeed['light'].map((elem) => elem.speed)

    const lightMin = Math.min(...lightSpeed)

    if (speed > lightMin && allowLight) {
      return 'light'
    } else {
      if (speed < coolMax && allowCool) {
        return 'cooling'
      } else if (speed < coolMax) {
        return 'convection'
      } else {
        return 'bothHeaters'
      }
    }
  }

  regulate = (
      temp,
      targetTemp,
      targetSpeed,
      nextSpeed = targetSpeed,
      timeToNext = 100,
      allowLight = true
  ) => {
    const now = Date.now();
    const dt = (now - this.prevTime) / 1000 || 1;

    const {Kp, Kd, Ki} = this.getPidCoefficient(temp);

    // Сглаживание derivative
    if (this.derivative === undefined) this.derivative = 0;

    let expectedTemp = targetTemp;
    const blend = Math.max(0, Math.min(1, timeToNext / 10));
    expectedTemp = targetTemp * blend + (targetTemp + nextSpeed * 10) * (1 - blend);

    const error = expectedTemp - temp;

    // Обновление производной (сглаженной)
    this.derivative = this.derivative * 0.9 + (error - this.prevError) / dt * 0.1;

    // Anti-windup: сбрасываем интеграл при перегреве
    if (error > 0) {
      this.integral += error * dt;
    } else if (error < -0.5) {
      // при перегреве
      this.integral -= Math.abs(error) * dt;
    }

    const MAX_I = 300;
    this.integral = Math.max(-MAX_I, Math.min(MAX_I, this.integral));

    // PID
    const P = Kp * error;
    const I = Ki * this.integral;
    const D = Kd * this.derivative;
    let pidOutput = P + I + D;

    pidOutput = Math.max(Math.min(pidOutput, 3), -3);


    const allowCool = error < -0.5;

    this.prevError = error;
    this.prevTime = now;

    this.setSpeed(pidOutput, expectedTemp, allowCool, allowLight);
  }


  setSpeed = (speed, temp, allowCool = false, allowLight = true) => {
    this.updateSpeedTable(temp)

    let mode = this.selectMode(speed, allowCool, allowLight)
    let power = this.selectPower(mode, speed)

    this.setMode(mode, power)
  }

  setMode = (mode, power = 1) => {

    this.manager.emit('oven-heat-mode', { mode, power })

    if (this.curMode.getType() === mode) {
      this.curMode.setPower(power)
      return
    }

    this.curMode.stopMode()

    switch (true) {
      case mode == 'bothHeaters':
        this.curMode = new ModeBothHeaters(this.commands, power)
        break
      case mode == 'convection':
        this.curMode = new ModeConvection(this.commands)
        break
      case mode == 'cooling':
        this.curMode = new ModeCooling(this.commands, power)
        break
      case mode == 'light' && this.mercuryType == '300':
        this.curMode = new ModeLight300(this.commands, power)
        break
      case mode == 'light' && this.mercuryType == '400':
        this.curMode = new ModeLight400(this.commands, power)
        break
      case mode == 'off':
        this.curMode = new ModeOff(this.commands)
        break
    }
  }

  getMode = () => {
    return this.curMode.getType()
  }

  disable = () => {
    if (this.curMode.getType() == '') {
      return
    }

    this.curMode.stopMode()
    this.commands.convection().catch(() => {})
    this.curMode = new HeatersMode()
  }
}

export default HeatersManager
