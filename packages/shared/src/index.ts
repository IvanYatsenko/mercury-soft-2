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

export { convertProfileMode } from './convertProfile.js';
