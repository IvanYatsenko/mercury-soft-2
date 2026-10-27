import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'mercury-prototype-'));
process.env.MERCURY_CONTROLLER_MODE = 'simulation';
process.env.NODE_ENV = 'test';
process.env.MERCURY_DATABASE_PATH = join(directory, 'test.sqlite');
process.env.MERCURY_CONFIG_PATH = join(directory, 'config.json');
process.env.MERCURY_LOG_USB_MOUNT = join(directory, 'unmounted-usb');
await writeFile(
  process.env.MERCURY_CONFIG_PATH,
  JSON.stringify({ ovenModel: '300', connectionVoltage: '230' }),
);
const plans = await import('../../../packages/shared/dist/index.js');
const db = await import('../dist/database.js');
// Disposable on-disk fixture for control tests; never a production fallback.
const { historySchema } = await import('../dist/historyStorage.js');
const testHistory = new DatabaseSync(join(directory, 'test-history.sqlite'));
testHistory.exec(historySchema);
db.setTestHistoryStorage({
  prepare: (sql) => testHistory.prepare(sql),
  storedQuery: async (sql, args = []) => testHistory.prepare(sql).all(...args),
  pauseWorkerForMaintenance: async () => false,
  resumeWorkerAfterMaintenance: async () => {},
  flush: async () => {},
  close: () => testHistory.close(),
});
const { ProfileRunner } = await import('../dist/profileRunner.js');
const { VirtualBoard, virtualBoard } =
  await import('../dist/controller/virtualBoard.js');
const {
  testOvenElement,
  setConvectionEnabled,
  checkControllerConnection,
  initializeControllerConnection,
  playBoardStartupSound,
  playBoardCompletionSound,
  playBoardErrorSound,
  applyProfileOutputs,
  setDoorWarning,
} = await import('../dist/controller/checkControllerConnection.js');
const settings = await import('../dist/ovenSettings.js');
const { ThermalRegulator } = await import('../dist/thermalRegulator.js');
const { planHeatPulse } = await import('../dist/predictiveHeat.js');

test('predictive heat fills the remaining three seconds and coasts with inertia', () => {
  const pulse = planHeatPulse(149, 150, 0, 1, 2400, 2600);
  const power = {
    off: 0,
    oneHeater: 1200,
    heaters: 2400,
    lamps: 2600,
    combined: 5000,
  }[pulse.source];
  assert.ok(Math.abs(((3 * power) / 5000) * pulse.duty - 1) < 0.1);
  assert.equal(planHeatPulse(149, 150, 0.6, 1, 2400, 2600).source, 'off');
  assert.equal(planHeatPulse(150, 149, 0, 1, 2400, 2600).source, 'off');
});

test('five-second predictive horizon tracks a ramp through actuator inertia without a fixed deficit', () => {
  for (const fullRate of [0.9, 1.17, 1.5, 1.8]) {
    let temperature = 100;
    let rate = 0.8;
    const errors = [];
    for (let second = 0; second < 100; second++) {
      const target = 100 + second * 0.8;
      const pulse = planHeatPulse(
        temperature,
        target + 4,
        rate,
        fullRate,
        2400,
        5200,
      );
      const power = {
        off: 0,
        oneHeater: 1200,
        heaters: 2400,
        lamps: 5200,
        combined: 7600,
      }[pulse.source];
      // An independent first-order plant: commands change velocity gradually.
      rate = 0.6 * rate + ((0.4 * fullRate * power) / 7600) * pulse.duty;
      temperature += rate;
      if (second > 20) errors.push(temperature - (target + 0.8));
    }
    assert.ok(Math.min(...errors) > -0.5, `fullRate=${fullRate}: ramp lag`);
    assert.ok(
      Math.max(...errors) < 0.5,
      `fullRate=${fullRate}: ramp overshoot`,
    );
  }
});

test('controller feedback preserves quarter-degree readings from both sensors', async () => {
  virtualBoard.reset();
  virtualBoard.setTemperatures(27.25, 49.75);
  const board = await checkControllerConnection();
  assert.equal(board.telemetry.boardTemperatureC, 27.25);
  assert.equal(board.telemetry.chamberTemperatureC, 49.75);
  virtualBoard.reset();
});

test('quarter-degree shelf feedback avoids a persistent one-degree deficit at varying cadence', () => {
  for (const dt of [1, 1.14]) {
    const thermal = {
      ...plans.defaultThermalSettings,
      mode: 'combined',
      powersW: {
        topHeater: 1200,
        bottomHeater: 1200,
        infrared: 2600,
        infrared2: 2600,
        infrared3: 0,
      },
    };
    const regulator = new ThermalRegulator(thermal, 0.7, 0.4);
    let temperature = 149;
    const errors = [];
    for (let tick = 0; tick < 900; tick++) {
      const output = regulator.step(
        Math.round(temperature * 4) / 4,
        150,
        150,
        0,
        dt,
        2200,
      );
      const power = plans.heatOutputs.reduce(
        (sum, name) => sum + (output[name] ? thermal.powersW[name] : 0),
        0,
      );
      assert.ok(!(output.cooling && power > 0));
      temperature +=
        (power > 0 ? (0.7 * power) / 5000 : output.cooling ? -0.4 : -0.08) * dt;
      if (tick > 300) errors.push(temperature - 150);
    }
    assert.ok(
      errors.reduce((sum, value) => sum + value, 0) / errors.length > -0.25,
    );
    assert.ok(Math.min(...errors) > -0.5);
    assert.ok(Math.max(...errors) < 0.5);
  }
});

test('shelf power compensates sustained losses for M300 and M400 without oversized pulses', () => {
  for (const lampTotal of [2600, 10800])
    for (const loss of [0.08, 0.3, 0.5]) {
      const thermal = {
        ...plans.defaultThermalSettings,
        mode: 'combined',
        powersW: {
          topHeater: 1200,
          bottomHeater: 1200,
          infrared: lampTotal === 2600 ? 2600 : 3600,
          infrared2: lampTotal === 2600 ? 2600 : 3600,
          infrared3: lampTotal === 2600 ? 0 : 3600,
        },
      };
      const fullRate = lampTotal === 2600 ? 0.8 : 1.7;
      const regulator = new ThermalRegulator(thermal, fullRate, 0.4);
      let temperature = 198;
      const errors = [];
      for (let tick = 0; tick < 900; tick++) {
        const output = regulator.step(
          Math.round(temperature * 4) / 4,
          200,
          200,
          0,
          1.14,
          lampTotal === 2600 ? 2200 : Infinity,
        );
        const power = plans.heatOutputs.reduce(
          (sum, name) => sum + (output[name] ? thermal.powersW[name] : 0),
          0,
        );
        assert.ok(!(power > 0 && output.cooling));
        if (lampTotal === 2600)
          assert.ok(Number(output.infrared) + Number(output.infrared2) <= 1);
        temperature +=
          (((fullRate + loss) * power) / (lampTotal + 2400) -
            loss -
            (output.cooling ? 0.4 : 0)) *
          1.14;
        if (tick > 300) errors.push(temperature - 200);
      }
      const mean =
        errors.reduce((sum, value) => sum + value, 0) / errors.length;
      assert.ok(
        Math.abs(mean) < 0.35,
        `power=${lampTotal}, loss=${loss}, mean=${mean}`,
      );
      assert.ok(Math.max(...errors) < 0.65);
    }
});

test('ramp-to-shelf transition catches a deficit without a derivative heat blackout', () => {
  for (const model of [300, 400]) {
    const lamp = model === 300 ? 2600 : 3600;
    const thermal = {
      ...plans.defaultThermalSettings,
      mode: 'combined',
      powersW: {
        topHeater: 1200,
        bottomHeater: 1200,
        infrared: lamp,
        infrared2: lamp,
        infrared3: model === 300 ? 0 : lamp,
      },
    };
    const total = model === 300 ? 5000 : 13200;
    const budget = model === 300 ? 2200 : Infinity;
    // Deliberately mismatch the provisional M400 response to the plant, as
    // high-temperature calibration above 150 C has not yet been measured.
    const regulator = new ThermalRegulator(
      thermal,
      model === 300 ? 0.725 : 1.7,
      0.4,
    );
    for (let tick = 0; tick <= 20; tick++)
      regulator.step(
        240 + tick * 0.65,
        Math.min(259.2, 244 + tick * 0.76),
        260,
        0.8,
        1,
        budget,
      );
    let temperature = 253;
    let rate = 0.65;
    let peak = temperature;
    for (let tick = 0; tick < 30; tick++) {
      const output = regulator.step(
        Math.round(temperature * 4) / 4,
        260,
        260,
        0,
        1,
        budget,
      );
      const power = plans.heatOutputs.reduce(
        (sum, name) => sum + (output[name] ? thermal.powersW[name] : 0),
        0,
      );
      if (tick < 3)
        assert.ok(power > 0, 'do not coast with a seven-degree deficit');
      assert.ok(!(power && output.cooling));
      rate =
        0.7 * rate +
        0.3 * ((1.1 * power) / total - 0.3 - (output.cooling ? 0.5 : 0));
      temperature += rate;
      peak = Math.max(peak, temperature);
    }
    assert.ok(temperature >= 259, `M${model}: end=${temperature}`);
    assert.ok(peak < 260.75, `M${model}: peak=${peak}`);
    const cooling = regulator.step(260, 255, 253, -0.4, 1, budget, true);
    assert.ok(plans.heatOutputs.every((name) => !cooling[name]));
    assert.equal(cooling.cooling, true);
  }
});

test('shelf stays at its current reference when lookahead reaches the next cooling ramp', () => {
  for (const model of [300, 400]) {
    const lamp = model === 300 ? 2600 : 3600;
    const regulator = new ThermalRegulator(
      {
        ...plans.defaultThermalSettings,
        mode: 'combined',
        powersW: {
          topHeater: 1200,
          bottomHeater: 1200,
          infrared: lamp,
          infrared2: lamp,
          infrared3: model === 300 ? 0 : lamp,
        },
      },
      model === 300 ? 0.725 : 1.7,
      0.4,
    );
    const budget = model === 300 ? 2200 : Infinity;
    let heatingTicks = 0;
    for (let tick = 0; tick < 5; tick++) {
      const output = regulator.step(259, 260, 258.5, 0, 1, budget);
      if (plans.heatOutputs.some((name) => output[name])) heatingTicks++;
      assert.equal(output.cooling, false);
    }
    assert.ok(
      heatingTicks > 0,
      'future cooling must not prohibit heat on the current shelf',
    );
    const falling = regulator.step(259, 259.5, 257.5, -0.4, 1, budget);
    assert.ok(plans.heatOutputs.every((name) => !falling[name]));
  }
});

test('rising temperature near a shelf coasts before further heater impulses', () => {
  const regulator = new ThermalRegulator(
    thermalFixture('combined'),
    0.725,
    0.4,
  );
  let output;
  for (const temperature of [257, 257.5, 258, 258.5, 259, 259.5])
    output = regulator.step(temperature, 260, 260, 0, 1, 2200);
  assert.ok(plans.heatOutputs.every((name) => !output[name]));
  assert.equal(output.cooling, false);
});

test('combined shelf control does not force lamps and both heaters together', () => {
  const regulator = new ThermalRegulator(
    {
      ...plans.defaultThermalSettings,
      mode: 'combined',
      powersW: {
        topHeater: 1200,
        bottomHeater: 1200,
        infrared: 2600,
        infrared2: 2600,
        infrared3: 0,
      },
    },
    1,
    0.4,
  );
  let pulses = 0;
  for (let i = 0; i < 20; i++) {
    const output = regulator.step(149, 150, 150, 0, 1, 2200);
    assert.equal(output.infrared || output.infrared2, false);
    assert.ok(Number(output.topHeater) + Number(output.bottomHeater) <= 1);
    if (output.topHeater || output.bottomHeater) pulses++;
  }
  assert.ok(pulses > 0);
});

test('single-phase lamp rotation survives intermittent heat and regulator resets', () => {
  const regulator = new ThermalRegulator(thermalFixture('lamps'), 0.7, 0.4, [
    'infrared',
    'infrared2',
  ]);
  const pairs = [];
  for (let i = 0; i < 12; i++) {
    const output = regulator.step(25, 45, 45, 0, 1, 2200);
    pairs.push(output.infrared ? 'infrared' : 'infrared2');
    assert.equal(Number(output.infrared) + Number(output.infrared2), 1);
    regulator.step(45, 45, 45, 0, 1, 2200);
    regulator.reset();
  }
  assert.equal(pairs.filter((p) => p === 'infrared').length, 6);
  assert.equal(pairs.filter((p) => p === 'infrared2').length, 6);
  for (let i = 1; i < pairs.length; i++)
    assert.notEqual(pairs[i], pairs[i - 1]);
});

test('a sole available lamp output has an off tick after five seconds', () => {
  const regulator = new ThermalRegulator(thermalFixture('lamps'), 0.7, 0.4, [
    'infrared',
  ]);
  for (let i = 0; i < 5; i++)
    assert.equal(regulator.step(25, 45, 45, 0, 1, 2200).infrared, true);
  assert.equal(regulator.step(25, 45, 45, 0, 1, 2200).infrared, false);
  assert.equal(regulator.step(25, 45, 45, 0, 1, 2200).infrared, true);
});
const thermalFixture = (mode = 'combined') => ({
  ...plans.defaultThermalSettings,
  mode,
  kp: 1,
  auxiliaryPowerW: 200,
  powersW: {
    topHeater: 1000,
    bottomHeater: 1000,
    infrared: 1000,
    infrared2: 1000,
    infrared3: 1000,
  },
});

test('tracking a rising ramp does not require a steady temperature deficit to overcome damping', () => {
  const regulator = new ThermalRegulator(
    { ...thermalFixture(), kp: 0.075, ki: 0, kd: 1.4 },
    1.179,
    0.4,
  );
  let heating = 0;
  for (let second = 0; second < 60; second++) {
    const measured = 50 + 0.8 * second;
    const output = regulator.step(
      measured,
      measured + 1,
      measured + 5,
      0.8,
      1,
      2200,
    );
    if (second >= 30 && plans.heatOutputs.some((name) => output[name]))
      heating++;
    assert.equal(output.cooling, false);
    assert.ok(
      Number(output.infrared) +
        Number(output.infrared2) +
        Number(output.infrared3) <=
        1,
    );
  }
  assert.ok(
    heating > 0,
    'a ramp rising at the requested rate still needs heating pulses',
  );
  const coast = regulator.step(99, 99, 100, 0, 1, 2200);
  assert.ok(
    plans.heatOutputs.every((name) => !coast[name]),
    'stop heat before inertia crosses the upcoming shelf',
  );
});

test('quantized virtual ramp tracks without a persistent deficit and coasts into its shelf', () => {
  const board = new VirtualBoard();
  board.setTemperatures(30, 50);
  const thermal = {
    ...plans.defaultThermalSettings,
    mode: 'combined',
    powersW: {
      topHeater: 1200,
      bottomHeater: 1200,
      infrared: 2600,
      infrared2: 2600,
      infrared3: 0,
    },
  };
  const regulator = new ThermalRegulator(thermal, 0.7, 0.4);
  const targetAt = (t) =>
    t < 250
      ? 50 + 0.4 * t
      : t < 330
        ? 150
        : Math.max(100, 150 - 0.2 * (t - 330));
  const rampErrors = [];
  const shelfErrors = [];
  const coolingErrors = [];
  for (let second = 0; second <= 580; second++) {
    const measured = Math.round(board.snapshot().temperatures.t2);
    const slope =
      second < 250 ? 0.4 : second < 330 ? 0 : second < 580 ? -0.2 : 0;
    const output = regulator.step(
      measured,
      targetAt(second),
      targetAt(second + 5),
      slope,
      1,
      2200,
    );
    const power = plans.heatOutputs.reduce(
      (sum, name) => sum + (output[name] ? thermal.powersW[name] : 0),
      0,
    );
    assert.ok(!(output.cooling && power > 0));
    assert.ok(Number(output.infrared) + Number(output.infrared2) <= 1);
    board.advance(1, power > 0, output.cooling, power / 5000);
    const error = measured - targetAt(second);
    if (second >= 50 && second < 250) rampErrors.push(error);
    if (second >= 250 && second < 330) shelfErrors.push(error);
    if (second >= 330) coolingErrors.push(error);
  }
  assert.ok(
    Math.abs(rampErrors.reduce((sum, e) => sum + e, 0) / rampErrors.length) <
      1.5,
  );
  assert.ok(Math.max(...rampErrors.map(Math.abs)) <= 2.5);
  assert.ok(Math.max(...shelfErrors) <= 2);
  assert.ok(Math.max(...coolingErrors.map(Math.abs)) <= 2);
});

test('combined dispatch keeps both heaters with one rotating lamp pair on single phase', () => {
  const config = thermalFixture();
  const regulator = new ThermalRegulator(config, 0.7, 0.4);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const output = regulator.step(25, 45, 45, 0, 1, 2200);
    const active = plans.heatOutputs.filter((name) => output[name]);
    assert.ok(active.length > 0);
    assert.equal(output.topHeater, true);
    assert.equal(output.bottomHeater, true);
    assert.equal(
      active.filter((name) => name.startsWith('infrared')).length,
      1,
    );
    active.forEach((name) => seen.add(name));
    assert.equal(output.cooling, false);
  }
  assert.equal(seen.size, 5);
  const unlimited = new ThermalRegulator(config, 0.7, 0.4).step(
    25,
    45,
    45,
    0,
    1,
    Infinity,
  );
  assert.ok(plans.heatOutputs.every((name) => unlimited[name]));
});

test('heater and lamp modes route only their own outputs', () => {
  for (const mode of ['heaters', 'lamps']) {
    const output = new ThermalRegulator(thermalFixture(mode), 0.7, 0.4).step(
      25,
      45,
      45,
      0,
      1,
      Infinity,
    );
    for (const name of plans.heatOutputs)
      assert.equal(
        output[name],
        mode === 'lamps'
          ? name.startsWith('infrared')
          : !name.startsWith('infrared'),
      );
  }
});

test('cooling follows falling ramp immediately and excludes all heating', () => {
  const regulator = new ThermalRegulator(thermalFixture(), 0.7, 0.4);
  const output = regulator.step(100, 100, 96, -0.4, 1, 2200);
  assert.equal(output.cooling, true);
  const lowTemperature = new ThermalRegulator(thermalFixture(), 0.7, 0.4).step(
    45,
    45,
    43.8,
    -0.1167,
    1,
    2200,
  );
  assert.equal(lowTemperature.cooling, true);
  assert.ok(plans.heatOutputs.every((name) => !output[name]));
  const ended = regulator.step(100, 50, 50, -0.4, 1, 2200, true);
  assert.equal(ended.cooling, true);
  assert.ok(plans.heatOutputs.every((name) => !ended[name]));
});

test('thermal settings validate, persist and do not transfer to another oven', async () => {
  assert.throws(() =>
    plans.validateThermalSettings({ ...thermalFixture(), kp: NaN }),
  );
  assert.throws(() =>
    plans.validateThermalSettings({ ...thermalFixture(), powersW: null }),
  );
  const value = thermalFixture('lamps');
  await settings.saveThermalSettings(value);
  assert.equal(settings.readThermalSettings().mode, value.mode);
  assert.equal(settings.readThermalSettings().kp, value.kp);
  assert.equal(settings.readThermalSettings().powersW.infrared, 2600);
  const persisted = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  assert.equal(persisted.thermalControl.mode, 'lamps');
  await settings.saveOvenSelection({
    ovenModel: '400',
    connectionVoltage: '230',
  });
  assert.equal(settings.readThermalSettings().powersW.topHeater, 1200);
  assert.equal(settings.readThermalSettings().powersW.infrared3, 3600);
  assert.equal(settings.readThermalSettings().mode, 'heaters');
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
  await settings.saveThermalSettings(plans.defaultThermalSettings);
});
const fixture = (name = 'Проверка') => ({
  name,
  mode: 'manual',
  board: false,
  points: [
    { second: 0, temperature: 30 },
    { second: 8, temperature: 34 },
    { second: 8, temperature: 34 },
    { second: 10, temperature: 30 },
  ],
  shelves: [
    { second: 8, temperature: 30 },
    { second: 8, temperature: 34 },
    { second: 0, temperature: 30 },
  ],
});

test('durations accumulate, targets interpolate, zero stages and invalid values reject', () => {
  const plan = plans.buildProfilePlan(fixture());
  assert.equal(plan.durationSeconds, 26);
  assert.equal(plan.points[2].second, 16);
  assert.equal(plans.targetAt(plan, 4).temperature, 32);
  assert.equal(plans.targetAt(plan, 12).slope, 0);
  assert.equal(plans.targetAt(plan, 26).temperature, 30);
  for (const points of [
    [{ second: 0, temperature: NaN }],
    [
      { second: 0, temperature: 30 },
      { second: 0, temperature: 100 },
    ],
    [{ second: 1, temperature: 30 }],
  ])
    assert.throws(() => plans.buildProfilePlan({ ...fixture(), points }));
  assert.throws(() => plans.buildProfilePlan({ ...fixture(), repeat: 0 }));
});
test('easy graph and execution have identical points and oven-specific rates', () => {
  const profile = {
    ...fixture(),
    mode: 'easy',
    shelves: [
      { second: 10, temperature: 100 },
      { second: 5, temperature: 200 },
      { second: 0, temperature: 50 },
    ],
  };
  const manual = plans.convertProfileMode(profile, 'manual', 0.7, 0.4);
  const easyPlan = plans.buildProfilePlan(profile, 0.7, 0.4);
  assert.deepEqual(plans.buildProfilePlan(manual).points, easyPlan.points);
  assert.ok(
    plans.buildProfilePlan(profile, 1.7, 0.33).durationSeconds !==
      easyPlan.durationSeconds,
  );
});
test('database CRUD, unique names, atomic import and restart persistence', () => {
  const profile = db.saveProfile(fixture());
  assert.ok(profile.id);
  assert.throws(() => db.saveProfile(fixture()));
  const edited = db.saveProfile({ ...profile, name: 'Изменён' }, profile.id);
  assert.equal(db.findProfile(profile.id).name, edited.name);
  const count = db.listProfiles().length;
  const invalidDrafts = [
    ...[0, -1, 1.5, 21].map((repeat) => ({ ...fixture(), repeat })),
    ...[-200, 305, 30000, 50.5].map((temperature) => ({
      ...fixture(),
      points: [{ second: 0, temperature }],
    })),
    ...[-1, 0, 1.5, 100000].map((second) => ({
      ...fixture(),
      points: [
        { second: 0, temperature: 50 },
        { second, temperature: 100 },
      ],
    })),
  ];
  for (const invalid of invalidDrafts) {
    assert.throws(() => db.saveProfile(invalid));
    assert.throws(() => db.saveProfile(invalid, profile.id));
    assert.throws(() =>
      db.importProfiles([fixture('Valid before invalid'), invalid]),
    );
    assert.equal(db.listProfiles().length, count);
    assert.deepEqual(db.findProfile(profile.id), edited);
  }
  assert.throws(() =>
    db.importProfiles([fixture('Valid import'), { ...fixture(), repeat: -1 }]),
  );
  assert.equal(db.listProfiles().length, count);
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const db=await import(${JSON.stringify(new URL('../dist/database.js', import.meta.url).href)});console.log(db.findProfile(${JSON.stringify(profile.id)}).name);`,
    ],
    { encoding: 'utf8', env: process.env },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Изменён'));
  db.deleteProfile(profile.id);
  assert.throws(() => db.findProfile(profile.id));
});
test('settings writes preserve calibration and model under simultaneous updates', async () => {
  await Promise.all([
    settings.saveFanReferenceHz(47),
    settings.saveOvenSelection({ ovenModel: '300', connectionVoltage: '380' }),
  ]);
  const saved = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  assert.equal(saved.fanReferenceHz, 47);
  assert.equal(saved.connectionVoltage, '380');
  await settings.saveFanReferenceHz(50);
});
test('complete two cycles, cool down, record actual/target history and events', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const initial = await runner.start({ ...fixture(), repeat: 2 });
  assert.equal(initial.cycles, 2);
  for (let i = 0; i < 500 && runner.active(); i++) {
    now += 1000;
    await runner.step();
  }
  assert.equal(
    runner.snapshot().state,
    'completed',
    JSON.stringify(runner.snapshot()),
  );
  assert.equal(runner.snapshot().cycle, 2);
  const details = await db.runDetails(initial.id);
  assert.ok(details.samples.length > 10);
  assert.ok(details.samples.some((s) => s.heating));
  assert.equal(runner.snapshot().elapsedSeconds, 52);
  assert.ok(details.events.some((e) => e.message === 'Цикл 2'));
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
});
test('full solder profile completes in simulation with board sensor outside', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = db
    .listProfiles()
    .find((profile) => profile.name === 'Свинцовая паста');
  assert.ok(profile);
  const initial = await runner.start({ ...profile, board: false });
  for (let i = 0; i < 4000 && runner.active(); i++) {
    virtualBoard.setTemperatures(25, virtualBoard.snapshot().temperatures.t2);
    now += 1000;
    await runner.step();
  }
  assert.equal(
    runner.snapshot().state,
    'completed',
    JSON.stringify(runner.snapshot()),
  );
  const samples = (await db.runDetails(initial.id)).samples;
  assert.equal(
    runner.snapshot().elapsedSeconds,
    plans.buildProfilePlan(profile).durationSeconds,
  );
  assert.ok(
    (await db.runDetails(initial.id)).events.some((event) =>
      event.message.includes('Соответствие графику: нет'),
    ),
  );
  // One simulation step couples the sensors before the outside sensor is reset.
  assert.ok(samples.every((sample) => sample.boardTemperatureC < 60));
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
});

test('stop, restart and settings status reads preserve an active run', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('First start'));
  now += 1000;
  await runner.step();
  await runner.stop();
  const restarted = await runner.start(fixture('Restart and navigation'));
  for (let i = 0; i < 8; i++) {
    await checkControllerConnection();
    await initializeControllerConnection();
    now += 1000;
    await runner.step();
    assert.equal(runner.snapshot().state, 'running');
    assert.equal(runner.snapshot().id, restarted.id);
  }
  await runner.stop();
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
});

test('element test keeps watchdog alive during its three-second pulse', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  const originalCall = virtualBoard.call;
  const times = [];
  let lastCommand = Date.now();
  virtualBoard.call = function (name, args) {
    const now = Date.now();
    assert.ok(now - lastCommand < 3000, 'firmware watchdog would expire');
    lastCommand = now;
    if (name === 'stat') times.push(now);
    return originalCall.call(this, name, args);
  };
  try {
    const result = await testOvenElement('f1');
    assert.equal(result.success, true, result.error);
    assert.ok(times.length >= 5);
    assert.equal(virtualBoard.snapshot().highVoltageOutputs[5], 0);
  } finally {
    virtualBoard.call = originalCall;
  }
});

test('lamp and combined runs drive physical output maps and record selected channels', async () => {
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '380',
  });
  for (const mode of ['lamps', 'combined']) {
    virtualBoard.reset();
    await settings.saveThermalSettings(thermalFixture(mode));
    let now = 0;
    const runner = new ProfileRunner(() => now, true);
    const initial = await runner.start(fixture(`Mode ${mode}`));
    for (let i = 0; i < 100 && runner.active(); i++) {
      now += 1000;
      await runner.step();
    }
    const samples = (await db.runDetails(initial.id)).samples;
    assert.ok(
      samples.some(
        (sample) => sample.heatOutputs.infrared || sample.heatOutputs.infrared2,
      ),
    );
    if (mode === 'lamps')
      assert.ok(
        samples.every(
          (sample) =>
            !sample.heatOutputs.topHeater && !sample.heatOutputs.bottomHeater,
        ),
      );
    else
      assert.ok(
        samples.some(
          (sample) =>
            sample.heatOutputs.topHeater || sample.heatOutputs.bottomHeater,
        ),
      );
    await runner.stop();
    const outputs = virtualBoard.snapshot().highVoltageOutputs;
    for (const index of [3, 4, 6, 7]) assert.equal(outputs[index], 0);
  }
  await settings.saveThermalSettings(plans.defaultThermalSettings);
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
});

test('startup buzzer preserves other low-voltage outputs and finishes off', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  const original = [1, 0, 1, 0, 1, 1];
  virtualBoard.call('setLV', original);
  await playBoardStartupSound();
  assert.deepEqual(virtualBoard.call('setLV'), original);
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
});

test('single-phase modes alternate pairs and combined mode adds both heaters', async () => {
  for (const ovenModel of ['300', '400']) {
    await settings.saveOvenSelection({ ovenModel, connectionVoltage: '230' });
    const rated = {
      ...settings.readThermalSettings(),
      auxiliaryPowerW: 200,
      kp: 1,
    };
    const lamps = new ThermalRegulator({ ...rated, mode: 'lamps' }, 0.7, 0.4);
    const heaters = new ThermalRegulator(
      { ...rated, mode: 'heaters' },
      0.7,
      0.4,
    );
    const combined = new ThermalRegulator(
      { ...rated, mode: 'combined' },
      0.7,
      0.4,
    );
    const seenLamps = new Set();
    const seenCombined = new Set();
    for (let i = 0; i < 10; i++) {
      const lampOutput = lamps.step(25, 45, 45, 0, 1, 2200);
      const activeLamps = plans.heatOutputs.filter((name) => lampOutput[name]);
      assert.equal(activeLamps.length, 1);
      assert.ok(activeLamps[0].startsWith('infrared'));
      seenLamps.add(activeLamps[0]);
      const combinedOutput = combined.step(25, 45, 45, 0, 1, 2200);
      const activeCombined = plans.heatOutputs.filter(
        (name) => combinedOutput[name],
      );
      assert.equal(activeCombined.length, 3);
      assert.equal(combinedOutput.topHeater, true);
      assert.equal(combinedOutput.bottomHeater, true);
      activeCombined.forEach((name) => seenCombined.add(name));
      const heaterOutput = heaters.step(25, 45, 45, 0, 1, 2200);
      assert.equal(
        Number(heaterOutput.topHeater) + Number(heaterOutput.bottomHeater),
        1,
      );
    }
    const expectedLamps = ovenModel === '300' ? 2 : 3;
    assert.equal(seenLamps.size, expectedLamps);
    assert.equal(seenCombined.size, expectedLamps + 2);
  }
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
});

test('M400 lamp run includes the third pair and turns it off on stop', async () => {
  await settings.saveOvenSelection({
    ovenModel: '400',
    connectionVoltage: '380',
  });
  await settings.saveThermalSettings(thermalFixture('lamps'));
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const initial = await runner.start(fixture('M400 three pairs'));
  for (let i = 0; i < 10; i++) {
    now += 1000;
    await runner.step();
  }
  assert.ok(
    (await db.runDetails(initial.id)).samples.some(
      (sample) => sample.heatOutputs.infrared3,
    ),
  );
  await runner.stop();
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[1], 0);
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
  await settings.saveThermalSettings(plans.defaultThermalSettings);
});

test('timed completion gives two long beeps for matching and three for mismatch', async () => {
  for (const [temperature, expected] of [
    [25, 2],
    [40, 3],
  ]) {
    virtualBoard.reset();
    virtualBoard.setTemperatures(25, temperature);
    const original = virtualBoard.call;
    let beeps = 0;
    virtualBoard.call = function (name, args) {
      if (name === 'setLV' && args?.[3] === 1) beeps++;
      return original.call(this, name, args);
    };
    try {
      let now = 0;
      const runner = new ProfileRunner(() => now, true);
      const initial = await runner.start({
        ...fixture(`Timed sound ${expected}`),
        points: [
          { second: 0, temperature: 25 },
          { second: 2, temperature: 25 },
        ],
      });
      now = 1000;
      await runner.step();
      now = 2000;
      await runner.step();
      assert.equal(runner.snapshot().state, 'completed');
      assert.equal(runner.snapshot().elapsedSeconds, 2);
      assert.equal(beeps, expected);
      assert.equal(virtualBoard.call('setLV')[3], 0);
      assert.ok(
        (await db.runDetails(initial.id)).events.some((event) =>
          event.message.includes(
            `Соответствие графику: ${expected === 2 ? 'да' : 'нет'}`,
          ),
        ),
      );
    } finally {
      virtualBoard.call = original;
    }
  }
});

test('fan warnings persist without replacing other oven configuration', async () => {
  await settings.saveFanWarningsEnabled(false);
  assert.equal(settings.readFanWarningsEnabled(), false);
  await settings.saveFanReferenceHz(53);
  assert.equal(settings.readFanWarningsEnabled(), false);
  const stored = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  assert.equal(stored.reactToFanErrors, false);
  assert.equal(stored.fanReferenceHz, 53);
  await assert.rejects(settings.saveFanWarningsEnabled('false'));
  await settings.saveFanWarningsEnabled(true);
  await settings.saveFanReferenceHz(50);
});

test('frequency below 20 percent stays advisory during a profile and holding; sensor faults still stop heat', async () => {
  await settings.saveFanReferenceHz(300); // Virtual fan is 50 Hz: below 20%.
  await settings.saveKeepHeatEnabled(false);
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  try {
    await runner.start({
      ...fixture('Low fan advisory'),
      points: [
        { second: 0, temperature: 50 },
        { second: 60, temperature: 70 },
        { second: 30, temperature: 70 },
      ],
    });
    for (let i = 0; i < 13; i++) {
      now += 1000;
      await runner.step();
    }
    assert.notEqual(runner.snapshot().state, 'failed');
    assert.equal(runner.snapshot().error, null);
    await runner.stop();
    virtualBoard.reset();
    await settings.saveKeepHeatEnabled(true);
    await runner.startTemperatureHold();
    for (let i = 0; i < 13; i++) {
      now += 1000;
      await runner.step();
    }
    assert.equal(runner.snapshot().holdingTemperatureC, 100);
    virtualBoard.setFault('sensor');
    now += 1000;
    await runner.step();
    assert.equal(runner.snapshot().holdingTemperatureC, null);
    assert.equal((await checkControllerConnection()).telemetry.heaters, false);
    assert.equal((await checkControllerConnection()).telemetry.lamps, false);
  } finally {
    virtualBoard.setFault('none');
    await settings.saveKeepHeatEnabled(false);
    await runner.stop();
    await settings.saveFanReferenceHz(50);
  }
});

test('manual stop leaves both heaters off and rejects concurrent tests', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Stop'));
  await assert.rejects(setConvectionEnabled(false));
  assert.equal((await testOvenElement('topHeater')).success, false);
  await assert.rejects(runner.start(fixture('Second start')));
  now += 1000;
  await runner.step();
  await runner.stop();
  assert.equal(runner.snapshot().state, 'stopped');
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[3], 0);
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
});
test('door, sensor, overheat and connection faults fail without automatic resumption', async () => {
  for (const fault of ['door', 'sensor', 'overheat', 'connection']) {
    virtualBoard.reset();
    let now = 0;
    const runner = new ProfileRunner(() => now, true);
    await runner.start(fixture(fault));
    virtualBoard.setFault(fault);
    now += 1000;
    await runner.step();
    assert.equal(runner.snapshot().state, 'failed', fault);
    virtualBoard.setFault('none');
    now += 1000;
    await runner.step();
    assert.equal(runner.snapshot().state, 'failed', fault + ' resumed');
  }
});
test('sensor and overheat faults during active combined heating shut heat off and never enter holding', async () => {
  await settings.saveKeepHeatEnabled(true);
  await settings.saveThermalSettings(thermalFixture('combined'));
  try {
    for (const fault of ['sensor', 'overheat']) {
      virtualBoard.reset();
      virtualBoard.setTemperatures(25, 50);
      let now = 0;
      const runner = new ProfileRunner(() => now, true);
      await runner.startProfile({
        ...fixture('Active heat ' + fault),
        points: [
          { second: 0, temperature: 50 },
          { second: 20, temperature: 100 },
          { second: 10, temperature: 100 },
        ],
      });
      now += 1000;
      await runner.step();
      assert.equal((await checkControllerConnection()).telemetry.heaters, true);
      virtualBoard.setFault(fault);
      now += 1000;
      await runner.step();
      assert.equal(runner.snapshot().state, 'failed', fault);
      assert.equal(runner.snapshot().holdingTemperatureC, null);
      virtualBoard.setFault('none');
      for (let i = 0; i < 3; i++) {
        now += 1000;
        await runner.step();
        const board = await checkControllerConnection();
        assert.equal(board.telemetry.heaters, false);
        assert.equal(board.telemetry.lamps, false);
        assert.equal(runner.snapshot().state, 'failed');
        assert.equal(runner.snapshot().holdingTemperatureC, null);
      }
    }
  } finally {
    virtualBoard.setFault('none');
    await settings.saveKeepHeatEnabled(false);
  }
});

test('stop cools the hotter sensor and prevents hot restart', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Hot sensor'));
  virtualBoard.setTemperatures(65, 35);
  now += 1000;
  await runner.step();
  await runner.stop();
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[5], 1);
  virtualBoard.setTemperatures(55, 35);
  await assert.rejects(runner.start(fixture('Hot restart')));
  virtualBoard.setTemperatures(45, 35);
  now += 31000;
  await runner.updateIdleCooling(45);
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[5], 0);
});
test('monitor detects reset and clears heat before reconnect; profile does not resume', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Monitor'));
  now += 1000;
  await runner.step();
  await runner.failFromMonitor('Связь потеряна');
  assert.equal(runner.snapshot().state, 'failed');
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
  virtualBoard.reset();
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'failed');
});
test('PID never turns heat on when both sensors are already above target', async () => {
  virtualBoard.reset();
  virtualBoard.setTemperatures(40, 40);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Already hot'));
  now += 1000;
  await runner.step();
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
  await runner.stop();
});
test('profile sensor controls measurements and heat with the other sensor outside', async () => {
  for (const board of [false, true]) {
    virtualBoard.reset();
    virtualBoard.setTemperatures(board ? 40 : 25, board ? 25 : 40);
    let now = 0;
    const runner = new ProfileRunner(() => now, true);
    const initial = await runner.start({
      ...fixture(`Sensor ${board}`),
      board,
    });
    assert.equal(initial.measuredTemperatureC, 40);
    now += 1000;
    await runner.step();
    assert.ok(runner.snapshot().measuredTemperatureC > 35);
    assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
    const sample = (await db.runDetails(initial.id)).samples.at(-1);
    assert.ok(
      (board ? sample.boardTemperatureC : sample.chamberTemperatureC) > 35,
    );
    await runner.stop();
  }
});

test('board sensor preparation and profile ignore hotter chamber relative to target, retaining absolute cutoff', async () => {
  await settings.saveKeepHeatEnabled(false);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 150);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startProfile({
    ...fixture('Board with hotter chamber'),
    board: true,
    points: [
      { second: 0, temperature: 50 },
      { second: 100, temperature: 100 },
      { second: 10, temperature: 100 },
    ],
  });
  assert.equal(runner.snapshot().state, 'preparing');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'preparing');
  assert.ok(runner.snapshot().measuredTemperatureC < 50);
  assert.equal((await checkControllerConnection()).telemetry.fans, false);
  virtualBoard.setTemperatures(50, 150);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'running');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'running');
  assert.equal(runner.snapshot().error, null);
  virtualBoard.setTemperatures(51, 286);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'failed');
  assert.match(runner.snapshot().error, /перегрев/);
});

test('stop during startup cancels the new run without changing older history', async () => {
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Previous'));
  await runner.stop();
  const oldId = runner.snapshot().id;
  const starting = runner.start(fixture('Cancelled')).then(
    () => null,
    (error) => error,
  );
  await runner.stop();
  assert.ok(await starting);
  assert.equal(runner.active(), false);
  assert.equal(virtualBoard.snapshot().highVoltageOutputs[4], 0);
  assert.equal(
    (await db.listRuns()).find((run) => run.id === oldId).state,
    'stopped',
  );
});
test('hardware pilot limit rejects high-temperature profiles before opening serial', () => {
  const high = {
    ...fixture('High'),
    points: [
      { second: 0, temperature: 30 },
      { second: 300, temperature: 230 },
    ],
  };
  const script = `import assert from 'node:assert/strict';import{createRequire}from'node:module';const require=createRequire(import.meta.url);let calls=0;require('itmp').connect=()=>{calls++;throw new Error('Unexpected serial access');};const{ProfileRunner}=await import(${JSON.stringify(new URL('../dist/profileRunner.js', import.meta.url).href)});await assert.rejects(new ProfileRunner().start(${JSON.stringify(high)}),/50/);assert.equal(calls,0);console.log('blocked');`;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        MERCURY_CONTROLLER_MODE: 'hardware',
        MERCURY_HARDWARE_MAX_TEMPERATURE_C: '50',
        MERCURY_DATABASE_PATH: join(directory, 'limit.sqlite'),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('blocked'));
});
test('restart without USB has no stored history', () => {
  const id = db.createRun(fixture('Interrupted'), true);
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const db=await import(${JSON.stringify(new URL('../dist/database.js', import.meta.url).href)});console.log(JSON.stringify((await db.listRuns()).find(r=>r.id===${JSON.stringify(id)})));`,
    ],
    { encoding: 'utf8', env: process.env },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'undefined');
});
test('lamp protection breaks before make, spaces enables and switches off without waiting', async () => {
  const { LampOutputProtection } =
    await import('../dist/controller/lampOutputProtection.js');
  let now = 0;
  const protection = new LampOutputProtection(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  let previous = Array(8).fill(0);
  const writes = [];
  const write = async (values) => {
    previous = [...values];
    writes.push({ time: now, values: [...values] });
  };
  const first = [0, 0, 1, 1, 1, 0, 1, 0];
  await protection.apply(previous, first, [6, 7], write, async () => {});
  const next = [0, 0, 1, 1, 1, 0, 0, 1];
  await protection.apply(previous, next, [6, 7], write, async () => {});
  assert.deepEqual(writes[1].values, [0, 0, 1, 1, 1, 0, 0, 0]);
  assert.ok(writes[2].time - writes[1].time >= 6);
  assert.ok(writes[2].time - writes[0].time >= 500);
  assert.ok(writes.every(({ values }) => values[6] + values[7] <= 1));
  const offAt = now;
  await protection.apply(
    previous,
    Array(8).fill(0),
    [6, 7],
    write,
    async () => {},
  );
  assert.equal(now, offAt);
  assert.ok(previous.every((value) => value === 0));
});

test('lamp protection enables three-phase pairs separately and aborts on state refusal', async () => {
  const { LampOutputProtection } =
    await import('../dist/controller/lampOutputProtection.js');
  let now = 0;
  const protection = new LampOutputProtection(
    () => now,
    async (ms) => {
      now += ms;
    },
  );
  const writes = [];
  const previous = Array(8).fill(0);
  const next = [0, 1, 0, 0, 0, 1, 0, 1];
  await protection.apply(
    previous,
    next,
    [1, 5, 7],
    async (values) => {
      writes.push({ time: now, values: [...values] });
    },
    async () => {},
  );
  assert.equal(writes.length, 3);
  assert.ok(writes[1].time - writes[0].time >= 500);
  assert.ok(writes[2].time - writes[1].time >= 500);
  const swapped = [0, 0, 0, 0, 0, 0, 1, 0];
  const failed = [];
  await assert.rejects(
    protection.apply(
      next,
      swapped,
      [1, 5, 6, 7],
      async (values) => {
        failed.push([...values]);
      },
      async () => {
        throw new Error('not ready');
      },
    ),
    /not ready/,
  );
  assert.equal(failed.length, 1);
  assert.equal(failed[0][6], 0);
});

test('driver permits combined heat but rejects concurrent pairs on single phase', async () => {
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  await initializeControllerConnection();
  await applyProfileOutputs(true, false, {
    topHeater: true,
    bottomHeater: true,
    infrared: true,
  });
  const telemetry = await checkControllerConnection();
  assert.equal(telemetry.telemetry.heaters, true);
  assert.equal(telemetry.telemetry.lamps, true);
  await assert.rejects(
    applyProfileOutputs(true, false, {
      topHeater: true,
      bottomHeater: true,
      infrared: true,
      infrared2: true,
    }),
    /одной паре/,
  );
  await applyProfileOutputs(false, true);
  const cooled = await checkControllerConnection();
  assert.equal(cooled.telemetry.heaters, false);
  assert.equal(cooled.telemetry.lamps, false);
  await settings.saveThermalSettings(thermalFixture('heaters'));
});

test('response bands are isolated by mains voltage and 380 V maximum response uses every lamp pair', async () => {
  try {
    await settings.saveOvenSelection({
      ovenModel: '300',
      connectionVoltage: '230',
    });
    await settings.saveThermalSettings(thermalFixture('combined'));
    const model = settings.getOvenModel('300');
    const singlePhase = settings.getMeasuredResponse(model);
    assert.equal(singlePhase.connectionVoltage, '230');
    await settings.saveOvenSelection({
      ovenModel: '300',
      connectionVoltage: '380',
    });
    const threePhase = settings.getMeasuredResponse(model);
    assert.equal(threePhase.connectionVoltage, '380');
    assert.notEqual(threePhase.runId, singlePhase.runId);
    assert.notDeepEqual(
      threePhase.temperatureBands,
      singlePhase.temperatureBands,
    );
    const unmeasured = { ...model, measuredResponses: { 230: singlePhase } };
    assert.equal(settings.getMeasuredResponse(unmeasured), undefined);
    assert.equal(
      typeof settings.getProfileRates(unmeasured).heatingRate,
      'number',
    );
    await settings.saveOvenSelection({
      ovenModel: '400',
      connectionVoltage: '380',
    });
    const m400ThreePhase = settings.getMeasuredResponse(
      settings.getOvenModel('400'),
    );
    assert.equal(m400ThreePhase.connectionVoltage, '380');
    await settings.saveOvenSelection({
      ovenModel: '400',
      connectionVoltage: '230',
    });
    const m400SinglePhase = settings.getMeasuredResponse(
      settings.getOvenModel('400'),
    );
    assert.equal(m400SinglePhase.connectionVoltage, '230');
    assert.notEqual(m400SinglePhase.runId, m400ThreePhase.runId);
    assert.notDeepEqual(
      m400SinglePhase.temperatureBands,
      singlePhase.temperatureBands,
    );
    await settings.saveOvenSelection({
      ovenModel: '400',
      connectionVoltage: '380',
    });
    await settings.saveThermalSettings(thermalFixture('combined'));
    virtualBoard.reset();
    let now = 0;
    const runner = new ProfileRunner(() => now, true);
    await runner.startMaximumResponseTest(100);
    now += 1000;
    await runner.step();
    const outputs = (await db.runDetails(runner.snapshot().id)).samples.at(
      -1,
    ).heatOutputs;
    assert.equal(outputs.topHeater, true);
    assert.equal(outputs.bottomHeater, true);
    assert.equal(outputs.infrared, true);
    assert.equal(outputs.infrared2, true);
    assert.equal(outputs.infrared3, true);
    await runner.stop();
  } finally {
    virtualBoard.reset();
    await settings.saveOvenSelection({
      ovenModel: '300',
      connectionVoltage: '230',
    });
    await settings.saveThermalSettings(thermalFixture('combined'));
  }
});

test('maximum response test switches at 100 C and ends at 50 C, independent of profile time', async () => {
  await settings.saveOvenSelection({
    ovenModel: '300',
    connectionVoltage: '230',
  });
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startMaximumResponseTest();
  now += 1000;
  await runner.step();
  let samples = (await db.runDetails(runner.snapshot().id)).samples;
  assert.equal(samples.at(-1).heatOutputs.topHeater, true);
  assert.equal(samples.at(-1).heatOutputs.bottomHeater, true);
  assert.equal(samples.at(-1).cooling, false);
  virtualBoard.setTemperatures(25, 100);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'cooling');
  samples = (await db.runDetails(runner.snapshot().id)).samples;
  assert.equal(samples.at(-1).heating, false);
  assert.equal(samples.at(-1).cooling, true);
  virtualBoard.setTemperatures(25, 49);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'completed');
  const telemetry = await checkControllerConnection();
  assert.equal(telemetry.telemetry.heaters, false);
  assert.equal(telemetry.telemetry.lamps, false);
  assert.equal(telemetry.telemetry.fans, false);
  virtualBoard.reset();
  await runner.startMaximumResponseTest();
  virtualBoard.setTemperatures(25, 106);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'failed');
  assert.match(runner.snapshot().error, /105/);
});

test('260 C calibration cuts heating at its target and completes at 50 C', async () => {
  await settings.saveThermalSettings(thermalFixture('combined'));
  await settings.saveKeepHeatEnabled(false);
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startMaximumResponseTest(260);
  now += 1000;
  await runner.step();
  virtualBoard.setTemperatures(25, 260);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'cooling');
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  assert.equal((await checkControllerConnection()).telemetry.lamps, false);
  virtualBoard.setTemperatures(25, 49);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'completed');
});

test('270 C response test switches to cooling and retains its separate diagnostic 280 C cutoff', async () => {
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await assert.rejects(runner.startMaximumResponseTest(280), /Допустимые/);
  await assert.rejects(runner.startMaximumResponseTest('270'), /Допустимые/);
  await runner.startMaximumResponseTest(270);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().targetTemperatureC, 270);
  virtualBoard.setTemperatures(25, 270);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'cooling');
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  virtualBoard.setTemperatures(25, 49);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'completed');
  virtualBoard.reset();
  await runner.startMaximumResponseTest(270);
  virtualBoard.setTemperatures(25, 281);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'failed');
  assert.match(runner.snapshot().error, /аварийный предел испытания 280/);
  assert.equal((await checkControllerConnection()).telemetry.lamps, false);
});

test('measured M300 planning splits ramps, shares graph and conversion times, and excludes board sensor', async () => {
  await settings.saveThermalSettings(thermalFixture('combined'));
  const model = settings.getOvenModel('300');
  const { heatingRate, coolingRate } = settings.getProfileRates(model);
  const profile = {
    ...fixture('Measured plan'),
    board: false,
    mode: 'easy',
    shelves: [
      { second: 0, temperature: 50 },
      { second: 0, temperature: 270 },
      { second: 0, temperature: 50 },
    ],
  };
  const points = plans.profileDurationPoints(profile, heatingRate, coolingRate);
  assert.deepEqual(
    points.map((point) => point.temperature),
    [30, 50, 100, 150, 200, 250, 270, 250, 200, 150, 125, 100, 75, 60, 50],
  );
  const coolingSeconds = points
    .slice(7)
    .reduce((sum, point) => sum + point.second, 0);
  assert.equal(coolingSeconds, 876);
  assert.equal(points.at(-1).second, Math.ceil(10 / 0.06));
  const converted = plans.convertProfileMode(
    profile,
    'manual',
    heatingRate,
    coolingRate,
  );
  assert.deepEqual(converted.points, points);
  assert.equal(
    plans.buildProfilePlan(profile, heatingRate, coolingRate).durationSeconds,
    plans.buildProfilePlan(converted).durationSeconds,
  );
  const boardProfile = { ...profile, board: true };
  assert.deepEqual(
    plans.profileDurationPoints(boardProfile, heatingRate, coolingRate),
    plans.profileDurationPoints(boardProfile, 0.7, 0.4),
  );
  assert.deepEqual(
    plans.convertProfileMode(boardProfile, 'manual', heatingRate, coolingRate)
      .points,
    plans.profileDurationPoints(boardProfile, 0.7, 0.4),
  );
  assert.deepEqual(
    plans.profileDurationPoints(fixture(), heatingRate, coolingRate),
    fixture().points,
  );
  const m400Rates = settings.getProfileRates(settings.getOvenModel('400'));
  assert.equal(typeof m400Rates.heatingRate, 'object');
  assert.deepEqual(
    m400Rates.heatingRate.bands,
    settings.getOvenModel('400').measuredResponses['230'].temperatureBands,
  );
  assert.notDeepEqual(m400Rates.heatingRate.bands, heatingRate.bands);
  assert.equal(plans.rateAtTemperature(coolingRate, 40, true), 0.4);
});

test('regulator uses measured low-temperature cooling rather than the provisional response', () => {
  const bands =
    settings.getOvenModel('300').measuredResponses['230'].temperatureBands;
  const thermal = { ...thermalFixture(), kp: 0, ki: 0, kd: 0 };
  const regulator = new ThermalRegulator(
    thermal,
    0.7,
    0.4,
    plans.heatOutputs,
    bands,
  );
  let cooled = 0;
  for (let i = 0; i < 10; i++) {
    const outputs = regulator.step(75, 75, 70, -0.1, 1, 2200);
    if (outputs.cooling) cooled++;
    assert.ok(plans.heatOutputs.every((name) => !outputs[name]));
  }
  assert.equal(cooled, 9);
});

test('manual linear cooling warns about its slowest band without modifying saved times', () => {
  const { coolingRate, heatingRate } = settings.getProfileRates(
    settings.getOvenModel('300'),
  );
  const profile = {
    ...fixture(),
    points: [
      { second: 0, temperature: 150 },
      { second: 660, temperature: 50 },
    ],
  };
  assert.deepEqual(plans.manualCoolingWarnings(profile, coolingRate), [
    { index: 1, requiredSeconds: 1667 },
  ]);
  assert.equal(profile.points[1].second, 660);
  const easy = {
    ...profile,
    mode: 'easy',
    shelves: [
      { second: 0, temperature: 50 },
      { second: 120, temperature: 150 },
      { second: 0, temperature: 50 },
    ],
  };
  const converted = plans.convertProfileMode(
    easy,
    'manual',
    heatingRate,
    coolingRate,
  );
  assert.deepEqual(plans.manualCoolingWarnings(converted, coolingRate), []);
  assert.deepEqual(plans.manualCoolingWarnings(easy, coolingRate), []);
  assert.deepEqual(
    plans.manualCoolingWarnings({ ...profile, board: true }, coolingRate),
    [],
  );
});

test('pause freezes time and heat, resume preserves position, stop remains terminal', async () => {
  let now = 0;
  virtualBoard.reset();
  await settings.saveKeepHeatEnabled(false);
  await settings.saveThermalSettings(thermalFixture());
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Pause test'));
  now += 1000;
  await runner.step();
  const before = runner.snapshot();
  await runner.pause();
  assert.equal(runner.active(), true);
  assert.equal(runner.snapshot().paused, true);
  for (let i = 0; i < 10; i++) {
    now += 1000;
    await runner.step();
  }
  assert.equal(runner.snapshot().elapsedSeconds, before.elapsedSeconds);
  assert.equal(runner.snapshot().remainingSeconds, before.remainingSeconds);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  assert.equal((await checkControllerConnection()).telemetry.lamps, false);
  await runner.resume();
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().paused, false);
  assert.equal(runner.snapshot().elapsedSeconds, before.elapsedSeconds + 1);
  await runner.pause();
  await runner.stop();
  assert.equal(runner.snapshot().state, 'stopped');
  assert.equal(runner.snapshot().paused, false);
  await assert.rejects(runner.resume(), /паузе/);
});

test('pause still detects sensor faults and never resumes a failed profile', async () => {
  let now = 0;
  virtualBoard.reset();
  const runner = new ProfileRunner(() => now, true);
  await runner.start(fixture('Paused fault'));
  await runner.pause();
  virtualBoard.setFault('sensor');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'failed');
  assert.equal(runner.snapshot().paused, false);
  await assert.rejects(runner.resume());
  virtualBoard.setFault('none');
});

test('hot entry stays on the first shelf and repeats skip the earlier rising ramp', async () => {
  let now = 0;
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 100);
  const profile = {
    ...fixture('Hot first shelf'),
    repeat: 2,
    points: [
      { second: 0, temperature: 50 },
      { second: 100, temperature: 150 },
      { second: 10, temperature: 150 },
      { second: 10, temperature: 100 },
    ],
  };
  const plan = plans.buildRunPlan(profile, 0.7, 0.4, 100);
  assert.equal(plan.points[0].temperature, 100);
  assert.equal(plan.durationSeconds, 70);
  assert.equal(
    plans.buildRunPlan(profile, 0.7, 0.4, 200).points[0].temperature,
    150,
  );
  const runner = new ProfileRunner(() => now, true);
  await runner.startProfile(profile);
  assert.equal(runner.snapshot().state, 'preparing');
  assert.equal(runner.snapshot().targetTemperatureC, 100);
  assert.equal(runner.snapshot().remainingSeconds, 190);
  for (let i = 0; i < 80 && runner.snapshot().cycle < 2; i++) {
    now += 1000;
    virtualBoard.setTemperatures(25, 100);
    await runner.step();
  }
  assert.equal(runner.snapshot().cycle, 2);
  assert.equal(runner.snapshot().state, 'preparing');
  // The simulated oven cools during the final tick before the repeat starts.
  // Entry must use that actual quarter-degree reading, not the injected value
  // from before the tick (which whole-degree rounding previously hid).
  assert.equal(
    runner.snapshot().targetTemperatureC,
    runner.snapshot().measuredTemperatureC,
  );
  assert.ok(runner.snapshot().targetTemperatureC >= 99.5);
  await runner.stop();
});

test('warm preparation freezes the clock, remaps actual temperature and remains stoppable for all mains configurations', async () => {
  try {
    for (const ovenModel of ['300', '400']) {
      for (const connectionVoltage of ['230', '380']) {
        await settings.saveOvenSelection({ ovenModel, connectionVoltage });
        await settings.saveThermalSettings(thermalFixture('combined'));
        virtualBoard.reset();
        virtualBoard.setTemperatures(25, 90);
        let now = 0;
        const runner = new ProfileRunner(() => now, true);
        const profile = {
          ...fixture('Warm preparation'),
          points: [
            { second: 0, temperature: 50 },
            { second: 100, temperature: 150 },
            { second: 10, temperature: 150 },
          ],
        };
        try {
          const initial = await runner.startProfile(profile);
          assert.equal(initial.state, 'preparing');
          for (let i = 0; i < 4; i++) {
            now += 1000;
            virtualBoard.setTemperatures(25, 90);
            await runner.step();
            assert.equal(runner.snapshot().state, 'preparing');
            assert.equal(
              runner.snapshot().elapsedSeconds,
              initial.elapsedSeconds,
            );
          }
          now += 1000;
          virtualBoard.setTemperatures(25, 92);
          await runner.step();
          assert.equal(runner.snapshot().state, 'running');
          assert.equal(
            runner.snapshot().targetTemperatureC,
            runner.snapshot().measuredTemperatureC,
          );
          assert.ok(runner.snapshot().elapsedSeconds >= initial.elapsedSeconds);
          await runner.stop();
          virtualBoard.setTemperatures(25, 90);
          await runner.startProfile(profile);
          await runner.stop();
          now += 6000;
          await runner.step();
          assert.equal(runner.snapshot().state, 'stopped');
          const board = await checkControllerConnection();
          assert.equal(board.telemetry.heaters, false);
          assert.equal(board.telemetry.lamps, false);
        } finally {
          await runner.stop();
        }
      }
    }
  } finally {
    virtualBoard.reset();
    await settings.saveOvenSelection({
      ovenModel: '300',
      connectionVoltage: '230',
    });
    await settings.saveThermalSettings(thermalFixture('combined'));
  }
});

test('run plan starts at the first rising 50 C crossing and preserves the final instant', () => {
  const profile = {
    ...fixture('50 boundary'),
    points: [
      { second: 0, temperature: 30 },
      { second: 14, temperature: 100 },
      { second: 10, temperature: 100 },
      { second: 50, temperature: 50 },
    ],
  };
  const plan = plans.buildRunPlan(profile);
  assert.equal(plan.points[0].temperature, 50);
  assert.equal(plan.points[0].second, 0);
  assert.equal(plan.durationSeconds, 70);
  assert.equal(plan.points[1].second, 10);
  assert.equal(plan.points.at(-1).second, 70);
  assert.throws(() => plans.buildRunPlan(fixture()), /50/);
  const fractional = plans.buildRunPlan({
    ...profile,
    points: [
      { second: 0, temperature: 30 },
      { second: 10, temperature: 60 },
      { second: 5, temperature: 60 },
    ],
  });
  assert.ok(Math.abs(fractional.durationSeconds - 25 / 3) < 1e-9);
  assert.deepEqual(profile.points[0], { second: 0, temperature: 30 });
});

test('open door interrupts warm preparation and requires a fresh closed-door preparation', async () => {
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 90);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('Door during warm preparation'),
    points: [
      { second: 0, temperature: 50 },
      { second: 100, temperature: 150 },
    ],
  };
  try {
    const initial = await runner.startProfile(profile);
    virtualBoard.setFault('door');
    for (let i = 0; i < 6; i++) {
      now += 1000;
      await runner.step();
      assert.equal(runner.snapshot().elapsedSeconds, initial.elapsedSeconds);
      const board = await checkControllerConnection();
      assert.equal(board.telemetry.heaters, false);
      assert.equal(board.telemetry.lamps, false);
    }
    virtualBoard.setFault('none');
    for (let i = 0; i < 4; i++) {
      now += 1000;
      await runner.step();
      assert.equal(runner.snapshot().state, 'preparing');
    }
    now += 1000;
    await runner.step();
    assert.equal(runner.snapshot().state, 'running');
  } finally {
    await runner.stop();
    virtualBoard.reset();
  }
});

test('preparation freezes the clock; normal run finishes by time and cools separately', async () => {
  await settings.saveKeepHeatEnabled(false);
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('Preparation'),
    points: [
      { second: 0, temperature: 30 },
      { second: 10, temperature: 60 },
      { second: 5, temperature: 60 },
    ],
  };
  const initial = await runner.startProfile(profile);
  assert.equal(initial.state, 'preparing');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().elapsedSeconds, 0);
  virtualBoard.setTemperatures(25, 50);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'running');
  assert.equal(runner.snapshot().elapsedSeconds, 0);
  for (let i = 0; i < 9; i++) {
    virtualBoard.setTemperatures(25, 60);
    now += 1000;
    await runner.step();
  }
  assert.equal(runner.snapshot().state, 'completed');
  assert.equal(runner.snapshot().pendingReady, false);
  assert.equal(runner.snapshot().elapsedSeconds, 9);
  assert.ok(
    Math.abs((await db.runDetails(initial.id)).plan.durationSeconds - 25 / 3) <
      1e-9,
  );
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  assert.equal((await checkControllerConnection()).telemetry.fans, true);
  virtualBoard.setTemperatures(25, 49);
  await runner.updateIdleCooling(49);
  assert.equal((await checkControllerConnection()).telemetry.fans, false);
});

test('keep heat after a 50 C ending requires Ready, rejects stale clicks, and stops safely', async () => {
  await settings.saveKeepHeatEnabled(true);
  assert.equal(settings.readKeepHeatEnabled(), true);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('Ready heat'),
    points: [
      { second: 0, temperature: 50 },
      { second: 1, temperature: 60 },
      { second: 1, temperature: 50 },
    ],
  };
  const initial = await runner.startProfile(profile);
  now += 1000;
  await runner.step();
  // End above 50 °C: Ready must close the process without waiting for cooling.
  virtualBoard.setTemperatures(25, 52);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'completed');
  assert.equal(runner.snapshot().pendingReady, true);
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  assert.equal(runner.snapshot().canAcknowledge, true);
  await assert.rejects(runner.acknowledgeReady('old-run'), /изменилось/);
  await runner.acknowledgeReady(initial.id);
  assert.equal(runner.snapshot().holdingTemperatureC, 100);
  assert.equal(runner.snapshot().pendingReady, false);
  now += 1000;
  await runner.step();
  assert.equal((await checkControllerConnection()).telemetry.heaters, true);
  assert.equal((await checkControllerConnection()).telemetry.lamps, true);
  assert.equal(
    new ProfileRunner(() => now, true).snapshot().holdingTemperatureC,
    null,
  );
  virtualBoard.setTemperatures(25, 100);
  await settings.saveKeepHeatEnabled(false);
  await runner.disableKeepHeat();
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  assert.equal((await checkControllerConnection()).telemetry.fans, true);
});

test('Ready during completion sound closes immediately and defers optional holding until the sound ends', async () => {
  for (const cancel of [false, true]) {
    await settings.saveKeepHeatEnabled(true);
    virtualBoard.reset();
    virtualBoard.setTemperatures(25, 50);
    let now = 0;
    const runner = new ProfileRunner(() => now, true);
    const initial = await runner.startProfile({
      ...fixture('Ready during sound'),
      points: [
        { second: 0, temperature: 50 },
        { second: 1, temperature: 60 },
        { second: 1, temperature: 50 },
      ],
    });
    now += 1000;
    await runner.step();
    virtualBoard.setTemperatures(25, 52);
    now += 1000;
    const finishing = runner.step();
    const deadline = Date.now() + 5000;
    while (runner.snapshot().state !== 'completed' && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runner.snapshot().state, 'completed');
    assert.equal(runner.snapshot().canAcknowledge, true);
    await runner.acknowledgeReady(initial.id);
    assert.equal(runner.snapshot().pendingReady, false);
    assert.equal(runner.snapshot().holdingTemperatureC, null);
    assert.equal((await checkControllerConnection()).telemetry.heaters, false);
    if (cancel) {
      await settings.saveKeepHeatEnabled(false);
      await runner.disableKeepHeat();
    }
    await finishing;
    assert.equal(runner.snapshot().holdingTemperatureC, cancel ? null : 100);
    await settings.saveKeepHeatEnabled(false);
    await runner.disableKeepHeat();
  }
});

test('100 C ending keeps heat immediately; faults stop holding without rewriting completed profile', async () => {
  await settings.saveKeepHeatEnabled(true);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('Keep 100'),
    points: [
      { second: 0, temperature: 50 },
      { second: 1, temperature: 100 },
      { second: 1, temperature: 100 },
    ],
  };
  const initial = await runner.startProfile(profile);
  virtualBoard.setTemperatures(25, 75);
  now += 1000;
  await runner.step();
  virtualBoard.setTemperatures(25, 100);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'completed');
  assert.equal(runner.snapshot().holdingTemperatureC, 100);
  assert.equal(runner.snapshot().pendingReady, false);
  virtualBoard.setFault('door');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  assert.match(runner.snapshot().error, /Поддержание остановлено/);
  assert.equal(
    (await db.listRuns()).find((run) => run.id === initial.id).state,
    'completed',
  );
  virtualBoard.setFault('none');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  await settings.saveKeepHeatEnabled(false);
});

test('open door prevents preparation heat; Stop prevents delayed profile start', async () => {
  const profile = {
    ...fixture('Prep stopped'),
    points: [
      { second: 0, temperature: 30 },
      { second: 10, temperature: 60 },
    ],
  };
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  virtualBoard.reset();
  await runner.startProfile(profile);
  virtualBoard.setFault('door');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'preparing');
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  await runner.stop();
  setDoorWarning(false);
  virtualBoard.setFault('none');
  virtualBoard.reset();
  await runner.startProfile(profile);
  await runner.stop();
  virtualBoard.setTemperatures(25, 50);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'stopped');
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
});

test('repeat enters its first rising ramp at the current temperature instead of cooling to 50 C', async () => {
  await settings.saveKeepHeatEnabled(false);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('50 repeats'),
    repeat: 2,
    points: [
      { second: 0, temperature: 50 },
      { second: 1, temperature: 60 },
      { second: 1, temperature: 50 },
    ],
  };
  await runner.startProfile(profile);
  now += 1000;
  await runner.step();
  virtualBoard.setTemperatures(25, 52);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'preparing');
  assert.equal(runner.snapshot().cycle, 2);
  assert.ok(runner.snapshot().targetTemperatureC >= 52);
  for (let i = 0; i < 12 && runner.snapshot().state !== 'completed'; i++) {
    virtualBoard.setTemperatures(25, 50);
    now += 1000;
    await runner.step();
  }
  assert.equal(runner.snapshot().state, 'completed');
  assert.equal(runner.snapshot().elapsedSeconds, 4);
});

test('door opening disables heat without freezing time and closing resumes current target', async () => {
  await settings.saveKeepHeatEnabled(false);
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  const profile = {
    ...fixture('Door catchup'),
    points: [
      { second: 0, temperature: 50 },
      { second: 20, temperature: 100 },
      { second: 5, temperature: 100 },
    ],
  };
  const initial = await runner.startProfile(profile);
  virtualBoard.setFault('door');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().state, 'running');
  assert.equal(runner.snapshot().elapsedSeconds, 1);
  assert.equal(runner.snapshot().doorOpen, true);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().elapsedSeconds, 2);
  assert.equal(
    (await db.runDetails(initial.id)).samples.at(-1).targetTemperatureC,
    55,
  );
  virtualBoard.setFault('none');
  virtualBoard.setTemperatures(25, 45);
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().doorOpen, false);
  assert.equal(runner.snapshot().elapsedSeconds, 3);
  assert.equal(
    (await db.runDetails(initial.id)).samples.at(-1).targetTemperatureC,
    57.5,
  );
  assert.equal((await checkControllerConnection()).telemetry.heaters, true);
  virtualBoard.setFault('door');
  for (let i = 4; i <= 25; i++) {
    virtualBoard.setTemperatures(25, 50);
    now += 1000;
    await runner.step();
  }
  assert.equal(runner.snapshot().state, 'completed');
  assert.equal(runner.snapshot().elapsedSeconds, 25);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  setDoorWarning(false);
  virtualBoard.setFault('none');
});

test('sound preference persists and other settings writes preserve it', async () => {
  await settings.saveSoundOnErrors(false);
  await settings.saveFanReferenceHz(51);
  assert.equal(settings.readSoundOnErrors(), false);
  assert.equal(
    JSON.parse(await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'))
      .soundOnErrors,
    false,
  );
  await assert.rejects(settings.saveSoundOnErrors('false'));
  await settings.saveSoundOnErrors(true);
  await settings.saveFanReferenceHz(50);
});

test('muting error sounds preserves startup and completion chimes and low-voltage outputs', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  virtualBoard.call('setLV', [1, 0, 1, 0, 1, 0]);
  const original = virtualBoard.call.bind(virtualBoard);
  let pulses = 0;
  virtualBoard.call = (name, args = []) => {
    if (name === 'setLV' && args[3] === 1) pulses++;
    return original(name, args);
  };
  try {
    await settings.saveSoundOnErrors(false);
    await playBoardErrorSound();
    assert.equal(pulses, 0);
    await playBoardStartupSound();
    assert.equal(pulses, 1);
    await playBoardCompletionSound(true);
    assert.equal(pulses, 3);
    await settings.saveSoundOnErrors(true);
    await playBoardErrorSound();
    assert.equal(pulses, 6);
    assert.deepEqual(virtualBoard.call('setLV'), [1, 0, 1, 0, 1, 0]);
  } finally {
    virtualBoard.call = original;
    await settings.saveSoundOnErrors(true);
  }
});

test('door sound follows a changed preference without requiring the door to close', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  const original = virtualBoard.call.bind(virtualBoard);
  let pulses = 0;
  virtualBoard.call = (name, args = []) => {
    if (name === 'setLV' && args[3] === 1) pulses++;
    return original(name, args);
  };
  try {
    await settings.saveSoundOnErrors(false);
    setDoorWarning(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(pulses, 0);
    await settings.saveSoundOnErrors(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.ok(pulses >= 1);
    await settings.saveSoundOnErrors(false);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const count = pulses;
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(pulses, count);
    assert.equal(virtualBoard.snapshot().lowVoltageOutputs[3], 0);
  } finally {
    setDoorWarning(false);
    await new Promise((resolve) => setTimeout(resolve, 180));
    virtualBoard.call = original;
    await settings.saveSoundOnErrors(true);
  }
});

test('software error sound never clears a firmware fault or silences its buzzer', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  virtualBoard.call('setLV', [1, 0, 1, 1, 1, 0]);
  virtualBoard.setFault('overheat');
  for (const enabled of [false, true]) {
    await settings.saveSoundOnErrors(enabled);
    await playBoardErrorSound();
    assert.equal(virtualBoard.snapshot().lowVoltageOutputs[3], 1);
    assert.ok(virtualBoard.snapshot().stateFlags.includes('OVERHEAT'));
  }
  virtualBoard.reset();
  await settings.saveSoundOnErrors(true);
});

test('door warning repeats short pulses and stops without changing other low-voltage outputs', async () => {
  virtualBoard.reset();
  await initializeControllerConnection();
  virtualBoard.call('setLV', [1, 0, 1, 0, 1, 0]);
  const original = virtualBoard.call.bind(virtualBoard);
  let pulses = 0;
  virtualBoard.call = (name, args = []) => {
    if (name === 'setLV' && args[3] === 1) pulses++;
    return original(name, args);
  };
  try {
    setDoorWarning(true);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.ok(pulses >= 2);
    setDoorWarning(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const count = pulses;
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(pulses, count);
    assert.deepEqual(virtualBoard.call('setLV'), [1, 0, 1, 0, 1, 0]);
  } finally {
    setDoorWarning(false);
    virtualBoard.call = original;
  }
});

test.after(async () => {
  setDoorWarning(false);
  await rm(directory, { recursive: true, force: true }).catch(() => {});
});

test('100 C holding warms with rotating lamps, switches to heaters near target and stops on door fault', async () => {
  await settings.saveKeepHeatEnabled(true);
  await settings.saveThermalSettings(thermalFixture('combined'));
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 70);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startTemperatureHold();
  let lampPulses = 0;
  for (let i = 0; i < 6; i++) {
    virtualBoard.setTemperatures(25, 70);
    now += 1000;
    await runner.step();
    if ((await checkControllerConnection()).telemetry.lamps) lampPulses++;
  }
  assert.ok(lampPulses > 0);
  virtualBoard.setTemperatures(25, 95);
  now += 1000;
  await runner.step();
  assert.equal((await checkControllerConnection()).telemetry.lamps, false);
  for (let i = 0; i < 4; i++) {
    virtualBoard.setTemperatures(25, 93);
    now += 1000;
    await runner.step();
    assert.equal((await checkControllerConnection()).telemetry.lamps, false);
  }
  virtualBoard.setFault('door');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  virtualBoard.setFault('none');
  await settings.saveKeepHeatEnabled(false);
});

test('each completed repeat gives its own completion signal', async () => {
  await settings.saveKeepHeatEnabled(false);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startProfile({
    ...fixture('Cycle signals'),
    repeat: 2,
    points: [
      { second: 0, temperature: 50 },
      { second: 1, temperature: 50 },
    ],
  });
  const original = virtualBoard.call.bind(virtualBoard);
  let pulses = 0;
  virtualBoard.call = (name, args = []) => {
    if (name === 'setLV' && args[3] === 1) pulses++;
    return original(name, args);
  };
  try {
    now += 1000;
    await runner.step();
    assert.equal(pulses, 2);
    virtualBoard.setTemperatures(25, 50);
    now += 1000;
    await runner.step();
    assert.equal(pulses, 4);
    assert.equal(runner.snapshot().state, 'completed');
  } finally {
    virtualBoard.call = original;
  }
});

test('manual profile stop keeps 100 C when enabled, but faults never start holding', async () => {
  await settings.saveKeepHeatEnabled(true);
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  let now = 0;
  const runner = new ProfileRunner(() => now, true);
  await runner.startProfile({
    ...fixture('Stopped hold'),
    points: [
      { second: 0, temperature: 50 },
      { second: 100, temperature: 150 },
    ],
  });
  virtualBoard.setTemperatures(25, 140);
  await runner.stop();
  assert.equal(runner.snapshot().state, 'stopped');
  assert.equal(runner.snapshot().holdingTemperatureC, 100);
  now += 1000;
  await runner.step();
  assert.equal((await checkControllerConnection()).telemetry.heaters, false);
  assert.equal((await checkControllerConnection()).telemetry.fans, true);
  virtualBoard.setFault('sensor');
  now += 1000;
  await runner.step();
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  virtualBoard.setFault('none');
  virtualBoard.reset();
  virtualBoard.setTemperatures(25, 50);
  await runner.startProfile({
    ...fixture('Fault without hold'),
    points: [
      { second: 0, temperature: 50 },
      { second: 100, temperature: 150 },
    ],
  });
  await runner.failFromMonitor('Проверка ошибки');
  assert.equal(runner.snapshot().state, 'failed');
  assert.equal(runner.snapshot().holdingTemperatureC, null);
  await settings.saveKeepHeatEnabled(false);
});

test('thermal protection persists both threshold pairs without changing other settings', async () => {
  const before = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  try {
    for (const enabled of [false, true]) {
      await settings.saveThermalProtection(enabled);
      assert.equal(settings.readThermalProtection(), enabled);
      assert.deepEqual(settings.readProtectionLimits(), {
        maximumTemperatureC: enabled ? 285 : 300,
        holdingTemperatureC: enabled ? 130 : 150,
      });
      const saved = JSON.parse(
        await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
      );
      assert.deepEqual(saved, { ...before, thermalProtection: enabled });
    }
    await assert.rejects(settings.saveThermalProtection('false'));
  } finally {
    await settings.saveThermalProtection(true);
  }
});

test('absolute thermal thresholds stop either sensor at 285 or 300 C and keep model targets capped at 280', async () => {
  const advance = virtualBoard.advance;
  virtualBoard.advance = () => {};
  await settings.saveKeepHeatEnabled(false);
  await settings.saveSoundOnErrors(false);
  try {
    for (const enabled of [true, false]) {
      await settings.saveThermalProtection(enabled);
      const limit = enabled ? 285 : 300;
      for (const sensor of ['board', 'chamber']) {
        virtualBoard.reset();
        let now = 0;
        const runner = new ProfileRunner(() => now, true);
        const profile = {
          ...fixture('Thermal cap'),
          points: [
            { second: 0, temperature: 280 },
            { second: 100, temperature: 280 },
          ],
        };
        await assert.rejects(
          runner.start({
            ...profile,
            points: [
              { second: 0, temperature: 281 },
              { second: 100, temperature: 281 },
            ],
          }),
          /280/,
        );
        await runner.start(profile);
        virtualBoard.setTemperatures(
          sensor === 'board' ? limit - 0.25 : 25,
          sensor === 'chamber' ? limit - 0.25 : 280,
        );
        now += 1000;
        await runner.step();
        assert.equal(runner.snapshot().state, 'running');
        virtualBoard.setTemperatures(
          sensor === 'board' ? limit : 25,
          sensor === 'chamber' ? limit : 280,
        );
        now += 1000;
        await runner.step();
        assert.equal(runner.snapshot().state, 'failed');
        assert.equal(
          (await checkControllerConnection()).telemetry.heaters,
          false,
        );
        assert.equal(
          (await checkControllerConnection()).telemetry.lamps,
          false,
        );
      }
    }
  } finally {
    virtualBoard.advance = advance;
    virtualBoard.reset();
    await settings.saveThermalProtection(true);
    await settings.saveSoundOnErrors(true);
  }
});

test('holding uses 130 or 150 C protection after heating and still permits cooling from a hot oven', async () => {
  const advance = virtualBoard.advance;
  virtualBoard.advance = () => {};
  await settings.saveKeepHeatEnabled(true);
  await settings.saveSoundOnErrors(false);
  try {
    for (const enabled of [true, false]) {
      await settings.saveThermalProtection(enabled);
      const limit = enabled ? 130 : 150;
      virtualBoard.reset();
      virtualBoard.setTemperatures(25, 70);
      let now = 0;
      const runner = new ProfileRunner(() => now, true);
      await runner.startTemperatureHold();
      now += 1000;
      await runner.step();
      const board = await checkControllerConnection();
      assert.ok(board.telemetry.heaters || board.telemetry.lamps);
      virtualBoard.setTemperatures(25, limit);
      now += 1000;
      await runner.step();
      assert.equal(runner.snapshot().holdingTemperatureC, null);
      assert.match(runner.snapshot().error, /Перегрев/);
      assert.equal(
        (await checkControllerConnection()).telemetry.heaters,
        false,
      );
      assert.equal((await checkControllerConnection()).telemetry.lamps, false);
      virtualBoard.reset();
      virtualBoard.setTemperatures(25, 260);
      const cooling = new ProfileRunner(() => now, true);
      await cooling.startTemperatureHold();
      now += 1000;
      await cooling.step();
      assert.equal(cooling.snapshot().holdingTemperatureC, 100);
      assert.equal(
        (await checkControllerConnection()).telemetry.heaters,
        false,
      );
      await cooling.stop();
    }
  } finally {
    virtualBoard.advance = advance;
    virtualBoard.reset();
    await settings.saveKeepHeatEnabled(false);
    await settings.saveThermalProtection(true);
    await settings.saveSoundOnErrors(true);
  }
});

test('combined roles default on, persist off and on, reject invalid input and preserve other configuration', async () => {
  const before = JSON.parse(
    await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8'),
  );
  try {
    const missing = { ...before };
    delete missing.combineOperatorEngineerRoles;
    await writeFile(process.env.MERCURY_CONFIG_PATH, JSON.stringify(missing));
    assert.equal(settings.readCombinedRoles(), true);
    for (const enabled of [false, true]) {
      await settings.saveCombinedRoles(enabled);
      assert.equal(settings.readCombinedRoles(), enabled);
      assert.deepEqual(
        JSON.parse(await readFile(process.env.MERCURY_CONFIG_PATH, 'utf8')),
        { ...missing, combineOperatorEngineerRoles: enabled },
      );
    }
    for (const invalid of [0, 1, null, 'true', 'false'])
      await assert.rejects(settings.saveCombinedRoles(invalid));
  } finally {
    await writeFile(process.env.MERCURY_CONFIG_PATH, JSON.stringify(before));
  }
});
