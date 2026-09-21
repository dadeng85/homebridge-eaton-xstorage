"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EatonXStorageAccessory = void 0;

class EatonXStorageAccessory {
    constructor(platform, accessory, deviceInfo) {
        this.platform = platform;
        this.accessory = accessory;
        this.deviceInfo = deviceInfo;
        this.stateOfCharge = 100;
        this.batteryChargingState = 0;
        this.isLowBattery = 0;
        this.solarWatts = 0;
        this.houseLoadWatts = 0;
        this.gridWatts = 0;
        this.isGridExporting = false;
        this.batteryEnergyFlowWatts = 0;
        this.EveCurrentConsumption = null;

        const { Service, Characteristic } = this.platform;

        const manufacturer = this.deviceInfo.inverterManufacturer || 'Eaton';
        const model = this.deviceInfo.inverterModelName || this.deviceInfo.model || 'xStorage Home';
        const serial = this.deviceInfo.inverterSerialNumber || this.deviceInfo.serialNumber || this.deviceInfo.id || 'EATON-XSTORAGE';
        const firmware = this.deviceInfo.inverterFirmwareVersion || this.deviceInfo.firmwareVersion || '1.0.0';

        this.accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, manufacturer)
            .setCharacteristic(Characteristic.Model, model)
            .setCharacteristic(Characteristic.SerialNumber, serial)
            .setCharacteristic(Characteristic.FirmwareRevision, firmware);

        if (this.platform.config.exposeEveSensors !== false) {
            this.initEveCharacteristics();
        }

        // 1. Primary Service: Battery (Native Apple Home)
        this.batteryService = this.accessory.getService(Service.Battery)
            || this.accessory.addService(Service.Battery, `${this.platform.config.name || 'Eaton xStorage'} Battery`);

        this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
            .onGet(() => this.stateOfCharge);

        this.batteryService.getCharacteristic(Characteristic.ChargingState)
            .onGet(() => this.batteryChargingState);

        this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
            .onGet(() => this.isLowBattery);

        // 2. Prese Intelligenti (Outlets)
        const enableOutlets = this.platform.config.exposeOutlets !== false;
        if (enableOutlets) {
            // Produzione Solare
            this.solarOutletService = this.accessory.getService('Produzione Solare')
                || this.accessory.addService(Service.Outlet, 'Produzione Solare', 'solar-outlet-sub');

            this.solarOutletService.getCharacteristic(Characteristic.On)
                .onGet(() => this.solarWatts > 20)
                .onSet(() => {
                    setTimeout(() => {
                        this.solarOutletService?.updateCharacteristic(Characteristic.On, this.solarWatts > 20);
                    }, 100);
                });

            this.solarOutletService.getCharacteristic(Characteristic.OutletInUse)
                .onGet(() => this.solarWatts > 20);

            this.addEveConsumptionCharacteristic(this.solarOutletService, () => this.solarWatts);

            // Consumi Casa
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

            // Immissione in Rete
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

            // Carica Batteria
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
            this.removeServiceByName('Produzione Solare', Service.Outlet);
            this.removeServiceByName('Consumi Casa', Service.Outlet);
            this.removeServiceByName('Immissione in Rete', Service.Outlet);
            this.removeServiceByName('Carica Batteria', Service.Outlet);
        }

        // 3. Optional Lux LightSensors (Default: disabled)
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
            // Remove old Lux services so Apple Home is clean
            this.removeServiceByName('Solar Production', Service.LightSensor);
            this.removeServiceByName('House Consumption', Service.LightSensor);
            this.removeServiceByName('Grid Power', Service.LightSensor);
            this.removeServiceByName('Battery Flow', Service.LightSensor);
            this.removeServiceByName('Solar Lux', Service.LightSensor);
            this.removeServiceByName('House Lux', Service.LightSensor);
            this.removeServiceByName('Grid Lux', Service.LightSensor);
            this.removeServiceByName('Battery Lux', Service.LightSensor);
        }

        // 4. Contact Sensor
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

    removeServiceByName(name, serviceType) {
        const s = this.accessory.getService(name);
        if (s && s.UUID === serviceType.UUID) {
            this.platform.log.info(`[EatonAccessory] Removing obsolete service: ${name}`);
            this.accessory.removeService(s);
        }
    }

    initEveCharacteristics() {
        const { Characteristic } = this.platform;
        const EVE_CONSUMPTION_UUID = 'E863F10D-079E-48FF-8F24-E2C60F744619';

        class CustomEveCurrentConsumption extends Characteristic {
            constructor() {
                super('Current Consumption', EVE_CONSUMPTION_UUID, {
                    format: 'float',
                    unit: 'W',
                    minValue: 0,
                    maxValue: 100000,
                    minStep: 0.1,
                    perms: ['pr', 'ev'],
                });
                this.value = 0;
            }
        }
        CustomEveCurrentConsumption.UUID = EVE_CONSUMPTION_UUID;
        this.EveCurrentConsumption = CustomEveCurrentConsumption;
    }

    addEveConsumptionCharacteristic(service, getter) {
        if (!this.EveCurrentConsumption) {
            return;
        }
        const char = service.getCharacteristic(this.EveCurrentConsumption)
            || service.addCharacteristic(this.EveCurrentConsumption);
        char.onGet(() => getter());
    }

    updateStatus(status) {
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
exports.EatonXStorageAccessory = EatonXStorageAccessory;
