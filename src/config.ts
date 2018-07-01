
// Sigfox Network Server Options
interface Sigfox {
  // the http server
  network_server: string;
}

// Main configuration structure
interface ConfigOptions {
  // Device Provisioning options
  sigfox: Sigfox;
}

export { ConfigOptions };
