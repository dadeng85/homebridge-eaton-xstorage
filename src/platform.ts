import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { EatonClient, EatonDeviceInfo } from './eatonClient';
import { EatonXStorageAccessory } from './platformAccessory';

export class EatonXStoragePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private eatonClient: EatonClient | null = null;
  private accessoryHandler: EatonXStorageAccessory | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.debug('[EatonXStoragePlatform] Initializing platform...');

    this.api.on('didFinishLaunching', () => {
      this.log.debug('[EatonXStoragePlatform] Executed didFinishLaunching callback');
      this.initDevice();
    });
  }

  /**
   * Homebridge will call this method when restoring cached accessories from disk.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('[EatonXStoragePlatform] Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  /**
   * Initialize communication with Eaton xStorage and setup accessories
   */
  private async initDevice() {
    const host = this.config.ip || '192.168.1.73';
    const username = this.config.username;
    const password = this.config.password;

    if (!username || !password) {
      this.log.error(
        '[EatonXStoragePlatform] Inverter username or password is missing in plugin configuration! Please configure credentials in Homebridge Settings.',
      );
      return;
    }

    this.eatonClient = new EatonClient(host, username, password, this.log);

    let deviceInfo: EatonDeviceInfo = {};
    try {
      this.log.info(`[EatonXStoragePlatform] Connecting to Eaton xStorage inverter at ${host}...`);
      await this.eatonClient.login();
      deviceInfo = await this.eatonClient.getDeviceInfo();
      this.log.info(
        `[EatonXStoragePlatform] Successfully connected to Eaton xStorage! Model: ${deviceInfo.model || 'xStorage'}, Serial: ${deviceInfo.serialNumber || deviceInfo.id || 'N/A'}`,
      );
    } catch (err: any) {
      this.log.warn(
        `[EatonXStoragePlatform] Initial connection failed (${err.message}). Will retry during periodic polling.`,
      );
    }

    // Generate unique accessory UUID
    const uuidSeed = (deviceInfo.serialNumber as string) || (deviceInfo.id as string) || host;
    const uuid = this.api.hap.uuid.generate(uuidSeed);

    const existingAccessory = this.accessories.find((acc) => acc.UUID === uuid);

    const accessoryName = (this.config.name as string) || 'Eaton xStorage';

    let accessory: PlatformAccessory;
    if (existingAccessory) {
      this.log.info('[EatonXStoragePlatform] Restoring existing accessory from cache:', existingAccessory.displayName);
      accessory = existingAccessory;
    } else {
      this.log.info('[EatonXStoragePlatform] Adding new accessory:', accessoryName);
      accessory = new this.api.platformAccessory(accessoryName, uuid);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    // Instantiate accessory handler
    this.accessoryHandler = new EatonXStorageAccessory(this, accessory, deviceInfo);

    // Initial status fetch
    await this.pollStatus();

    // Start periodic polling
    const intervalSec = Math.max(3, Number(this.config.pollInterval) || 10);
    this.log.info(`[EatonXStoragePlatform] Starting polling timer every ${intervalSec} seconds.`);
    this.pollTimer = setInterval(() => {
      this.pollStatus();
    }, intervalSec * 1000);
  }

  /**
   * Poll live status from inverter and update HomeKit
   */
  private async pollStatus() {
    if (!this.eatonClient || !this.accessoryHandler) {
      return;
    }

    try {
      const status = await this.eatonClient.getDeviceStatus();
      this.accessoryHandler.updateStatus(status);
    } catch (err: any) {
      this.log.warn(`[EatonXStoragePlatform] Error polling Eaton inverter status: ${err.message}`);
    }
  }
}
