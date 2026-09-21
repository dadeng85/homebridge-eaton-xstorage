import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { EatonXStoragePlatform } from './platform';

/**
 * Register EatonXStorage platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, EatonXStoragePlatform);
};
