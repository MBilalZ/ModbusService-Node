const ModbusRTU = require('modbus-serial');
const sleep = require('./sleep.js');
const registerDetail = require('../helpers/registerDetails');
const fetchSystemConfigData = require('./fetchSystemConfigData');
const logging = require('./logging.js');

/**
 *
 * @param {*} client modbus client
 * @returns object
 *
 * This code retrieves the humidity value from a humidity sensor using ModbusRTU.
 * It checks if the humidity control is enabled and determines whether to use the same device manager as the thermostat or a different one based on the configuration.
 * The code reads the MODBUS_HUMIDITY registers and returns the humidity value divided by 10.
 */
const humidityDeviceManager = async (unitDetails) => {
  const { device_manager_name, humidity_monitoring } = unitDetails;

  if (humidity_monitoring.enabled) {
    if (humidity_monitoring.humidity_device_manager === device_manager_name) {
      logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Humidity device manager is the same as tstat device manager`);

      // await client.setID(humidity_monitoring.humidity_address);
      // await sleep(200);
      // // fetching address and length of MODBUS_HUMIDITY
      // const MODBUS_HUMIDITY = registerDetail.getHumidityDetailsByName('MODBUS_HUMIDITY');
      // try {
      //   // reading MODBUS_HUMIDITY
      //   let result = await client.readHoldingRegisters(MODBUS_HUMIDITY.Register_Address, MODBUS_HUMIDITY.Register_Length);
      //   return result.data[0] / 10;
      // } catch (err) {
      //   logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Error reading humidity value: ${err.message}`);
      //   return 0;
      // }
      let humidity_device_manager_id = humidity_monitoring.humidity_device_manager.match(/\/dev\/ttyUSB\d+/);
      const humidityClient = new ModbusRTU();
      const baudRate = await fetchSystemConfigData('baud_rate');
      humidityClient.connectRTUBuffered(humidity_device_manager_id[0], { baudRate: parseInt(baudRate.baud_rate) });
      humidityClient.setTimeout(500);
      await humidityClient.setID(humidity_monitoring.humidity_address);
      await sleep(200);
      let data;
      try {
        // reading MODBUS_HUMIDITY
        // fetching address and length of MODBUS_HUMIDITY
        const MODBUS_HUMIDITY = registerDetail.getHumidityDetailsByName('MODBUS_HUMIDITY');
        let result = await humidityClient.readHoldingRegisters(MODBUS_HUMIDITY.Register_Address, MODBUS_HUMIDITY.Register_Length);
        data = result.data[0] / 10;
      } catch (err) {
        logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Error: ${err.message}`);
        data = 0;
      }
      humidityClient.close();
      return data;
    } else {
      logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Humidity device manager is not the same as tstat device manager`);
      // logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Humidity sensor is not being attached with RS485. Returning humidity 0 for now`);
      // return 0;
      // New device manager name with regex

      let humidity_device_manager_id = humidity_monitoring.humidity_device_manager.match(/\/dev\/ttyUSB\d+/);
      const humidityClient = new ModbusRTU();
      const baudRate = await fetchSystemConfigData('baud_rate');
      humidityClient.connectRTUBuffered(humidity_device_manager_id[0], { baudRate: parseInt(baudRate.baud_rate) });
      humidityClient.setTimeout(500);
      await humidityClient.setID(humidity_monitoring.humidity_address);
      await sleep(200);
      let data;
      try {
        // reading MODBUS_HUMIDITY
        // fetching address and length of MODBUS_HUMIDITY
        const MODBUS_HUMIDITY = registerDetail.getHumidityDetailsByName('MODBUS_HUMIDITY');
        let result = await humidityClient.readHoldingRegisters(MODBUS_HUMIDITY.Register_Address, MODBUS_HUMIDITY.Register_Length);
        data = result.data[0] / 10;
      } catch (err) {
        logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Error: ${err.message}`);
        data = 0;
      }
      humidityClient.close();
      return data;
    }
  } else {
    logging.log(`[DMH] [Address ${humidity_monitoring.humidity_address}] - Humidity is not enabled`);
    return 0;
  }
};

module.exports = humidityDeviceManager;
