import fs = require("fs");
import util = require("util");
import http = require("http");
import iotagent = require('dojot-iotagent');
import express = require('express');
import bodyParser = require('body-parser');
import { ConfigOptions } from "./config";
import { CacheHandler } from "./cache";

/**
 * Sigfox IoT Agent Class
 */
class Agent {
  // Main configuration structure.
  configuration: ConfigOptions;

  // IoTAgent lib
  iota: iotagent.IoTAgent;

  app: express.Application;

  cache: CacheHandler;

  constructor(config: ConfigOptions) {
    if (config.device_provisioning === undefined) {
      throw new Error('Missing Device provisioning configuration options');
    }

    if (config.device_provisioning.sigfox === undefined) {
      throw new Error('Missing Sigfox configuration options');
    }

    this.configuration = config;

    this.cache = new CacheHandler();

    this.app = express();
    this.app.use(bodyParser.json());

    this.iota = new iotagent.IoTAgent();
    this.iota.init();
  }

  get_sigfox_id(device_info: any) {
    for (let template_id of device_info.templates) {
      for (let attr of device_info.attrs[template_id]) {
        if (attr.label !== undefined && attr.label === 'device') {
          if (attr.static_value !== undefined) {
            return attr.static_value;
          }
        }
      }
    }
    return '';
}

  start() {

    this.iota.listTenants()
      .then((tenants: any) => {
        for (let t of tenants) {
          this.iota.listDevices(t, {}).then((devices_info: any) => {
            console.log('Got device list for [%s]', t, devices_info);
            for (let device_id of devices_info) {
              this.iota.getDevice(device_id, t).then((device_info: any) => {
                console.log(' --- Device info (%s)\n', device_id, device_info);
                console.log(util.inspect(device_info, { depth: null}));
                let sigfox_id = this.get_sigfox_id(device_info);
                if (sigfox_id !== '') {
                  this.cache.correlate_dojot_and_sigfox_device_id(device_id, sigfox_id);
                }
              })
            }
          })
        }
      })
    .catch((error: any) => {console.error(error)});

    this.iota.on('device.create', (event: any) => { this.on_create_device(event) });
    this.iota.on('device.update', (event: any) => { this.on_update_device(event) });
    this.iota.on('device.remove', (event: any) => { this.on_delete_device(event) });

    this.app.post('/sigfox', (req: any, res: any) => { this.handle_data(req, res) });

    this.app.listen(80, () => {console.log('--- Sigfox IoTAgent running (port 80) ---')});
  }

  handle_data(req: any, res: any) {
    console.log('will update', req.body);

    // get device from cache
    let dojot_device_id = this.cache.get_dojot_device_id(req.body.device);

    console.log("Retrieving dojot device id [%s] <-> [%s] from sigfox id", dojot_device_id, req.body.device);

    req.body.timestamp = new Date(req.body.timestamp*1000).toISOString();
    req.body.station_coordinates = req.body.station_lat.toString() + "," + req.body.station_lng.toString();

    this.iota.listTenants()
      .then((tenants: any) => {
        for (let t of tenants) {
          this.iota.updateAttrs(dojot_device_id, t, req.body, {});
        }
      })
    .catch((error: any) => {console.error(error)});

    return res.status(200).send();
  }

  on_create_device(event: any) {
    console.log('device [%s] created', event.data.id);

    let sigfox_id = this.get_sigfox_id(event.data);
    if (sigfox_id !== '') {
      this.cache.correlate_dojot_and_sigfox_device_id(event.data.id, sigfox_id);
    }
  }

  on_update_device(event: any) {
    console.log('device [%s] updated', event.data.id);

    let sigfox_id = this.get_sigfox_id(event.data);
    if (sigfox_id !== '') {
      this.cache.correlate_dojot_and_sigfox_device_id(event.data.id, sigfox_id);
    }
  }

  on_delete_device(event: any) {
    console.log('device [%s] removed', event.data.id);

    let sigfox_id = this.get_sigfox_id(event.data);
    if (sigfox_id !== '') {
      this.cache.remove_correlation_dojot_and_sigfox_id(event.data.id, sigfox_id);
    }
  }

}

export { Agent };

