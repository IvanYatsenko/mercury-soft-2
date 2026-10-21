/** A temperature point or stage duration in seconds and its target temperature. */
export interface TemperatureValue {
  second: number;
  temperature: number;
}

/** The simplified profile stores cooling duration as zero; cooling is calculated. */
export interface EasyCoolingShelf extends TemperatureValue {
  second: 0;
}

export interface ProfileBase {
  id?: string;
  name: string;
  board: boolean;
  points: TemperatureValue[];
}

/** Easy mode derives its temperature curve from two holds and a cooling target. */
export interface EasyProfile extends ProfileBase {
  mode: 'easy';
  repeat?: number;
  shelves: [TemperatureValue, TemperatureValue, EasyCoolingShelf];
}

/** Manual mode stores the three shelf values alongside explicitly entered points. */
export interface ManualProfile extends ProfileBase {
  mode: 'manual';
  repeat?: number;
  shelves: [TemperatureValue, TemperatureValue, TemperatureValue];
}

export type Profile = EasyProfile | ManualProfile;
export {
  validateProfile,
  profileDurationPoints,
  buildProfilePlan,
  buildRunPlan,
  targetAt,
  rateAtTemperature,
} from './profilePlan.js';
export type {
  ProfilePlan,
  RunStatus,
  RunSample,
  RunRecord,
  RunState,
  TemperatureRate,
  ResponseBand,
} from './profilePlan.js';

export { convertProfileMode } from './convertProfile.js';
export { manualCoolingWarnings } from './profilePlan.js';
export {
  heatOutputs,
  defaultThermalSettings,
  validateThermalSettings,
} from './thermalControl.js';
export type { HeatOutput, ThermalSettings } from './thermalControl.js';
export type {
  CalibrationPoint,
  ConnectionVoltage,
  OutputIndex,
  OvenConfiguration,
  OvenModel,
  OvenSelection,
  SpeedLevel,
  SpeedPoint,
} from './ovens/index.js';
