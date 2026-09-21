"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EatonXStoragePlatform = void 0;
const settings_1 = require("./settings");
const eatonClient_1 = require("./eatonClient");
const platformAccessory_1 = require("./platformAccessory");

class EatonXStoragePlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.accessories = [];
        this.eatonClient = null;
        this.accessoryHandler = null;
        this.pollTimer = null;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.log.debug('[EatonXStoragePlatform] Initializing platform...');
        this.api.on('didFinishLaunching', () => {
            this.log.debug('[EatonXStoragePlatform] Executed didFinishLaunching callback');
            this.initDevice();
        });
    }

    configureAccessory(accessory) {
        this.log.info('[EatonXStoragePlatform] Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    async initDevice() {
        const host = this.config.ip || '192.168.1.73';
        const username = this.config.username;
        const password = this.config.password;

        if (!username || !password) {
            this.log.error(
                '[EatonXStoragePlatform] Inverter username or password is missing in plugin configuration! Please configure credentials in Homebridge Settings.',
            );
            return;
        }

        this.eatonClient = new eatonClient_1.EatonClient(host, username, password, this.log);
        let deviceInfo = {};

        try {
            this.log.info(`[EatonXStoragePlatform] Connecting to Eaton xStorage inverter at ${host}...`);
            await this.eatonClient.login();
            deviceInfo = await this.eatonClient.getDeviceInfo();
            this.log.info(
                `[EatonXStoragePlatform] Successfully connected to Eaton xStorage! Model: ${deviceInfo.model || 'xStorage'}, Serial: ${deviceInfo.serialNumber || deviceInfo.id || 'N/A'}`,
            );
        }
        catch (err) {
            this.log.warn(
                `[EatonXStoragePlatform] Initial connection failed (${err.message}). Will retry during periodic polling.`,
            );
        }

        const uuidSeed = deviceInfo.serialNumber || deviceInfo.id || host;
        const uuid = this.api.hap.uuid.generate(uuidSeed);
        const existingAccessory = this.accessories.find((acc) => acc.UUID === uuid);
        const accessoryName = this.config.name || 'Eaton xStorage';

        let accessory;
        if (existingAccessory) {
            this.log.info('[EatonXStoragePlatform] Restoring existing accessory from cache:', existingAccessory.displayName);
            accessory = existingAccessory;
        }
        else {
            this.log.info('[EatonXStoragePlatform] Adding new accessory:', accessoryName);
            accessory = new this.api.platformAccessory(accessoryName, uuid);
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        }

        this.accessoryHandler = new platformAccessory_1.EatonXStorageAccessory(this, accessory, deviceInfo);

        await this.pollStatus();

        const intervalSec = Math.max(3, Number(this.config.pollInterval) || 10);
        this.log.info(`[EatonXStoragePlatform] Starting polling timer every ${intervalSec} seconds.`);
        this.pollTimer = setInterval(() => {
            this.pollStatus();
        }, intervalSec * 1000);
    }

    async pollStatus() {
        if (!this.eatonClient || !this.accessoryHandler) {
            return;
        }
        try {
            const status = await this.eatonClient.getDeviceStatus();
            this.accessoryHandler.updateStatus(status);
        }
        catch (err) {
            this.log.warn(`[EatonXStoragePlatform] Error polling Eaton inverter status: ${err.message}`);
        }
    }
}
exports.EatonXStoragePlatform = EatonXStoragePlatform;
