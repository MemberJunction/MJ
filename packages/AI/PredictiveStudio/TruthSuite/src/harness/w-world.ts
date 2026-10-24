/** Features of the W-world membership-year tables the containment gates train on. */
export const W_WORLD_FEATURES: readonly string[] = [
  'Plan',
  'EventsAttended',
  'IncomeK',
  'AutoRenew',
  'Region',
  'Year',
  'Noise1',
  'Noise2',
  'Noise3',
  'Noise4',
  'Noise5',
];

/** Columns no containment-gate pipeline may use: keys, world stamps and the truth-suite write-back column. */
export const W_WORLD_DENY_FIELDS: readonly string[] = [
  'ID',
  'PersonID',
  'WorldID',
  'Seed',
  'TruthScore',
];
