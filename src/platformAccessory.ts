import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { EatonXStoragePlatform } from './platform';
import { EatonDeviceStatus, EatonDeviceInfo } from './eatonClient';

export class EatonXStorageAccessory {
  // Primary Battery Service (Native HomeKit)
  private readonly batteryService: Service;

  // Outlet Services (Prese virtuali per Apple Home con stato "In uso" e Watt Eve)
  private readonly solarOutletService?: Service;
  private readonly houseLoadOutletService?: Service;
  private readonly gridExportOutletService?: Service;
  private readonly batteryOutletService?: Service;

  // Optional Lux LightSensors (1 Lux = 1 W)
  private readonly solarLuxService?: Service;
  private readonly houseLoadLuxService?: Service;
  private readonly gridLuxService?: Service;
  private readonly batteryFlowLuxService?: Service;

  // Automation ContactSensor
  private readonly gridExportContactService?: Service;

  // State cache
  private stateOfCharge = 100;
  private batteryChargingState = 0; // 0: NOT_CHARGING, 1: CHARGING
  private isLowBattery = 0; // 0: NORMAL, 1: LOW

  private solarWatts = 0;
  private houseLoadWatts = 0;
  private gridWatts = 0;
  private isGridExporting = false;
  private batteryEnergyFlowWatts = 0;

  private EveCurrentConsumption: any = null;

  constructor(
    private readonly platform: EatonXStoragePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly deviceInfo: EatonDeviceInfo,
  ) {
    const { Service, Characteristic } = this.platform;

    // Set accessory information
    const manufacturer = (this.deviceInfo.inverterManufacturer as string) || 'Eaton';
    const model = (this.deviceInfo.inverterModelName as string) || (this.deviceInfo.model as string) || 'xStorage Home';
    const serial = (this.deviceInfo.inverterSerialNumber as string) || (this.deviceInfo.serialNumber as string) || (this.deviceInfo.id as string) || 'EATON-XSTORAGE';
    const firmware = (this.deviceInfo.inverterFirmwareVersion as string) || (this.deviceInfo.firmwareVersion as string) || '1.0.0';

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, serial)
      .setCharacteristic(Characteristic.FirmwareRevision, firmware);

    // Register Eve custom characteristic if enabled
    if (this.platform.config.exposeEveSensors !== false) {
      this.initEveCharacteristics();
    }

    // 1. Primary Service: Battery (Official native Apple HomeKit Battery)
    this.batteryService = this.accessory.getService(Service.Battery)
      || this.accessory.addService(Service.Battery, `${this.platform.config.name || 'Eaton xStorage'} Battery`);

    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.stateOfCharge);

    this.batteryService.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => this.batteryChargingState);

    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => this.isLowBattery);

    // 2. Prese Intelligenti (Outlets) - Modalità consigliata per Apple Home
    const enableOutlets = this.platform.config.exposeOutlets !== false; // Default: true
    if (enableOutlets) {
      // Produzione Solare Outlet
      this.solarOutletService = this.accessory.getService('Produzione Solare')
        || this.accessory.addService(Service.Outlet, 'Produzione Solare', 'solar-outlet-sub');

      this.solarOutletService.getCharacteristic(Characteristic.On)
        .onGet(() => this.solarWatts > 20)
        .onSet((value: CharacteristicValue) => {
          // Keep read-only / reflect real state
          setTimeout(() => {
            this.solarOutletService?.updateCharacteristic(Characteristic.On, this.solarWatts > 20);
          }, 100);
        });

      this.solarOutletService.getCharacteristic(Characteristic.OutletInUse)
        .onGet(() => this.solarWatts > 20);

      this.addEveConsumptionCharacteristic(this.solarOutletService, () => this.solarWatts);

      // Consumi Casa Outlet
      this.houseLoadOutletService = this.accessory.getService('Consumi Casa')
        || this.accessory.addService(Service.Outlet, 'Consumi Casa', 'house-load-outlet-sub');

      this.houseLoadOutletService.getCharacteristic(Characteristic.On)
        .onGet(() => true)
        .onSet(() => {
          setTimeout(() => {
            this.houseLoadOutletService?.updateCharacteristic(Characteristic.On, true);
          }, 100);
        });

      this.houseLoadOutletService.getCharacteristic(Characteristic.OutletInUse)
        .onGet(() => this.houseLoadWatts > 10);

      this.addEveConsumptionCharacteristic(this.houseLoadOutletService, () => this.houseLoadWatts);

      // Immissione in Rete Outlet
      this.gridExportOutletService = this.accessory.getService('Immissione in Rete')
        || this.accessory.addService(Service.Outlet, 'Immissione in Rete', 'grid-export-outlet-sub');

      this.gridExportOutletService.getCharacteristic(Characteristic.On)
        .onGet(() => this.isGridExporting)
        .onSet(() => {
          setTimeout(() => {
            this.gridExportOutletService?.updateCharacteristic(Characteristic.On, this.isGridExporting);
          }, 100);
        });

      this.gridExportOutletService.getCharacteristic(Characteristic.OutletInUse)
        .onGet(() => this.isGridExporting);

      this.addEveConsumptionCharacteristic(this.gridExportOutletService, () => this.isGridExporting ? this.gridWatts : 0);

      // Carica Batteria Outlet
      this.batteryOutletService = this.accessory.getService('Carica Batteria')
        || this.accessory.addService(Service.Outlet, 'Carica Batteria', 'battery-outlet-sub');

      this.batteryOutletService.getCharacteristic(Characteristic.On)
        .onGet(() => this.batteryChargingState === 1)
        .onSet(() => {
          setTimeout(() => {
            this.batteryOutletService?.updateCharacteristic(Characteristic.On, this.batteryChargingState === 1);
          }, 100);
        });

      this.batteryOutletService.getCharacteristic(Characteristic.OutletInUse)
        .onGet(() => this.batteryChargingState === 1);

      this.addEveConsumptionCharacteristic(this.batteryOutletService, () => this.batteryEnergyFlowWatts);
    } else {
      // Remove outlets if disabled
      this.removeServiceByName('Produzione Solare', Service.Outlet);
      this.removeServiceByName('Consumi Casa', Service.Outlet);
      this.removeServiceByName('Immissione in Rete', Service.Outlet);
      this.removeServiceByName('Carica Batteria', Service.Outlet);
    }

    // 3. Optional Lux LightSensors (Default: disabled when outlets are used)
    const enableLux = this.platform.config.exposeLuxSensors === true;
    if (enableLux) {
      this.solarLuxService = this.accessory.getService('Solar Lux')
        || this.accessory.addService(Service.LightSensor, 'Solar Lux', 'solar-lux-sub');
      this.solarLuxService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.max(0.0001, this.solarWatts));

      this.houseLoadLuxService = this.accessory.getService('House Lux')
        || this.accessory.addService(Service.LightSensor, 'House Lux', 'house-lux-sub');
      this.houseLoadLuxService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.max(0.0001, this.houseLoadWatts));

      this.gridLuxService = this.accessory.getService('Grid Lux')
        || this.accessory.addService(Service.LightSensor, 'Grid Lux', 'grid-lux-sub');
      this.gridLuxService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.max(0.0001, this.gridWatts));

      this.batteryFlowLuxService = this.accessory.getService('Battery Lux')
        || this.accessory.addService(Service.LightSensor, 'Battery Lux', 'battery-lux-sub');
      this.batteryFlowLuxService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.max(0.0001, this.batteryEnergyFlowWatts));
    } else {
      // Clean up old LightSensor services from cache so they disappear from Apple Home
      this.removeServiceByName('Solar Production', Service.LightSensor);
      this.removeServiceByName('House Consumption', Service.LightSensor);
      this.removeServiceByName('Grid Power', Service.LightSensor);
      this.removeServiceByName('Battery Flow', Service.LightSensor);
      this.removeServiceByName('Solar Lux', Service.LightSensor);
      this.removeServiceByName('House Lux', Service.LightSensor);
      this.removeServiceByName('Grid Lux', Service.LightSensor);
      this.removeServiceByName('Battery Lux', Service.LightSensor);
    }

    // 4. Contact sensor for smart automations (optional)
    if (this.platform.config.exposeContactSensor !== false) {
      this.gridExportContactService = this.accessory.getService('Grid Exporting')
        || this.accessory.addService(Service.ContactSensor, 'Grid Exporting', 'grid-export-sub');

      this.gridExportContactService.getCharacteristic(Characteristic.ContactSensorState)
        .onGet(() => this.isGridExporting
          ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
          : Characteristic.ContactSensorState.CONTACT_DETECTED);
    } else {
      this.removeServiceByName('Grid Exporting', Service.ContactSensor);
    }
  }

  private removeServiceByName(name: string, serviceType: any) {
    const s = this.accessory.getService(name);
    if (s && s.UUID === serviceType.UUID) {
      this.platform.log.info(`[EatonAccessory] Removing obsolete service: ${name}`);
      this.accessory.removeService(s);
    }
  }

  /**
   * Define custom Eve Energy characteristic for Watts
   */
  private initEveCharacteristics() {
    const { Characteristic } = this.platform;
    const EVE_CONSUMPTION_UUID = 'E863F10D-079E-48FF-8F24-E2C60F744619';

    class CustomEveCurrentConsumption extends Characteristic {
      static readonly UUID = EVE_CONSUMPTION_UUID;
      constructor() {
        super('Current Consumption', EVE_CONSUMPTION_UUID, {
          format: 'float' as any,
          unit: 'W',
          minValue: 0,
          maxValue: 100000,
          minStep: 0.1,
          perms: ['pr', 'ev'] as any,
        });
        this.value = 0;
      }
    }

    this.EveCurrentConsumption = CustomEveCurrentConsumption;
  }

  private addEveConsumptionCharacteristic(service: Service, getter: () => number) {
    if (!this.EveCurrentConsumption) {
      return;
    }

    const char = service.getCharacteristic(this.EveCurrentConsumption)
      || service.addCharacteristic(this.EveCurrentConsumption);

    char.onGet(() => getter());
  }

  /**
   * Update all HomeKit characteristics when fresh telemetry is received
   */
  public updateStatus(status: EatonDeviceStatus) {
    const { Characteristic } = this.platform;
    const flow = status.energyFlow;
    if (!flow) {
      this.platform.log.warn('[EatonAccessory] Received status payload without energyFlow');
      return;
    }

    const backupLevel = flow.batteryBackupLevel ?? 10;
    const lowThreshold = this.platform.config.lowBatteryThreshold || backupLevel;

    // 1. Battery State
    this.stateOfCharge = Math.min(100, Math.max(0, Math.round(flow.stateOfCharge ?? 0)));
    const rawStatus = (flow.batteryStatus || '').toUpperCase();
    const isCharging = (rawStatus.includes('CHARG') && !rawStatus.includes('DISCHARG')) || rawStatus === 'CHARGE';
    this.batteryChargingState = isCharging
      ? Characteristic.ChargingState.CHARGING
      : Characteristic.ChargingState.NOT_CHARGING;

    this.isLowBattery = this.stateOfCharge <= lowThreshold
      ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

    this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.stateOfCharge);
    this.batteryService.updateCharacteristic(Characteristic.ChargingState, this.batteryChargingState);
    this.batteryService.updateCharacteristic(Characteristic.StatusLowBattery, this.isLowBattery);

    // 2. Solar PV generation
    const acPv = flow.acPvValue ?? 0;
    const dcPv = flow.dcPvValue ?? 0;
    this.solarWatts = Math.max(0, Math.round(acPv + dcPv));

    // 3. House Consumption
    const crit = flow.criticalLoadValue ?? 0;
    const nonCrit = flow.nonCriticalLoadValue ?? 0;
    this.houseLoadWatts = Math.max(0, Math.round(crit + nonCrit));

    // 4. Grid Power & Role
    this.gridWatts = Math.max(0, Math.round(flow.gridValue ?? 0));
    this.isGridExporting = (flow.gridRole || '').toUpperCase() === 'PRODUCER';

    // 5. Battery Flow
    this.batteryEnergyFlowWatts = Math.max(0, Math.round(flow.batteryEnergyFlow ?? 0));

    // Update Outlets (Prese Apple Home)
    if (this.solarOutletService) {
      const isSolarActive = this.solarWatts > 20;
      this.solarOutletService.updateCharacteristic(Characteristic.On, isSolarActive);
      this.solarOutletService.updateCharacteristic(Characteristic.OutletInUse, isSolarActive);
      if (this.EveCurrentConsumption && this.solarOutletService.testCharacteristic(this.EveCurrentConsumption)) {
        this.solarOutletService.updateCharacteristic(this.EveCurrentConsumption, this.solarWatts);
      }
    }

    if (this.houseLoadOutletService) {
      const isLoadActive = this.houseLoadWatts > 10;
      this.houseLoadOutletService.updateCharacteristic(Characteristic.On, true);
      this.houseLoadOutletService.updateCharacteristic(Characteristic.OutletInUse, isLoadActive);
      if (this.EveCurrentConsumption && this.houseLoadOutletService.testCharacteristic(this.EveCurrentConsumption)) {
        this.houseLoadOutletService.updateCharacteristic(this.EveCurrentConsumption, this.houseLoadWatts);
      }
    }

    if (this.gridExportOutletService) {
      this.gridExportOutletService.updateCharacteristic(Characteristic.On, this.isGridExporting);
      this.gridExportOutletService.updateCharacteristic(Characteristic.OutletInUse, this.isGridExporting);
      if (this.EveCurrentConsumption && this.gridExportOutletService.testCharacteristic(this.EveCurrentConsumption)) {
        this.gridExportOutletService.updateCharacteristic(this.EveCurrentConsumption, this.isGridExporting ? this.gridWatts : 0);
      }
    }

    if (this.batteryOutletService) {
      const isBatteryCharging = this.batteryChargingState === 1;
      this.batteryOutletService.updateCharacteristic(Characteristic.On, isBatteryCharging);
      this.batteryOutletService.updateCharacteristic(Characteristic.OutletInUse, isBatteryCharging);
      if (this.EveCurrentConsumption && this.batteryOutletService.testCharacteristic(this.EveCurrentConsumption)) {
        this.batteryOutletService.updateCharacteristic(this.EveCurrentConsumption, this.batteryEnergyFlowWatts);
      }
    }

    // Update Lux Sensors (if enabled)
    if (this.solarLuxService) {
      this.solarLuxService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, this.solarWatts));
    }
    if (this.houseLoadLuxService) {
      this.houseLoadLuxService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, this.houseLoadWatts));
    }
    if (this.gridLuxService) {
      this.gridLuxService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, this.gridWatts));
    }
    if (this.batteryFlowLuxService) {
      this.batteryFlowLuxService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.max(0.0001, this.batteryEnergyFlowWatts));
    }

    // Update Contact Sensor
    if (this.gridExportContactService) {
      this.gridExportContactService.updateCharacteristic(
        Characteristic.ContactSensorState,
        this.isGridExporting
          ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
          : Characteristic.ContactSensorState.CONTACT_DETECTED,
      );
    }

    this.platform.log.debug(
      `[EatonAccessory] Telemetry updated -> SoC: ${this.stateOfCharge}%, Solar: ${this.solarWatts}W, House: ${this.houseLoadWatts}W, Grid: ${this.gridWatts}W (${flow.gridRole || 'NONE'}), Battery: ${this.batteryEnergyFlowWatts}W (${flow.batteryStatus || 'IDLE'})`,
    );
  }
}
