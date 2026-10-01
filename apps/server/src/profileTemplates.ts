import type { ManualProfile } from '@mercury/shared';

/** Built-in profiles used as starting points when creating a new profile. */
export const profileTemplates: ManualProfile[] = [
  {
    board: false,
    mode: 'manual',
    name: 'Свинцовая паста',
    points: [
      { second: 0, temperature: 30 },
      { second: 150, temperature: 150 },
      { second: 110, temperature: 150 },
      { second: 100, temperature: 230 },
      { second: 20, temperature: 230 },
      { second: 75, temperature: 200 },
      { second: 167, temperature: 150 },
      { second: 250, temperature: 100 },
    ],
    shelves: [
      { second: 110, temperature: 150 },
      { second: 20, temperature: 230 },
      { second: 492, temperature: 100 },
    ],
  },
  {
    board: false,
    mode: 'manual',
    name: 'Бессвинцовая паста',
    points: [
      { second: 0, temperature: 30 },
      { second: 212, temperature: 200 },
      { second: 110, temperature: 200 },
      { second: 75, temperature: 260 },
      { second: 30, temperature: 260 },
      { second: 150, temperature: 200 },
      { second: 167, temperature: 150 },
      { second: 250, temperature: 100 },
    ],
    shelves: [
      { second: 110, temperature: 200 },
      { second: 30, temperature: 260 },
      { second: 400, temperature: 100 },
    ],
  },
];
