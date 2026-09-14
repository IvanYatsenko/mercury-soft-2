import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import {
  ThermalProfile,
  Furnace,
  FurnaceStatus,
  FurnaceErrorType,
  Sensor,
  SensorType,
  Heater,
  HeaterType,
  User,
  UserRole,
} from '@mercury-soft-2/shared';
import MockBoardService from './services/MockBoardService';

const PORT = process.env.API_PORT || 3001;
const DB_PATH = process.env.DB_PATH || './data/mercury.db';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

// Mock Board Service
const mockBoard = new MockBoardService();

// ==================== Database ====================

async function initDatabase() {
  const dbPath = path.resolve(DB_PATH);
  const dataDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS thermal_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stages TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'manual',
      use_external_sensor INTEGER NOT NULL DEFAULT 0,
      shelves TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create sample data if empty
  const count = db.exec('SELECT COUNT(*) FROM thermal_profiles');
  if (count[0]?.values[0][0] === 0) {
    insertSampleData();
  }

  saveDatabase();
}

function saveDatabase() {
  const dbPath = path.resolve(DB_PATH);
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function insertSampleData() {
  const now = new Date().toISOString();

  const profiles = [
    {
      id: 'profile-standard-001',
      name: 'Стандартный (Lead-Free)',
      stages: JSON.stringify([
        { second: 60, temperature: 150 },
        { second: 90, temperature: 217 },
        { second: 30, temperature: 245 },
        { second: 60, temperature: 100 },
      ]),
      mode: 'manual',
      useExternalSensor: 0,
      shelves: JSON.stringify({ time: 60, temperature: 150 }),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'profile-lead-free-001',
      name: 'Бессвинцовый припой',
      stages: JSON.stringify([
        { second: 45, temperature: 150 },
        { second: 75, temperature: 217 },
        { second: 20, temperature: 250 },
        { second: 45, temperature: 100 },
      ]),
      mode: 'easy',
      useExternalSensor: 0,
      shelves: JSON.stringify({ time: 45, temperature: 150 }),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'profile-thin-board-001',
      name: 'Тонкая плата',
      stages: JSON.stringify([
        { second: 30, temperature: 120 },
        { second: 60, temperature: 200 },
        { second: 15, temperature: 235 },
        { second: 30, temperature: 80 },
      ]),
      mode: 'manual',
      useExternalSensor: 1,
      shelves: JSON.stringify({ time: 30, temperature: 120 }),
      createdAt: now,
      updatedAt: now,
    },
  ];

  profiles.forEach((profile) => {
    db.run(
      'INSERT INTO thermal_profiles (id, name, stages, mode, use_external_sensor, shelves, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        profile.id,
        profile.name,
        profile.stages,
        profile.mode,
        profile.useExternalSensor,
        profile.shelves,
        profile.createdAt,
        profile.updatedAt,
      ],
    );
  });
}

// ==================== Middleware ====================

function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
}

// ==================== Health ====================

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: db ? 'connected' : 'disconnected',
  });
});

// ==================== Thermal Profiles ====================

// Get all thermal profiles
app.get('/api/thermal-profiles', (_req: Request, res: Response) => {
  try {
    const result = db.exec('SELECT * FROM thermal_profiles ORDER BY created_at DESC');
    const profiles: ThermalProfile[] = [];

    if (result.length > 0) {
      const rows = result[0].values;

      rows.forEach((row: unknown[]) => {
        const profile: ThermalProfile = {
          id: row[0] as string,
          name: row[1] as string,
          stages: JSON.parse(row[2] as string),
          mode: row[3] as 'easy' | 'manual',
          useExternalSensor: row[4] as boolean,
          shelves: JSON.parse(row[5] as string),
          createdAt: new Date(row[6] as string),
          updatedAt: new Date(row[7] as string),
        };
        profiles.push(profile);
      });
    }

    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// Get single thermal profile by ID
app.get('/api/thermal-profiles/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = db.exec('SELECT * FROM thermal_profiles WHERE id = ?', [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const row = result[0].values[0];
    const profile: ThermalProfile = {
      id: row[0] as string,
      name: row[1] as string,
      stages: JSON.parse(row[2] as string),
      mode: row[3] as 'easy' | 'manual',
      useExternalSensor: row[4] as boolean,
      shelves: JSON.parse(row[5] as string),
      createdAt: new Date(row[6] as string),
      updatedAt: new Date(row[7] as string),
    };

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Create thermal profile
app.post('/api/thermal-profiles', (req: Request, res: Response) => {
  try {
    const { name, stages, mode, useExternalSensor, shelves } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.run(
      'INSERT INTO thermal_profiles (id, name, stages, mode, use_external_sensor, shelves, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        name,
        JSON.stringify(stages || []),
        mode || 'manual',
        useExternalSensor ? 1 : 0,
        JSON.stringify(shelves || { time: 0, temperature: 0 }),
        now,
        now,
      ],
    );

    saveDatabase();

    const profileResult = db.exec('SELECT * FROM thermal_profiles WHERE id = ?', [id]);
    const profile: ThermalProfile = {
      id: profileResult[0].values[0][0] as string,
      name: profileResult[0].values[0][1] as string,
      stages: JSON.parse(profileResult[0].values[0][2] as string),
      mode: profileResult[0].values[0][3] as 'easy' | 'manual',
      useExternalSensor: profileResult[0].values[0][4] as boolean,
      shelves: JSON.parse(profileResult[0].values[0][5] as string),
      createdAt: new Date(profileResult[0].values[0][6] as string),
      updatedAt: new Date(profileResult[0].values[0][7] as string),
    };

    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// Update thermal profile
app.put('/api/thermal-profiles/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, stages, mode, useExternalSensor, shelves } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const now = new Date().toISOString();

    db.run(
      'UPDATE thermal_profiles SET name = ?, stages = ?, mode = ?, use_external_sensor = ?, shelves = ?, updated_at = ? WHERE id = ?',
      [
        name,
        JSON.stringify(stages || []),
        mode || 'manual',
        useExternalSensor ? 1 : 0,
        JSON.stringify(shelves || { time: 0, temperature: 0 }),
        now,
        id,
      ],
    );

    saveDatabase();

    const profileResult = db.exec('SELECT * FROM thermal_profiles WHERE id = ?', [id]);
    const profile: ThermalProfile = {
      id: profileResult[0].values[0][0] as string,
      name: profileResult[0].values[0][1] as string,
      stages: JSON.parse(profileResult[0].values[0][2] as string),
      mode: profileResult[0].values[0][3] as 'easy' | 'manual',
      useExternalSensor: profileResult[0].values[0][4] as boolean,
      shelves: JSON.parse(profileResult[0].values[0][5] as string),
      createdAt: new Date(profileResult[0].values[0][6] as string),
      updatedAt: new Date(profileResult[0].values[0][7] as string),
    };

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete thermal profile
app.delete('/api/thermal-profiles/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    db.run('DELETE FROM thermal_profiles WHERE id = ?', [id]);
    saveDatabase();

    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// ==================== Furnace Status ====================

// Get furnace status (simulated)
app.get('/api/furnace', (_req: Request, res: Response) => {
  const boardState = mockBoard.getState();

  const furnace: Furnace = {
    licenseNumber: 'MRK-301-2026-001',
    ip: '192.168.1.100',
    model: 'Mercury-301',
    softwareVersion: '3.02.0',
    name: 'Меркурий-301 #1',
    description: 'Печь оплавления на линии SMD',
    status: boardState.isRunning ? boardState.status : FurnaceStatus.IDLE,
    temperature: Math.round(boardState.temperature),
    currentProfileId: null,
    error: boardState.error
      ? {
          type: FurnaceErrorType.FAILURE,
          code: 500,
          message: boardState.error,
        }
      : null,
  };

  res.json(furnace);
});

// ==================== Mock Board Simulation ====================

// Get simulation state
app.get('/api/simulation', (_req: Request, res: Response) => {
  const state = mockBoard.getState();
  const config = mockBoard.getConfig();

  res.json({
    state: {
      temperature: state.temperature,
      targetTemperature: state.targetTemperature,
      status: state.status,
      isRunning: state.isRunning,
      currentStage: state.currentStage,
      totalStages: state.totalStages,
      error: state.error,
    },
    config: {
      ambientTemperature: config.ambientTemperature,
      heatingRate: config.heatingRate,
      coolingRate: config.coolingRate,
      temperatureTolerance: config.temperatureTolerance,
      errorChance: config.errorChance,
    },
  });
});

// Start simulation
app.post('/api/simulation/start', (req: Request, res: Response) => {
  const { targetTemperature, stages } = req.body;

  if (!targetTemperature || targetTemperature < 0) {
    res.status(400).json({ error: 'targetTemperature is required' });
    return;
  }

  mockBoard.start(targetTemperature, stages);

  res.json({
    success: true,
    state: mockBoard.getState(),
  });
});

// Stop simulation
app.post('/api/simulation/stop', (_req: Request, res: Response) => {
  mockBoard.stop();

  res.json({
    success: true,
    state: mockBoard.getState(),
  });
});

// Reset simulation
app.post('/api/simulation/reset', (_req: Request, res: Response) => {
  mockBoard.reset();

  res.json({
    success: true,
    state: mockBoard.getState(),
  });
});

// Update simulation config
app.put('/api/simulation/config', (req: Request, res: Response) => {
  const { config } = req.body;

  if (config) {
    mockBoard.updateConfig(config);
  }

  res.json({
    success: true,
    config: mockBoard.getConfig(),
  });
});

// Get sensors with simulated temperatures
app.get('/api/sensors', (_req: Request, res: Response) => {
  const boardState = mockBoard.getState();

  const sensors: Sensor[] = [
    {
      id: 'sensor-primary-001',
      name: 'Основная термопара',
      type: SensorType.PRIMARY,
      currentTemperature: Math.round(boardState.temperature),
      maxTemperature: 300,
      isActive: boardState.isRunning,
    },
    {
      id: 'sensor-secondary-001',
      name: 'Дополнительная термопара',
      type: SensorType.SECONDARY,
      currentTemperature: Math.round(boardState.temperature - 1),
      maxTemperature: 300,
      isActive: boardState.isRunning,
    },
  ];

  res.json(sensors);
});

// Get heaters with simulated states
app.get('/api/heaters', (_req: Request, res: Response) => {
  const boardState = mockBoard.getState();

  const heaters: Heater[] = [
    {
      id: 'heater-top-001',
      name: 'Верхний ТЭН',
      type: HeaterType.HEATING_ELEMENT,
      isActive: boardState.isRunning && boardState.status === FurnaceStatus.WORK,
      power: 1500,
      temperature: boardState.isRunning ? Math.round(boardState.temperature * 1.2) : 25,
    },
    {
      id: 'heater-bottom-001',
      name: 'Нижний ТЭН',
      type: HeaterType.HEATING_ELEMENT,
      isActive: boardState.isRunning && boardState.status === FurnaceStatus.WORK,
      power: 1500,
      temperature: boardState.isRunning ? Math.round(boardState.temperature * 1.1) : 25,
    },
    {
      id: 'heater-ir-001',
      name: 'ИК-лампы',
      type: HeaterType.INFRARED_LAMP,
      isActive: boardState.isRunning && boardState.status === FurnaceStatus.WORK,
      power: 800,
      temperature: boardState.isRunning ? Math.round(boardState.temperature * 1.5) : 25,
    },
    {
      id: 'fan-convection-001',
      name: 'Вентилятор конвекции',
      type: HeaterType.CONVECTION_FAN,
      isActive: boardState.isRunning,
      power: 200,
    },
    {
      id: 'fan-cooling-001',
      name: 'Вентилятор охлаждения',
      type: HeaterType.COOLING_FAN,
      isActive: boardState.isRunning && boardState.status === FurnaceStatus.BUSY,
      power: 150,
    },
  ];

  res.json(heaters);
});

// ==================== Sensors ====================

// Get sensors
app.get('/api/sensors', (_req: Request, res: Response) => {
  const sensors: Sensor[] = [
    {
      id: 'sensor-primary-001',
      name: 'Основная термопара',
      type: SensorType.PRIMARY,
      currentTemperature: 25,
      maxTemperature: 300,
      isActive: true,
    },
    {
      id: 'sensor-secondary-001',
      name: 'Дополнительная термопара',
      type: SensorType.SECONDARY,
      currentTemperature: 24,
      maxTemperature: 300,
      isActive: true,
    },
  ];

  res.json(sensors);
});

// ==================== Heaters ====================

// Get heaters
app.get('/api/heaters', (_req: Request, res: Response) => {
  const heaters: Heater[] = [
    {
      id: 'heater-top-001',
      name: 'Верхний ТЭН',
      type: HeaterType.HEATING_ELEMENT,
      isActive: false,
      power: 1500,
      temperature: 25,
    },
    {
      id: 'heater-bottom-001',
      name: 'Нижний ТЭН',
      type: HeaterType.HEATING_ELEMENT,
      isActive: false,
      power: 1500,
      temperature: 25,
    },
    {
      id: 'heater-ir-001',
      name: 'ИК-лампы',
      type: HeaterType.INFRARED_LAMP,
      isActive: false,
      power: 800,
    },
    {
      id: 'fan-convection-001',
      name: 'Вентилятор конвекции',
      type: HeaterType.CONVECTION_FAN,
      isActive: false,
      power: 200,
    },
    {
      id: 'fan-cooling-001',
      name: 'Вентилятор охлаждения',
      type: HeaterType.COOLING_FAN,
      isActive: false,
      power: 150,
    },
  ];

  res.json(heaters);
});

// ==================== Users ====================

// Get current user
app.get('/api/users/me', (_req: Request, res: Response) => {
  const user: User = {
    id: 'user-engineer-001',
    username: 'engineer',
    email: 'engineer@mercury.local',
    role: UserRole.ENGINEER,
    createdAt: new Date('2026-01-01'),
    lastLoginAt: new Date(),
    isActive: true,
  };

  res.json(user);
});

// ==================== Error Handler ====================

app.use(errorHandler);

// ==================== Start Server ====================

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.info(`\n========================================`);
    console.info(`Mercury API server running`);
    console.info(`Port: http://localhost:${PORT}`);
    console.info(`Health: http://localhost:${PORT}/api/health`);
    console.info(`Profiles: http://localhost:${PORT}/api/thermal-profiles`);
    console.info(`========================================\n`);
  });
});

export { app };
