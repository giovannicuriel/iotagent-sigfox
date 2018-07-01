import util = require("util");
import iotagent = require('dojot-iotagent');
import express = require('express');
import bodyParser = require('body-parser');
import axios, { AxiosResponse, AxiosError } from "axios";
import * as Sigfox from "./SigfoxRequests";
import { ConfigOptions } from "./config";
import { CacheHandler } from "./cache";
import { DojotDeviceTemplate } from './DojotDeviceTemplate';

/**
 * Sigfox IoT Agent Class
 */
class Agent {
  // Main configuration structure.
  configuration: ConfigOptions;

  // IoTAgent lib
  iota: iotagent.IoTAgent;

  // Express application
  app: express.Application;

  // Simpe cache
  cache: CacheHandler;

  constructor(config: ConfigOptions) {
    if (config.sigfox === undefined) {
      throw new Error('Missing Sigfox configuration options');
    }
    this.configuration = config;
    this.cache = new CacheHandler();
    this.app = express();
    this.app.use(bodyParser.json());
    this.iota = new iotagent.IoTAgent();
    this.iota.init();
  }

  /**
   * Find which template is related to Sigfox data.
   *
   * @param device_info The device info received via Kafka
   * @returns [sigfox ID, Template info] The sigfox device ID and all sigfox
   * template parameter. If not found, return null.
   */
  findSigfoxData(device_info: any): [string, any] | null {
    let sigfox_attrs: any;
    let sigfox_id: string = "";
    for (let template_id of device_info.templates) {
      if (!device_info.attrs.hasOwnProperty(template_id)) {
        continue;
      }
      for (let attr of device_info.attrs[template_id]) {
        if (attr.label !== undefined && attr.label === "device") {
          if (attr.static_value !== undefined) {
            sigfox_attrs = device_info.attrs[template_id];
            sigfox_id = attr.static_value
            break;
          }
        }
      }
      if (sigfox_attrs !== undefined) {
        break;
      }
    }

    if (sigfox_attrs !== undefined) {
      return [sigfox_id, sigfox_attrs];
    }
    return null;
  }

  loadDojotDeviceTemplate(sigfoxTemplate: any): DojotDeviceTemplate | null {
    let deviceTemplate = new DojotDeviceTemplate();
    let temp: any = {};

    // Transform it to a simple key-value JSON
    for (let attr of sigfoxTemplate) {
      if (attr.label !== undefined) {
        temp[attr.label] = attr.static_value;
      }
    }

    // Check that all mandatory parameters were sent.
    if (deviceTemplate.assertAndCopyFrom(temp) === 0) {
      return deviceTemplate;
    } else {
      return null;
    }
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
                console.log(util.inspect(device_info, { depth: null }));
                let SigfoxData = this.findSigfoxData(device_info);
                if (SigfoxData !== null) {
                  let [Sigfox_id] = SigfoxData;
                  if (Sigfox_id !== '') {
                    this.cache.correlate_dojot_and_sigfox_device_id(device_id, Sigfox_id);
                  }
                }
              })
            }
          })
        }
      })
      .catch((error: any) => { console.error(error) });

    this.iota.on('device.create', (event: any) => { this.on_create_device(event) });
    this.iota.on('device.update', (event: any) => { this.on_update_device(event) });
    this.iota.on('device.remove', (event: any) => { this.on_delete_device(event) });

    this.app.post('/Sigfox', (req: any, res: any) => { this.handle_data(req, res) });

    this.app.listen(18000, () => { console.log('--- Sigfox IoTAgent running (port 80) ---') });
  }

  handle_data(req: any, res: any) {
    console.log('will update', req.body);

    // get device from cache
    let dojot_device_id = this.cache.get_dojot_device_id(req.body.device);

    console.log("Retrieving dojot device id [%s] <-> [%s] from Sigfox id", dojot_device_id, req.body.device);

    req.body.timestamp = new Date(req.body.timestamp * 1000).toISOString();
    req.body.station_coordinates = req.body.station_lat.toString() + "," + req.body.station_lng.toString();

    this.iota.listTenants()
      .then((tenants: any) => {
        for (let t of tenants) {
          this.iota.updateAttrs(dojot_device_id, t, req.body, {});
        }
      })
      .catch((error: any) => { console.error(error) });

    return res.status(200).send();
  }


  sendSigfoxRequest(url: string, body: any) {
    console.log("Sending Sigfox request...");
    console.log(`Sending to ${url}`);
    axios.post(url, body).then((response: AxiosResponse) => {
      console.log("... request successfully processed.");
      console.log(`Received result is: ${response.data}`);
    }).catch((error: AxiosError) => {
      console.log("... request was not successfully processed.");
      console.log(`Error is ${error}.`);
    });
    console.log("... Sigfox request was sent.");
  }

  processDeviceRegistration(deviceTypeId: string, SigfoxDeviceData: Sigfox.IDeviceRegistration) {
    console.log("Registering device...");
    let url = `${this.configuration.sigfox.network_server}/api/devicetypes/${deviceTypeId}/devices/bulk/create/async`;
    this.sendSigfoxRequest(url, SigfoxDeviceData);
    console.log("... device registration was requested.");
  }


  processDeviceEdition(deviceEditionReq: Sigfox.IDeviceEdition) {
    console.log("Editing device...");
    let url = `${this.configuration.sigfox.network_server}/api/devices/bulk/edit`
    this.sendSigfoxRequest(url, deviceEditionReq);
    console.log("... device registration was requested.");
  }


  on_create_device(event: any) {
    console.log('device [%s] created', event.data.id);

    let sigfoxData = this.findSigfoxData(event.data);
    if (sigfoxData === null) {
      console.log("Could not find Sigfox parameters for new device. Bailing out.");
      return;
    }
    let [sigfoxId, sigfoxTemplate] = sigfoxData;

    if (sigfoxId !== '') {
      this.cache.correlate_dojot_and_sigfox_device_id(event.data.id, sigfoxId);
    }

    console.log("Registering device in Sigfox backend...");
    console.log("Building Sigfox request from device data...");
    let dojotTemplateData = this.loadDojotDeviceTemplate(sigfoxTemplate);
    if (dojotTemplateData === null) {
      return;
    }
    let sigfoxRequestData = dojotTemplateData.extractDeviceRegistration();
    let sigfoxTypeId = dojotTemplateData.device_type_id;

    console.log("... Sigfox request was built.");
    console.log("Registering new device in Sigfox backend...");
    this.processDeviceRegistration(sigfoxTypeId, sigfoxRequestData);
    console.log("... device registration request was sent.");
  }

  on_update_device(event: any) {
    console.log('device [%s] updated', event.data.id);

    let sigfoxData = this.findSigfoxData(event.data);
    if (sigfoxData === null) {
      console.log("Could not find Sigfox parameters for device edition. Bailing out.");
      return;
    }

    let [sigfoxId, sigfoxTemplate] = sigfoxData;
    if (sigfoxId !== '') {
      this.cache.correlate_dojot_and_sigfox_device_id(event.data.id, sigfoxId);
    }
    console.log("Editing device in Sigfox backend...");
    console.log("Building Sigfox request from device data...");
    let dojotTemplateData = this.loadDojotDeviceTemplate(sigfoxTemplate);
    if (dojotTemplateData === null) {
      return;
    }
    let sigfoxRequestData = dojotTemplateData.extractDeviceEdition();

    console.log("... Sigfox request was built.");
    console.log("Editing device in Sigfox backend...");
    this.processDeviceEdition(sigfoxRequestData);
    console.log("... device edition request was sent.");
  }

  on_delete_device(event: any) {
    console.log('device [%s] removed', event.data.id);

    let sigfoxData = this.findSigfoxData(event.data);
    if (sigfoxData === null) {
      console.log("Could not find Sigfox parameters for device removal. Bailing out.");
      return;
    }
    let [sigfoxId] = sigfoxData;
    if (sigfoxId !== '') {
      this.cache.remove_correlation_dojot_and_sigfox_id(event.data.id, sigfoxId);
    }
  }

}

export { Agent };

