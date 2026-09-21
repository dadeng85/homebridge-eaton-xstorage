import https from 'https';
import axios, { AxiosInstance } from 'axios';
import { Logging } from 'homebridge';

export interface EatonEnergyFlow {
  operationMode?: string;
  batteryStatus?: string; // e.g. 'BAT_CHARGING', 'BAT_DISCHARGING', 'BAT_IDLE'
  batteryBackupLevel?: number;
  batteryEnergyFlow?: number;
  selfConsumption?: number;
  selfSufficiency?: number;
  stateOfCharge?: number; // 0 - 100
  gridRole?: 'CONSUMER' | 'PRODUCER' | 'NONE' | string;
  gridValue?: number; // W
  criticalLoadRole?: string;
  criticalLoadValue?: number; // W
  nonCriticalLoadRole?: string;
  nonCriticalLoadValue?: number; // W
  acPvRole?: string;
  acPvValue?: number; // W
  dcPvRole?: string;
  dcPvValue?: number; // W
  energySavingModeEnabled?: boolean;
  energySavingModeActivated?: boolean;
}

export interface EatonEnergyToday {
  gridConsumption?: number; // Wh
  photovoltaicProduction?: number; // Wh
  selfConsumption?: number; // %
  selfSufficiency?: number; // %
}

export interface EatonDeviceStatus {
  energyFlow?: EatonEnergyFlow;
  today?: EatonEnergyToday;
  currentMode?: Record<string, unknown>;
  connected?: boolean;
  [key: string]: unknown;
}

export interface EatonDeviceInfo {
  id?: string;
  name?: string;
  inverterManufacturer?: string;
  inverterModelName?: string;
  inverterSerialNumber?: string;
  inverterFirmwareVersion?: string;
  firmwareVersion?: string;
  bmsCapacity?: number;
  bmsFirmwareVersion?: string;
  bmsBackupLevel?: number;
  bmsSerialNumber?: string;
  bmsModel?: string;
  model?: string;
  serialNumber?: string;
  version?: string;
  softwareVersion?: string;
  hasPv?: boolean;
  hasBattery?: boolean;
  connected?: boolean;
  [key: string]: unknown;
}

export class EatonClient {
  private readonly client: AxiosInstance;
  private token: string | null = null;
  private readonly baseUrl: string;

  constructor(
    private readonly host: string,
    private readonly username: string,
    private readonly password: string,
    private readonly log: Logging,
  ) {
    // Normalise host: strip protocol or trailing slashes if present
    const cleanHost = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    this.baseUrl = `https://${cleanHost}/api`;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 8000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Eaton inverter uses self-signed local certificate
      }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Authenticate with the Eaton xStorage inverter
   */
  public async login(): Promise<string> {
    this.log.debug(`[EatonClient] Logging in to ${this.baseUrl}/auth/signin as ${this.username}...`);

    try {
      const response = await this.client.post('/auth/signin', {
        username: this.username,
        pwd: this.password,
        userType: 'customer',
      });

      const token = response.data?.result?.token;
      if (!token) {
        throw new Error('Login response did not contain an authentication token');
      }

      this.token = token;
      this.log.debug('[EatonClient] Authentication successful, token acquired.');
      return token;
    } catch (error: any) {
      const errMsg = error.response?.data?.error?.description || error.message;
      this.log.error(`[EatonClient] Login failed for ${this.username}: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Ensure a valid token exists; authenticate if necessary
   */
  private async ensureToken(): Promise<string> {
    if (!this.token) {
      return await this.login();
    }
    return this.token;
  }

  /**
   * Fetch device information (model, serial number, firmware version)
   */
  public async getDeviceInfo(): Promise<EatonDeviceInfo> {
    const token = await this.ensureToken();

    try {
      const response = await this.client.get('/device/', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data?.result || {};
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.log.debug('[EatonClient] Token expired while fetching device info, refreshing token...');
        this.token = null;
        const newToken = await this.login();
        const retryResponse = await this.client.get('/device/', {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        });
        return retryResponse.data?.result || {};
      }
      throw error;
    }
  }

  /**
   * Fetch real-time device status and energy flow telemetry
   */
  public async getDeviceStatus(): Promise<EatonDeviceStatus> {
    const token = await this.ensureToken();

    try {
      const response = await this.client.get('/device/status', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data?.result || {};
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.log.debug('[EatonClient] Token expired while fetching device status, refreshing token...');
        this.token = null;
        const newToken = await this.login();
        const retryResponse = await this.client.get('/device/status', {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        });
        return retryResponse.data?.result || {};
      }
      throw error;
    }
  }
}
