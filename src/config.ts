
// Sigfox Network Server Options
interface Sigfox {
  // the http server
  network_server: string;
  // API user
  user: string
  // API password
  password: string
}

// Device Provisioning Options
interface DeviceProvisioning {
  // Sigfox connection options
  sigfox: Sigfox;
}

// Main configuration structure
interface ConfigOptions {
  // Device Provisioning options
  device_provisioning: DeviceProvisioning;
}

export {ConfigOptions};
