/** New models can be added as JSON files without changing this type. */
export type OvenModel = `${number}`;
export type ConnectionVoltage = '230' | '380';

export interface OvenSelection {
  ovenModel: OvenModel;
  connectionVoltage: ConnectionVoltage;
}
export type OutputIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CalibrationPoint {
  /** Temperature in °C. */
  temp: number;
  coef: number;
}

export interface SpeedPoint {
  /** Temperature in °C. */
  temp: number;
  /** Heating or cooling rate in °C/s; cooling rates are negative. */
  speed: number;
}

export interface SpeedLevel {
  /** Share of the heater/cooling power, from 0 to 1. */
  pow: number;
  ts: readonly SpeedPoint[];
}

export interface OvenConfiguration {
  model: OvenModel;
  name: string;
  designation: string;
  specifications: {
    boardWidthMm: number;
    boardDepthMm: number;
    boardHeightMm: number;
    maximumTemperatureC: number;
    profileStepSeconds: { min: number; max: number };
    maximumHeatingRateCPerSecond: number;
    maximumCoolingRateCPerSecond: number;
    maximumPowerKw: number;
  };
  /** Indexes in the eight-element ITMP setHV response; index 0 is reserved. */
  outputs: {
    singlePhase: Readonly<Record<string, OutputIndex>>;
    threePhase: Readonly<Record<string, OutputIndex>>;
  };
  /** Indexes in the arrays returned by get / sensors (zero-based). */
  sensors: {
    boardTemperature: { command: 'get'; index: 1; divisor: 4 };
    chamberTemperature: { command: 'get'; index: 2; divisor: 4 };
    door: { command: 'sensors'; index: 1 };
  };
  defaultThermocoupleCorrection: readonly CalibrationPoint[];
  speedProfiles: Readonly<
    Record<'light' | 'bothHeaters' | 'cooling', readonly SpeedLevel[]>
  >;
}
