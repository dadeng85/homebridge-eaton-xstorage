import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { EatonXStoragePlatform } from './platform';
import { EatonDeviceStatus, EatonDeviceInfo } from './eatonClient';

export class EatonXStorageAccessory {
  // 1. Batteria nativa Apple Home
  private readonly batteryService: Service;

  // 2. Prese Intelligenti di Stato (Outlets)
  private solarOutletService?: Service;
  private houseLoadOutletService?: Service;
  private gridExportOutletService?: Service;
  private gridImportOutletService?: Service;
  private batteryChargingOutletService?: Service;
  private batteryDischargingOutletService?: Service;

  // 3. Valori Numerici di Potenza (1 Lux = 1 Watt)
  private solarPowerService?: Service;
  private housePowerService?: Service;
  private gridExportPowerService?: Service;
  private gridImportPowerService?: Service;
  private batteryChargePowerService?: Service;
  private batteryDischargePowerService?: Service;

  // 4. Percentuali Energetiche (0-100%)
  private selfConsumptionService?: Service;
  private selfSufficiencyService?: Service;

  // 5. Sensore di Contatto per Automazioni Surplus
  private gridExportContactService?: Service;

  // State cache
  private stateOfCharge = 100;
  private batteryChargingState = 0; // 0: NOT_CHARGING, 1: CHARGING
  private isLowBattery = 0; // 0: NORMAL, 1: LOW

  private solarWatts = 0;
  private houseLoadWatts = 0;
  private gridWatts = 0;
  private isGridExporting = false;
  private isGridImporting = false;
  private gridExportWatts = 0;
  private gridImportWatts = 0;

  private batteryEnergyFlowWatts = 0;
  private isBatteryCharging = false;
  private isBatteryDischarging = false;
  private batteryChargeWatts = 0;
  private batteryDischargeWatts = 0;

  private selfConsumptionPercent = 0;
  private selfSufficiencyPercent = 0;

  constructor(
    private readonly platform: EatonXStoragePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly deviceInfo: EatonDeviceInfo,
  ) {
    const { Service, Characteristic } = this.platform;

    // Accessory Information (100% Apple standard)
    const manufacturer = (this.deviceInfo.inverterManufacturer as string) || 'Eaton';
    const model = (this.deviceInfo.inverterModelName as string) || (this.deviceInfo.model as string) || 'xStorage Home';
    const serial = (this.deviceInfo.inverterSerialNumber as string) || (this.deviceInfo.serialNumber as string) || (this.deviceInfo.id as string) || 'EATON-XSTORAGE';
    const firmware = (this.deviceInfo.inverterFirmwareVersion as string) || (this.deviceInfo.firmwareVersion as string) || '1.0.0';

    this.accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, manufacturer)
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, serial)
      .setCharacteristic(Characteristic.FirmwareRevision, firmware);

    const activeSubtypes = new Set<string>();

    // ==========================================
    // 1. BATTERIA NATIVA APPLE HOME
    // ==========================================
    this.batteryService = this.accessory.getService(Service.Battery)
      || this.accessory.addService(Service.Battery, `${this.platform.config.name || 'Eaton xStorage'} Battery`);

    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
      .onGet(() => this.stateOfCharge);

    this.batteryService.getCharacteristic(Characteristic.ChargingState)
      .onGet(() => this.batteryChargingState);

    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
      .onGet(() => this.isLowBattery);

    // ==========================================
    // 2. PRESE DI STATO (APPLE HOME OUTLETS)
    // ==========================================
    const showOutlets = this.platform.config.showOutlets !== false;
    if (showOutlets) {
      // Produzione Solare Outlet
      this.solarOutletService = this.getOrCreateService(Service.Outlet, 'Produzione Solare', 'solar-outlet-sub');
      this.bindOutlet(this.solarOutletService, () => this.solarWatts > 20);
      activeSubtypes.add('solar-outlet-sub');

      // Consumi Casa Outlet
      this.houseLoadOutletService = this.getOrCreateService(Service.Outlet, 'Consumi Casa', 'house-load-outlet-sub');
      this.bindOutlet(this.houseLoadOutletService, () => this.houseLoadWatts > 10, () => true);
      activeSubtypes.add('house-load-outlet-sub');

      // Immissione in Rete Outlet
      this.gridExportOutletService = this.getOrCreateService(Service.Outlet, 'Immissione in Rete', 'grid-export-outlet-sub');
      this.bindOutlet(this.gridExportOutletService, () => this.isGridExporting && this.gridWatts > 20);
      activeSubtypes.add('grid-export-outlet-sub');

      // Prelievo da Rete Outlet
      this.gridImportOutletService = this.getOrCreateService(Service.Outlet, 'Prelievo da Rete', 'grid-import-outlet-sub');
      this.bindOutlet(this.gridImportOutletService, () => this.isGridImporting && this.gridWatts > 20);
      activeSubtypes.add('grid-import-outlet-sub');

      // Carica Batteria Outlet
      this.batteryChargingOutletService = this.getOrCreateService(Service.Outlet, 'Carica Batteria', 'battery-charging-outlet-sub');
      this.bindOutlet(this.batteryChargingOutletService, () => this.isBatteryCharging && this.batteryEnergyFlowWatts > 20);
      activeSubtypes.add('battery-charging-outlet-sub');

      // Scarica Batteria Outlet
      this.batteryDischargingOutletService = this.getOrCreateService(Service.Outlet, 'Scarica Batteria', 'battery-discharging-outlet-sub');
      this.bindOutlet(this.batteryDischargingOutletService, () => this.isBatteryDischarging && this.batteryEnergyFlowWatts > 20);
      activeSubtypes.add('battery-discharging-outlet-sub');
    }

    // ==========================================
    // 3. SENSORI DI POTENZA (1 LUX = 1 WATT)
    // ==========================================
    const showPowerSensors = this.platform.config.showPowerSensors !== false;
    if (showPowerSensors) {
      this.solarPowerService = this.getOrCreateService(Service.LightSensor, 'Watt Solari', 'solar-watt-sub');
      this.solarPowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.solarWatts)));
      activeSubtypes.add('solar-watt-sub');

      this.housePowerService = this.getOrCreateService(Service.LightSensor, 'Watt Consumi Casa', 'house-watt-sub');
      this.housePowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.houseLoadWatts)));
      activeSubtypes.add('house-watt-sub');

      this.gridExportPowerService = this.getOrCreateService(Service.LightSensor, 'Watt Immissione Rete', 'grid-export-watt-sub');
      this.gridExportPowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.gridExportWatts)));
      activeSubtypes.add('grid-export-watt-sub');

      this.gridImportPowerService = this.getOrCreateService(Service.LightSensor, 'Watt Prelievo Rete', 'grid-import-watt-sub');
      this.gridImportPowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.gridImportWatts)));
      activeSubtypes.add('grid-import-watt-sub');

      this.batteryChargePowerService = this.getOrCreateService(Service.LightSensor, 'Watt Carica Batteria', 'battery-charge-watt-sub');
      this.batteryChargePowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.batteryChargeWatts)));
      activeSubtypes.add('battery-charge-watt-sub');

      this.batteryDischargePowerService = this.getOrCreateService(Service.LightSensor, 'Watt Scarica Batteria', 'battery-discharge-watt-sub');
      this.batteryDischargePowerService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .onGet(() => Math.min(100000, Math.max(0.0001, this.batteryDischargeWatts)));
      activeSubtypes.add('battery-discharge-watt-sub');
    }

    // ==========================================
    // 4. PERCENTUALI ENERGETICHE (0-100%)
    // ==========================================
    const showPercentages = this.platform.config.showPercentages !== false;
    if (showPercentages) {
      this.selfConsumptionService = this.getOrCreateService(Service.HumiditySensor, 'Autoconsumo Solare', 'self-consumption-sub');
      this.selfConsumptionService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => Math.min(100, Math.max(0, this.selfConsumptionPercent)));
      activeSubtypes.add('self-consumption-sub');

      this.selfSufficiencyService = this.getOrCreateService(Service.HumiditySensor, 'Autosufficienza Energetica', 'self-sufficiency-sub');
      this.selfSufficiencyService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .onGet(() => Math.min(100, Math.max(0, this.selfSufficiencyPercent)));
      activeSubtypes.add('self-sufficiency-sub');
    }

    // ==========================================
    // 5. SENSORE CONTATTO PER AUTOMAZIONI SURPLUS
    // ==========================================
    const showContactSensor = this.platform.config.showContactSensor !== false;
    if (showContactSensor) {
      this.gridExportContactService = this.getOrCreateService(Service.ContactSensor, 'Surplus Rete (Immissione)', 'grid-export-sub');
      this.gridExportContactService.getCharacteristic(Characteristic.ContactSensorState)
        .onGet(() => (this.isGridExporting && this.gridWatts > 50)
          ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
          : Characteristic.ContactSensorState.CONTACT_DETECTED);
      activeSubtypes.add('grid-export-sub');
    }

    // Clean up any disabled, renamed, or obsolete services
    this.cleanObsoleteServices(activeSubtypes);
  }

  private getOrCreateService(
    serviceType: any,
    name: string,
    subType: string,
  ): Service {
    let service = this.accessory.getService(subType)
               || this.accessory.getService(name);
    if (!service) {
      service = this.accessory.addService(serviceType, name, subType);
    }

    const { Characteristic } = this.platform;
    if (!service.testCharacteristic(Characteristic.Name)) {
      service.addCharacteristic(Characteristic.Name);
    }
    service.setCharacteristic(Characteristic.Name, name);

    if (Characteristic.ConfiguredName) {
      if (!service.testCharacteristic(Characteristic.ConfiguredName)) {
        service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      }
      service.setCharacteristic(Characteristic.ConfiguredName, name);
    }

    return service;
  }

  private bindOutlet(service: Service, inUseCondition: () => boolean, onCondition?: () => boolean) {
    const { Characteristic } = this.platform;
    const isStateOn = onCondition || inUseCondition;

    service.getCharacteristic(Characteristic.On)
      .onGet(() => isStateOn())
      .onSet(() => {
        setTimeout(() => {
          service.updateCharacteristic(Characteristic.On, isStateOn());
        }, 150);
      });

    service.getCharacteristic(Characteristic.OutletInUse)
      .onGet(() => inUseCondition());
  }

  private cleanObsoleteServices(activeSubtypes: Set<string>) {
    const { Service } = this.platform;
    const obsoleteNames = new Set([
      'Solar Production', 'House Consumption', 'Grid Power', 'Battery Flow',
      'Solar Lux', 'House Lux', 'Grid Lux', 'Battery Lux',
      'Watt Rete', 'Watt Batteria', 'Grid Exporting',
    ]);

    const toRemove: Service[] = [];
    for (const service of this.accessory.services) {
      if (service.UUID === Service.AccessoryInformation.UUID || service.UUID === Service.Battery.UUID) {
        continue;
      }
      if (service.subtype && !activeSubtypes.has(service.subtype)) {
        toRemove.push(service);
      } else if (service.displayName && obsoleteNames.has(service.displayName)) {
        toRemove.push(service);
      }
    }

    for (const s of toRemove) {
      this.platform.log.info(`[EatonAccessory] Removing obsolete or disabled service: ${s.displayName} (${s.subtype || 'no-sub'})`);
      this.accessory.removeService(s);
    }
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
    this.isBatteryCharging = (rawStatus.includes('CHARG') && !rawStatus.includes('DISCHARG')) || rawStatus === 'CHARGE';
    this.isBatteryDischarging = rawStatus.includes('DISCHARG');
    this.batteryChargingState = this.isBatteryCharging
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

    // 4. Grid Power & Direction
    this.gridWatts = Math.max(0, Math.round(flow.gridValue ?? 0));
    const gridRole = (flow.gridRole || '').toUpperCase();
    this.isGridExporting = gridRole === 'PRODUCER';
    this.isGridImporting = gridRole === 'CONSUMER';
    this.gridExportWatts = this.isGridExporting ? this.gridWatts : 0;
    this.gridImportWatts = this.isGridImporting ? this.gridWatts : 0;

    // 5. Battery Flow
    this.batteryEnergyFlowWatts = Math.max(0, Math.round(flow.batteryEnergyFlow ?? 0));
    this.batteryChargeWatts = this.isBatteryCharging ? this.batteryEnergyFlowWatts : 0;
    this.batteryDischargeWatts = this.isBatteryDischarging ? this.batteryEnergyFlowWatts : 0;

    // 6. Percentages
    this.selfConsumptionPercent = Math.min(100, Math.max(0, Math.round(status.today?.selfConsumption ?? flow.selfConsumption ?? 0)));
    this.selfSufficiencyPercent = Math.min(100, Math.max(0, Math.round(status.today?.selfSufficiency ?? flow.selfSufficiency ?? 0)));

    // Update Outlets
    if (this.solarOutletService) {
      const isSolarActive = this.solarWatts > 20;
      this.solarOutletService.updateCharacteristic(Characteristic.On, isSolarActive);
      this.solarOutletService.updateCharacteristic(Characteristic.OutletInUse, isSolarActive);
    }

    if (this.houseLoadOutletService) {
      const isLoadActive = this.houseLoadWatts > 10;
      this.houseLoadOutletService.updateCharacteristic(Characteristic.On, true);
      this.houseLoadOutletService.updateCharacteristic(Characteristic.OutletInUse, isLoadActive);
    }

    if (this.gridExportOutletService) {
      const isExportActive = this.isGridExporting && this.gridWatts > 20;
      this.gridExportOutletService.updateCharacteristic(Characteristic.On, isExportActive);
      this.gridExportOutletService.updateCharacteristic(Characteristic.OutletInUse, isExportActive);
    }

    if (this.gridImportOutletService) {
      const isImportActive = this.isGridImporting && this.gridWatts > 20;
      this.gridImportOutletService.updateCharacteristic(Characteristic.On, isImportActive);
      this.gridImportOutletService.updateCharacteristic(Characteristic.OutletInUse, isImportActive);
    }

    if (this.batteryChargingOutletService) {
      const isChargeActive = this.isBatteryCharging && this.batteryEnergyFlowWatts > 20;
      this.batteryChargingOutletService.updateCharacteristic(Characteristic.On, isChargeActive);
      this.batteryChargingOutletService.updateCharacteristic(Characteristic.OutletInUse, isChargeActive);
    }

    if (this.batteryDischargingOutletService) {
      const isDischargeActive = this.isBatteryDischarging && this.batteryEnergyFlowWatts > 20;
      this.batteryDischargingOutletService.updateCharacteristic(Characteristic.On, isDischargeActive);
      this.batteryDischargingOutletService.updateCharacteristic(Characteristic.OutletInUse, isDischargeActive);
    }

    // Update Power Sensors (1 Lux = 1 W, clamp 0.0001 - 100,000)
    if (this.solarPowerService) {
      this.solarPowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.solarWatts)));
    }
    if (this.housePowerService) {
      this.housePowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.houseLoadWatts)));
    }
    if (this.gridExportPowerService) {
      this.gridExportPowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.gridExportWatts)));
    }
    if (this.gridImportPowerService) {
      this.gridImportPowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.gridImportWatts)));
    }
    if (this.batteryChargePowerService) {
      this.batteryChargePowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.batteryChargeWatts)));
    }
    if (this.batteryDischargePowerService) {
      this.batteryDischargePowerService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, Math.min(100000, Math.max(0.0001, this.batteryDischargeWatts)));
    }

    // Update Percentages (0-100%)
    if (this.selfConsumptionService) {
      this.selfConsumptionService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.selfConsumptionPercent);
    }
    if (this.selfSufficiencyService) {
      this.selfSufficiencyService.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.selfSufficiencyPercent);
    }

    // Update Contact Sensor (Surplus solare)
    if (this.gridExportContactService) {
      this.gridExportContactService.updateCharacteristic(
        Characteristic.ContactSensorState,
        (this.isGridExporting && this.gridWatts > 50)
          ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
          : Characteristic.ContactSensorState.CONTACT_DETECTED,
      );
    }

    this.platform.log.debug(
      `[EatonAccessory] Telemetry -> SoC: ${this.stateOfCharge}%, Solar: ${this.solarWatts}W, House: ${this.houseLoadWatts}W, Grid Exp: ${this.gridExportWatts}W, Grid Imp: ${this.gridImportWatts}W, Bat Charge: ${this.batteryChargeWatts}W, Bat Disch: ${this.batteryDischargeWatts}W, Autoconsumo: ${this.selfConsumptionPercent}%, Autosufficienza: ${this.selfSufficiencyPercent}%`,
    );
  }
}
