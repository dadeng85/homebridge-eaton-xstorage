"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EatonClient = void 0;
const https_1 = __importDefault(require("https"));
const axios_1 = __importDefault(require("axios"));

class EatonClient {
    constructor(host, username, password, log) {
        this.host = host;
        this.username = username;
        this.password = password;
        this.log = log;
        this.token = null;
        const cleanHost = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        this.baseUrl = `https://${cleanHost}/api`;
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 8000,
            httpsAgent: new https_1.default.Agent({
                rejectUnauthorized: false,
            }),
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
    }

    async login() {
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
        }
        catch (error) {
            const errMsg = error.response?.data?.error?.description || error.message;
            this.log.error(`[EatonClient] Login failed for ${this.username}: ${errMsg}`);
            throw error;
        }
    }

    async ensureToken() {
        if (!this.token) {
            return await this.login();
        }
        return this.token;
    }

    async getDeviceInfo() {
        const token = await this.ensureToken();
        try {
            const response = await this.client.get('/device/', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data?.result || {};
        }
        catch (error) {
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

    async getDeviceStatus() {
        const token = await this.ensureToken();
        try {
            const response = await this.client.get('/device/status', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return response.data?.result || {};
        }
        catch (error) {
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
exports.EatonClient = EatonClient;
