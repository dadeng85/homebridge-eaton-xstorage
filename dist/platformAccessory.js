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

        // Primary Service: Battery
        this.batteryService = this.accessory.getService(Service.Battery)
            || this.accessory.addService(Service.Battery, `${this.platform.config.name || 'Eaton xStorage'} Battery`);

        this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
            .onGet(() => this.stateOfCharge);

        this.batteryService.getCharacteristic(Characteristic.ChargingState)
            .onGet(() => this.batteryChargingState);

        this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
            .onGet(() => this.isLowBattery);

        // Optional Lux Sensors for Apple Home (1 Lux = 1 Watt)
        if (this.platform.config.exposeLuxSensors !== false) {
            // Solar Production
            this.solarSensorService = this.accessory.getService('Solar Production')
                || this.accessory.addService(Service.LightSensor, 'Solar Production', 'solar-production-sub');

            this.solarSensorService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .onGet(() => Math.max(0.0001, this.solarWatts));

            this.addEveConsumptionCharacteristic(this.solarSensorService, () => this.solarWatts);

            // House Consumption
            this.houseLoadSensorService = this.accessory.getService('House Consumption')
                || this.accessory.addService(Service.LightSensor, 'House Consumption', 'house-consumption-sub');

            this.houseLoadSensorService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .onGet(() => Math.max(0.0001, this.houseLoadWatts));

            this.addEveConsumptionCharacteristic(this.houseLoadSensorService, () => this.houseLoadWatts);

            // Grid Power
            this.gridSensorService = this.accessory.getService('Grid Power')
                || this.accessory.addService(Service.LightSensor, 'Grid Power', 'grid-power-sub');

            this.gridSensorService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .onGet(() => Math.max(0.0001, this.gridWatts));

            this.addEveConsumptionCharacteristic(this.gridSensorService, () => this.gridWatts);

            // Battery Flow
            this.batteryFlowSensorService = this.accessory.getService('Battery Flow')
                || this.accessory.addService(Service.LightSensor, 'Battery Flow', 'battery-flow-sub');

            this.batteryFlowSensorService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
                .onGet(() => Math.max(0.0001, this.batteryEnergyFlowWatts));

            this.addEveConsumptionCharacteristic(this.batteryFlowSensorService, () => this.batteryEnergyFlowWatts);

            // Grid Export Contact Sensor (Open = Exporting, Closed = Not exporting)
            this.gridExportSensorService = this.accessory.getService('Grid Exporting')
                || this.accessory.addService(Service.ContactSensor, 'Grid Exporting', 'grid-export-sub');

            this.gridExportSensorService.getCharacteristic(Characteristic.ContactSensorState)
                .onGet(() => this.isGridExporting ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
        }
    }

    initEveCharacteristics() {
        const { Characteristic } = this.platform;
        const EVE_CONSUMPTION_UUID = 'E863F10D-079E-48FF-8F24-E2C60F744619';

        class CustomEveCurrentConsumption extends Characteristic {
            constructor() {
                super('Current Consumption', EVE_CONSUMPTION_UUID, {
                    format: Characteristic.Formats.FLOAT,
                    unit: 'W',
                    minValue: 0,
                    maxValue: 100000,
                    minStep: 0.1,
                    perms: [Characteristic.Perms.PAIRED_READ, Characteristic.Perms.NOTIFY],
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

        // Update Apple Home Lux Sensors
        if (this.solarSensorService) {
            const luxSolar = Math.max(0.0001, this.solarWatts);
            this.solarSensorService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, luxSolar);
            if (this.EveCurrentConsumption && this.solarSensorService.testCharacteristic(this.EveCurrentConsumption)) {
                this.solarSensorService.updateCharacteristic(this.EveCurrentConsumption, this.solarWatts);
            }
        }

        if (this.houseLoadSensorService) {
            const luxLoad = Math.max(0.0001, this.houseLoadWatts);
            this.houseLoadSensorService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, luxLoad);
            if (this.EveCurrentConsumption && this.houseLoadSensorService.testCharacteristic(this.EveCurrentConsumption)) {
                this.houseLoadSensorService.updateCharacteristic(this.EveCurrentConsumption, this.houseLoadWatts);
            }
        }

        if (this.gridSensorService) {
            const luxGrid = Math.max(0.0001, this.gridWatts);
            this.gridSensorService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, luxGrid);
            if (this.EveCurrentConsumption && this.gridSensorService.testCharacteristic(this.EveCurrentConsumption)) {
                this.gridSensorService.updateCharacteristic(this.EveCurrentConsumption, this.gridWatts);
            }
        }

        if (this.batteryFlowSensorService) {
            const luxBattery = Math.max(0.0001, this.batteryEnergyFlowWatts);
            this.batteryFlowSensorService.updateCharacteristic(Characteristic.CurrentAmbientLightLevel, luxBattery);
            if (this.EveCurrentConsumption && this.batteryFlowSensorService.testCharacteristic(this.EveCurrentConsumption)) {
                this.batteryFlowSensorService.updateCharacteristic(this.EveCurrentConsumption, this.batteryEnergyFlowWatts);
            }
        }

        if (this.gridExportSensorService) {
            this.gridExportSensorService.updateCharacteristic(
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
