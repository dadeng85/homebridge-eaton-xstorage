import { PlatformAccessory } from 'homebridge';
import { EatonXStoragePlatform } from './platform';
import { EatonDeviceStatus, EatonDeviceInfo } from './eatonClient';

export declare class EatonXStorageAccessory {
  private readonly platform;
  private readonly accessory;
  private readonly deviceInfo;
  private readonly batteryService;
  private readonly solarSensorService?;
  private readonly houseLoadSensorService?;
  private readonly gridSensorService?;
  private readonly batteryFlowSensorService?;
  private readonly gridExportSensorService?;
  private stateOfCharge;
  private batteryChargingState;
  private isLowBattery;
  private solarWatts;
  private houseLoadWatts;
  private gridWatts;
  private isGridExporting;
  private batteryEnergyFlowWatts;
  private EveCurrentConsumption;
  constructor(platform: EatonXStoragePlatform, accessory: PlatformAccessory, deviceInfo: EatonDeviceInfo);
  private initEveCharacteristics;
  private addEveConsumptionCharacteristic;
  updateStatus(status: EatonDeviceStatus): void;
}
