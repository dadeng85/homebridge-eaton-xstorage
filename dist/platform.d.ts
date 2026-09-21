import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

export declare class EatonXStoragePlatform implements DynamicPlatformPlugin {
  readonly log: Logging;
  readonly config: PlatformConfig;
  readonly api: API;
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;
  readonly accessories: PlatformAccessory[];
  private eatonClient;
  private accessoryHandler;
  private pollTimer;
  constructor(log: Logging, config: PlatformConfig, api: API);
  configureAccessory(accessory: PlatformAccessory): void;
  private initDevice;
  private pollStatus;
}
