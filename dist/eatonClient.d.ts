import { Logging } from 'homebridge';

export interface EatonEnergyFlow {
  operationMode?: string;
  batteryStatus?: string;
  batteryBackupLevel?: number;
  batteryEnergyFlow?: number;
  selfConsumption?: number;
  stateOfCharge?: number;
  gridRole?: 'CONSUMER' | 'PRODUCER' | 'NONE' | string;
  gridValue?: number;
  criticalLoadRole?: string;
  criticalLoadValue?: number;
  nonCriticalLoadRole?: string;
  nonCriticalLoadValue?: number;
  acPvRole?: string;
  acPvValue?: number;
  dcPvRole?: string;
  dcPvValue?: number;
}

export interface EatonDeviceStatus {
  energyFlow?: EatonEnergyFlow;
  currentMode?: Record<string, unknown>;
  connected?: boolean;
  [key: string]: unknown;
}

export interface EatonDeviceInfo {
  id?: string;
  serialNumber?: string;
  model?: string;
  version?: string;
  softwareVersion?: string;
  connected?: boolean;
  [key: string]: unknown;
}

export declare class EatonClient {
  private readonly host;
  private readonly username;
  private readonly password;
  private readonly log;
  private readonly client;
  private token;
  private readonly baseUrl;
  constructor(host: string, username: string, password: string, log: Logging);
  login(): Promise<string>;
  private ensureToken;
  getDeviceInfo(): Promise<EatonDeviceInfo>;
  getDeviceStatus(): Promise<EatonDeviceStatus>;
}
