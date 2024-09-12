const ModbusRTU = require('modbus-serial');
const moment = require('moment');
const config = require('../utils/config.js');
const request = require('../utils/request');
const serialport = require('serialport');
const logging = require('./logging.js');
const registerDetail = require('../helpers/registerDetails');
const sleep = require('./sleep.js');
const { LocalStorage } = require('node-localstorage');
const ioClient = require('socket.io-client');
const socket = ioClient.connect('http://localhost:5050');
const switchIcons = require('./switchIcons.js');
const fs = require('fs');
const humidityDeviceManager = require('./deviceManagerHumidity.js');
const fetchSystemConfigData = require('./fetchSystemConfigData.js');
const { checkUnitType } = require('../helpers/relayTable.js');
const setupRegs = require('./initRegisters.js');

var localStorage = new LocalStorage('localStore');
let allUnitsData = {};

/**
 *
 * @returns all units data with details
 *
 * This code fetches the latest details of all units using an HTTP GET request.
 * It returns the received data if successful, otherwise logs an error message.
 */
const allUnitsDetails = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.units_readings_latest);
    return get_resp.data.data;
  } catch (err) {
    logging.log(`[DM] - Error: ${err.message}`);
  }
};

/**
 * @dev This function is used to read data from device manager
 *
 * This code reads unit details and performs checks and operations for each unit.
 * It includes updating modes, fans, calibrations, and time.
 * It checks for a lock file, reads device manager information, performs data reading and writing operations, and updates humidity.
 * Finally, it removes the lock file.
 */
const readUnitsData = async () => {
  const unitDetails = await allUnitsDetails();

  if (unitDetails !== undefined) {
    for (const unit of unitDetails) {
      await checkIfModeUpdated();
      await checkIfFanUpdated();
      await checkIfCalibrationUpdated();
      await checkIfHumidityCalibrationUpdated();
      await checkFan();
      await checkIfTimeUpdated();
      await checkIfFixRegisterUpdated();
      await unexpectedConditions(unit);

      // check if a file named '/tmp/devices.lock' exists in utils folder
      if (fs.existsSync('/tmp/devices.lock')) {
        logging.log('[DM] - Device manager is locked - readUnitsData');
        // wait while the file is removed
        while (fs.existsSync('/tmp/devices.lock')) {
          await sleep(100);
        }
      }

      // create a file named '/tmp/devices.lock' in utils folder
      await fs.writeFileSync('/tmp/devices.lock', 'locked');

      // New device manager name with regex
      let device_manager_id = unit.device_manager_name.match(/\/dev\/ttyUSB\d+/);

      if (device_manager_id !== null) {
        device_manager_id = device_manager_id[0];

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (isPortAvailable) {
          // creating object for each unit
          if (allUnitsData[unit.unit_number] === undefined) {
            allUnitsData[unit.unit_number] = {};
          }

          allUnitsData[unit.unit_number].device_manager_id = device_manager_id;

          const client = new ModbusRTU();
          const baudRate = await fetchSystemConfigData('baud_rate');
          logging.log(`[DM] [UNIT ${unit.unit_number}] - Connecting to ${device_manager_id}`);
          client.connectRTUBuffered(device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
          client.setTimeout(500);
          await client.setID(unit.unit_number);
          await sleep(200);

          try {
            let result;

            // fetching address and length of MODBUS_DEGC_OR_F
            const MODBUS_DEGC_OR_F = registerDetail.getDetailsByName('MODBUS_DEGC_OR_F');
            // fetching address and length of MODBUS_TEMPRATURE_CHIP
            const MODBUS_TEMPRATURE_CHIP = registerDetail.getDetailsByName('MODBUS_TEMPRATURE_CHIP');
            // fetching address and length of MODBUS_DAY_SETPOINT
            const MODBUS_DAY_SETPOINT = registerDetail.getDetailsByName('MODBUS_DAY_SETPOINT');
            // fetching address and length of MODBUS_ANALOG_INPUT2
            const MODBUS_ANALOG_INPUT2 = registerDetail.getDetailsByName('MODBUS_ANALOG_INPUT2');
            // fetching address and length of MODBUS_ANALOG_INPUT3
            const MODBUS_ANALOG_INPUT3 = registerDetail.getDetailsByName('MODBUS_ANALOG_INPUT3');
            // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
            const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');
            // fetching address and length of MODBUS_COOL_HEAT_MODE
            const MODBUS_COOL_HEAT_MODE = registerDetail.getDetailsByName('MODBUS_COOL_HEAT_MODE');
            // fetching address and length of MODBUS_TEMP_SELECT
            const MODBUS_TEMP_SELECT = registerDetail.getDetailsByName('MODBUS_TEMP_SELECT');
            // fetching address and length of MODBUS_OUTPUT_MANU_ENABLE
            const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
            // fetching address and length of MODBUS_MAX_SETPOINT
            const MODBUS_MAX_SETPOINT = registerDetail.getDetailsByName('MODBUS_MAX_SETPOINT');
            // fetching address and length of MODBUS_MIN_SETPOINT
            const MODBUS_MIN_SETPOINT = registerDetail.getDetailsByName('MODBUS_MIN_SETPOINT');
            // fetching address and length of MODBUS_ICON_MANUAL_VALUE
            const MODBUS_ICON_MANUAL_VALUE = registerDetail.getDetailsByName('MODBUS_ICON_MANUAL_VALUE');

            // fetching address and length of all get settings register except relay, temperature chip, temp select, analog input 2, output menu enable register
            const MODBUS_ADDRESS = registerDetail.getDetailsByName('MODBUS_ADDRESS');
            const MODBUS_PRODUCT_MODEL = registerDetail.getDetailsByName('MODBUS_PRODUCT_MODEL');
            const MODBUS_HARDWARE_REV = registerDetail.getDetailsByName('MODBUS_HARDWARE_REV');
            const MODBUS_PIC_VERSION = registerDetail.getDetailsByName('MODBUS_PIC_VERSION');
            const MODBUS_INTERNAL_THERMISTOR = registerDetail.getDetailsByName('MODBUS_INTERNAL_THERMISTOR');
            const MODBUS_ANALOG_INPUT1 = registerDetail.getDetailsByName('MODBUS_ADDRESS');
            const MODBUS_DAY_HEATING_SETPOINT = registerDetail.getDetailsByName('MODBUS_DAY_HEATING_SETPOINT');
            const MODBUS_DAY_COOLING_SETPOINT = registerDetail.getDetailsByName('MODBUS_DAY_COOLING_SETPOINT');
            const MODBUS_NIGHT_HEATING_SETPOINT = registerDetail.getDetailsByName('MODBUS_NIGHT_HEATING_SETPOINT');
            const MODBUS_NIGHT_COOLING_SETPOINT = registerDetail.getDetailsByName('MODBUS_NIGHT_COOLING_SETPOINT');
            const MODBUS_DAY_HEATING_DEADBAND = registerDetail.getDetailsByName('MODBUS_DAY_HEATING_DEADBAND');
            const MODBUS_DAY_COOLING_DEADBAND = registerDetail.getDetailsByName('MODBUS_DAY_COOLING_DEADBAND');
            const MODBUS_NIGHT_HEATING_DEADBAND = registerDetail.getDetailsByName('MODBUS_NIGHT_HEATING_DEADBAND');
            const MODBUS_NIGHT_COOLING_DEADBAND = registerDetail.getDetailsByName('MODBUS_NIGHT_COOLING_DEADBAND');

            // reading MODBUS_TEMP_SELECT
            result = await client.readHoldingRegisters(MODBUS_TEMP_SELECT.Register_Address, MODBUS_TEMP_SELECT.Register_Length);
            allUnitsData[unit.unit_number].sensor_type = result.data[0];

            // logging.log("[DM] - Reading data for unit " + unit.unit_number);
            // logging.log("[DM] - Sensor type for unit " + unit.unit_number + " is " + allUnitsData[unit.unit_number].sensor_type);

            if (unit.power_information?.heating_power_information?.use_remote_sensor === true) {
              if (allUnitsData[unit.unit_number].sensor_type !== 1) {
                // setting MODBUS_TEMP_SELECT
                await client.writeRegister(MODBUS_TEMP_SELECT.Register_Address, [1]);

                logging.log(`[DM] - Setting unit ${unit.unit_number} to use remote sensor`);

                allUnitsData[unit.unit_number].sensor_type = 1;
              }
            } else {
              if (allUnitsData[unit.unit_number].sensor_type !== 2) {
                // setting MODBUS_TEMP_SELECT
                await client.writeRegister(MODBUS_TEMP_SELECT.Register_Address, [2]);

                logging.log(`[DM] - Setting unit ${unit.unit_number} to use internal thermistor`);

                allUnitsData[unit.unit_number].sensor_type = 0;
              }
            }

            // reading MODBUS_DEGC_OR_F
            result = await client.readHoldingRegisters(MODBUS_DEGC_OR_F.Register_Address, MODBUS_DEGC_OR_F.Register_Length);
            allUnitsData[unit.unit_number].deg_or_cel = result.data[0];

            // getting the setpoints from the database
            const allow_keypad_temp_adjust_db = unit.allow_keypad_temp_adjust;

            if (allow_keypad_temp_adjust_db.enabled) {
              let min_setpoint = allow_keypad_temp_adjust_db.min;
              let max_setpoint = allow_keypad_temp_adjust_db.max;

              //convert setpoints to degC if unit is in degC
              if (allUnitsData[unit.unit_number].deg_or_cel === 0) {
                min_setpoint = parseInt(((min_setpoint - 32) * (5 / 9)).toFixed(0));
                max_setpoint = parseInt(((max_setpoint - 32) * (5 / 9)).toFixed(0));
              }

              if (min_setpoint !== null && !isNaN(min_setpoint) && min_setpoint !== allUnitsData[unit.unit_number].min_setpoint) {
                allUnitsData[unit.unit_number].min_setpoint = min_setpoint;
                await client.writeRegister(MODBUS_MIN_SETPOINT.Register_Address, [min_setpoint]);
                logging.log(`[DM] [UNIT ${unit.unit_number}] - Setting min setpoint to ${min_setpoint}`);
              }

              if (max_setpoint !== null && !isNaN(max_setpoint) && max_setpoint !== allUnitsData[unit.unit_number].max_setpoint) {
                allUnitsData[unit.unit_number].max_setpoint = max_setpoint;
                await client.writeRegister(MODBUS_MAX_SETPOINT.Register_Address, [max_setpoint]);
                logging.log(`[DM] [UNIT ${unit.unit_number}] - Setting max setpoint to ${max_setpoint}`);
              }
            }

            // reading MODBUS_ANALOG_INPUT1
            result = await client.readHoldingRegisters(MODBUS_TEMPRATURE_CHIP.Register_Address, MODBUS_TEMPRATURE_CHIP.Register_Length);
            if (allUnitsData[unit.unit_number].deg_or_cel === 0) {
              // converting to fahrenheit
              let curr_temp_tmp = (result.data[0] / 10) * 1.8 + 32;
              curr_temp_tmp = parseFloat(curr_temp_tmp.toFixed(2));
              allUnitsData[unit.unit_number].current_temp = curr_temp_tmp;
            } else {
              allUnitsData[unit.unit_number].current_temp = result.data[0] / 10;
            }

            // reading MODBUS_DAY_SETPOINT
            result = await client.readHoldingRegisters(MODBUS_DAY_SETPOINT.Register_Address, MODBUS_DAY_SETPOINT.Register_Length);
            if (allUnitsData[unit.unit_number].deg_or_cel === 0) {
              // converting to fahrenheit
              let set_temp_tmp = (result.data[0] / 10) * 1.8 + 32;
              set_temp_tmp = parseFloat(set_temp_tmp.toFixed(2));
              allUnitsData[unit.unit_number].set_temp = set_temp_tmp;
            } else {
              allUnitsData[unit.unit_number].set_temp = result.data[0] / 10;
            }

            // reading MODBUS_ANALOG_INPUT2
            result = await client.readHoldingRegisters(MODBUS_ANALOG_INPUT2.Register_Address, MODBUS_ANALOG_INPUT2.Register_Length);
            if (allUnitsData[unit.unit_number].deg_or_cel === 0) {
              // converting to fahrenheit
              let supply_temp_tmp = (result.data[0] / 10) * 1.8 + 32;
              supply_temp_tmp = parseFloat(supply_temp_tmp.toFixed(2));
              allUnitsData[unit.unit_number].supply_temp = supply_temp_tmp;
            } else {
              allUnitsData[unit.unit_number].supply_temp = result.data[0] / 10;
            }

            // reading MODBUS_ANALOG_INPUT3
            // result = await client.readHoldingRegisters(MODBUS_ANALOG_INPUT3.Register_Address, MODBUS_ANALOG_INPUT3.Register_Length);
            // allUnitsData[unit.unit_number].humidity = result.data[0] / 10;

            // reading MODBUS_DIGITAL_OUTPUT_STATUS
            result = await client.readHoldingRegisters(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, MODBUS_DIGITAL_OUTPUT_STATUS.Register_Length);
            allUnitsData[unit.unit_number].relay_status = result.data[0];

            // checking if the icons need to be updated
            const icon = switchIcons(result.data[0], unit.set_temp_type);

            if (allUnitsData[unit.unit_number].icon !== icon) {
              await client.writeRegister(MODBUS_ICON_MANUAL_VALUE.Register_Address, [icon]);
            }

            // reading MODBUS_COOL_HEAT_MODE
            result = await client.readHoldingRegisters(MODBUS_COOL_HEAT_MODE.Register_Address, MODBUS_COOL_HEAT_MODE.Register_Length);
            allUnitsData[unit.unit_number].cool_heat_mode = result.data[0];

            // Setting unit type for relays
            const unitType = unit.unit_type;
            const heatPumpRelay = unit.heat_pump_relay;
            if (unitType === 'heat_pump' && heatPumpRelay === 'o_type') {
              allUnitsData[unit.unit_number].unit_type = 0;
            } else if (unitType === 'heat_pump' && heatPumpRelay === 'b_type') {
              allUnitsData[unit.unit_number].unit_type = 1;
            } else {
              allUnitsData[unit.unit_number].unit_type = 2;
            }

            // parsing unit mode from string to number
            let mode_num = 0;
            if (unit.heat_cool?.mode === 'cool') {
              mode_num = 1;
            } else if (unit.heat_cool?.mode === 'heat') {
              mode_num = 2;
            } else if (unit.heat_cool?.mode === 'off') {
              mode_num = 3;
            } else if (unit.heat_cool?.mode === 'vent') {
              mode_num = 4;
            } else {
              mode_num = 0;
            }

            if (mode_num === 3) {
              if (allUnitsData[unit.unit_number].relay_status !== 0) {
                // setting unit mode
                await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);
                // set MODBUS_DIGITAL_OUTPUT_STATUS to 0
                await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
              }
            }

            allUnitsData[unit.unit_number].mode_num = mode_num;

            // setting times
            allUnitsData[unit.unit_number].cool_occ_time = unit.temperature_settings?.cool?.precool_occ_time;
            allUnitsData[unit.unit_number].cool_peak_time = unit.temperature_settings?.cool?.precool_peak_time;
            allUnitsData[unit.unit_number].warm_occ_time = unit.temperature_settings?.warm?.preheat_time;

            allUnitsData[unit.unit_number].temperature_data = JSON.stringify(unit.temperature_settings);

            // checking device manager humidity
            // allUnitsData[unit.unit_number].humidity = await humidityDeviceManager(client, unit);
            // allUnitsData[unit.unit_number].humidity = 0.0;

            // read all register for get settings feature on admin debug
            result = await client.readHoldingRegisters(MODBUS_ADDRESS.Register_Address, MODBUS_ADDRESS.Register_Length);
            allUnitsData[unit.unit_number].modbus_address = result.data[0];

            result = await client.readHoldingRegisters(MODBUS_PRODUCT_MODEL.Register_Address, MODBUS_PRODUCT_MODEL.Register_Length);
            allUnitsData[unit.unit_number].product_model = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_HARDWARE_REV.Register_Address, MODBUS_HARDWARE_REV.Register_Length);
            allUnitsData[unit.unit_number].hardware_rev = result.data[0];

            result = await client.readHoldingRegisters(MODBUS_PIC_VERSION.Register_Address, MODBUS_PIC_VERSION.Register_Length);
            allUnitsData[unit.unit_number].pic_version = result.data[0];

            result = await client.readHoldingRegisters(MODBUS_INTERNAL_THERMISTOR.Register_Address, MODBUS_INTERNAL_THERMISTOR.Register_Length);
            allUnitsData[unit.unit_number].internal_thermistor = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_ANALOG_INPUT1.Register_Address, MODBUS_ANALOG_INPUT1.Register_Length);
            allUnitsData[unit.unit_number].analog_input1 = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_DAY_HEATING_SETPOINT.Register_Address, MODBUS_DAY_HEATING_SETPOINT.Register_Length);
            allUnitsData[unit.unit_number].day_heat_setpoint = result.data[0] / 10;

            getSettingsResult = await client.readHoldingRegisters(MODBUS_DAY_COOLING_SETPOINT.Register_Address, MODBUS_DAY_COOLING_SETPOINT.Register_Length);
            allUnitsData[unit.unit_number].day_cool_setpoint = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_NIGHT_HEATING_SETPOINT.Register_Address, MODBUS_NIGHT_HEATING_SETPOINT.Register_Length);
            allUnitsData[unit.unit_number].night_heat_setpoint = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_NIGHT_COOLING_SETPOINT.Register_Address, MODBUS_NIGHT_COOLING_SETPOINT.Register_Length);
            allUnitsData[unit.unit_number].night_cool_setpoint = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_DAY_HEATING_DEADBAND.Register_Address, MODBUS_DAY_HEATING_DEADBAND.Register_Length);
            allUnitsData[unit.unit_number].day_heat_deadband = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_DAY_COOLING_DEADBAND.Register_Address, MODBUS_DAY_COOLING_DEADBAND.Register_Length);
            allUnitsData[unit.unit_number].day_cool_deadband = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_NIGHT_HEATING_DEADBAND.Register_Address, MODBUS_NIGHT_HEATING_DEADBAND.Register_Length);
            allUnitsData[unit.unit_number].night_heat_deadband = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_NIGHT_COOLING_DEADBAND.Register_Address, MODBUS_NIGHT_COOLING_DEADBAND.Register_Length);
            allUnitsData[unit.unit_number].night_cool_deadband = result.data[0] / 10;

            result = await client.readHoldingRegisters(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, MODBUS_OUTPUT_MANU_ENABLE.Register_Length);
            allUnitsData[unit.unit_number].control_relay = result.data[0];
          } catch (err) {
            // console.log(err);
            allUnitsData[unit.unit_number] = {};
            logging.log(`[DM] [UNIT ${unit.unit_number}] - Error: ${err.message}`);
          }

          // logging.log(allUnitsData);
          client.close();
          // checking device manager humidity
          allUnitsData[unit.unit_number].humidity = await humidityDeviceManager(unit);
          // allUnitsData[unit.unit_number].humidity = 0;
        } else {
          allUnitsData[unit.unit_number] = {};
          logging.log(`[DM] [UNIT ${unit.unit_number}] - Port not available.`);
        }
      }

      // remove the lock file
      await fs.unlinkSync('/tmp/devices.lock');
    }
  }
};

/**
 * @function checkIfTimeUpdated
 *
 * @dev This function will check if the time has been updated or not.
 * @dev If the time has been updated, then it update the time of the thermostat.
 * @dev This function will be called every day at 12:00 AM.
 *
 * The code reads unit details and performs various checks and operations for each unit.
 * It includes updating modes, fans, calibrations, and time.
 * The code checks for a lock file and reads device manager information.
 * It performs data reading and writing operations, including updating humidity.
 * Finally, it removes the lock file to indicate completion.
 */
const checkIfTimeUpdated = async () => {
  const isUpdated = localStorage.getItem('islastUpdated');
  if (isUpdated === 'true') {
    const year = parseInt(moment().format('YY'));
    const month = parseInt(moment().format('MM'));
    const day = parseInt(moment().format('DD'));
    const hour = parseInt(moment().format('HH'));
    const minute = parseInt(moment().format('mm'));

    const unitDetails = await allUnitsDetails();

    if (unitDetails != undefined) {
      for (const unit of unitDetails) {
        // check if a file named '/tmp/devices.lock' exists in utils folder
        if (fs.existsSync('/tmp/devices.lock')) {
          logging.log('[DM] - Device manager is locked - checkIfTimeUpdated');
          // wait while the file is removed
          // while (fs.existsSync('/tmp/devices.lock')) {
          //   await sleep(100);
          // }
          return;
        }

        // create a file named '/tmp/devices.lock' in utils folder
        await fs.writeFileSync('/tmp/devices.lock', 'locked');

        let device_manager_id = unit.device_manager_name.match(/\/dev\/ttyUSB\d+/);

        if (device_manager_id != null) {
          device_manager_id = device_manager_id[0];

          let isPortAvailable = false;

          const ports = await serialport.SerialPort.list();
          for (let port of ports) {
            if (port.path === String(device_manager_id)) {
              isPortAvailable = true;
            }
          }

          if (isPortAvailable) {
            const client = new ModbusRTU();
            const baudRate = await fetchSystemConfigData('baud_rate');
            await client.connectRTUBuffered(device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
            await client.setTimeout(1000);

            try {
              await client.setID(unit.unit_number);

              // setting time
              await client.writeRegister(410, [year]);
              await sleep(100);
              await client.writeRegister(411, [month]);
              await sleep(100);
              await client.writeRegister(413, [day]);
              await sleep(100);
              await client.writeRegister(414, [hour]);
              await sleep(100);
              await client.writeRegister(415, [minute]);
              await sleep(100);
            } catch (err) {}

            client.close();
          }
        }

        // remove the lock file
        await fs.unlinkSync('/tmp/devices.lock');

        localStorage.setItem('islastUpdated', 'false');
      }
    }
  }
};

/**
 * @function checkIfModeUpdated
 *
 * @dev This function will check if the unit has been updated or not.
 * @dev If the unit has been updated, then it update the unit mode of the thermostat.
 *
 * This code updates the modes for multiple units.
 * It checks for a lock file, verifies device port availability, connects to the devices using ModbusRTU, sets the mode, updates registers, and removes the lock file.
 */
const checkIfModeUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfModeUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('unit_info_updated');
    if (isUpdated === 'true') {
      const unit_info = JSON.parse(localStorage.getItem('unit_info'));
      const unitIds = Object.keys(unit_info);

      for (let id of unitIds) {
        const unit = unit_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        logging.log(`[DM] - Updating unit ${unit_id} mode to ${unit.mode}`);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // parsing unit mode from string to number
        let mode_num = 0;
        if (unit.mode === 'cool') {
          mode_num = 1;
          allUnitsData[unit_id].mode_num = 1;
        } else if (unit.mode === 'heat') {
          mode_num = 2;
          allUnitsData[unit_id].mode_num = 2;
        } else if (unit.mode === 'off') {
          mode_num = 3;
          allUnitsData[unit_id].mode_num = 3;
        } else {
          mode_num = 0;
          allUnitsData[unit_id].mode_num = 0;
        }

        params = {
          unit_number: unit_id,
          mode: unit.mode,
        };

        await request.post(config.change_mode, params);

        logging.log(`[DM] - changing mode start`);

        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');
        // fetching address and length of MODBUS_OUTPUT_MANU_ENABLE
        const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
        // fetching address and length of MODBUS_COOL_HEAT_MODE
        const MODBUS_COOL_HEAT_MODE = registerDetail.getDetailsByName('MODBUS_COOL_HEAT_MODE');

        if (mode_num === 0) {
          await client.writeRegister(MODBUS_COOL_HEAT_MODE.Register_Address, [mode_num]);

          // setting unit mode
          await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        } else if (mode_num === 1) {
          //cool
          await client.writeRegister(MODBUS_COOL_HEAT_MODE.Register_Address, [mode_num]);

          // setting unit mode
          await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

          // setting unit mode
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        } else if (mode_num === 2) {
          // heat
          await client.writeRegister(MODBUS_COOL_HEAT_MODE.Register_Address, [mode_num]);

          // setting unit mode
          await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

          // setting unit mode
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        } else if (mode_num === 3) {
          // setting unit mode
          await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

          // setting unit mode
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        }

        logging.log(`[DM] - changing mode end`);

        client.close();
      }

      localStorage.setItem('unit_info', '');
      localStorage.setItem('unit_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * @function checkIfFanUpdated
 *
 * @dev This function will check if the unit has been updated or not.
 * @dev If the unit has been updated, then it update the unit mode of the thermostat.
 *
 * This code checks and updates the fan state for each unit.
 * It verifies the lock file, reads register information, connects to the device, and updates the fan state accordingly.
 * It also changes the mode if the fan is turned on.
 * Finally, it removes the lock file.
 */
const checkIfFanUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfFanUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('register_info_updated');
    if (isUpdated === 'true') {
      const register_info = JSON.parse(localStorage.getItem('register_info'));
      const unitIds = Object.keys(register_info);

      for (let id of unitIds) {
        const unit = register_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        logging.log(`[DM] - Updating unit ${unit_id} to turn ${unit.state ? 'on' : 'off'} Fan`);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');

        await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

        let params = {};

        if (unit.state === true) {
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [1]);

          params = {
            unit_number: unit_id,
            mode: 'vent',
          };

          await request.post(config.change_mode, params);
        } else {
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        }

        client.close();
      }

      localStorage.setItem('register_info', '');
      localStorage.setItem('register_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * @function checkIfSetTempUpdated
 *
 * @dev This function will check if the unit set temp has been updated or not.
 * @dev If the unit has been updated, then it update the set temp of the thermostat.
 *
 * This code checks and updates the set temperature for each unit.
 * It verifies the lock file, reads the set temperature information, connects to the device, and updates the set temperature accordingly.
 * It also handles the maximum and minimum temperature limits.
 * Finally, it removes the lock file.
 */
const checkIfSetTempUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfSetTempUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('set_temp_info_updated');
    if (isUpdated === 'true') {
      const set_temp_info = JSON.parse(localStorage.getItem('set_temp_info'));
      const unitIds = Object.keys(set_temp_info);

      for (let id of unitIds) {
        const unit = set_temp_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        logging.log(`[DM] - Updating unit ${unit_id} set temp to ${unit.temp}`);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        let result;

        // fetching address and length of MODBUS_DAY_SETPOINT
        const MODBUS_DAY_SETPOINT = registerDetail.getDetailsByName('MODBUS_DAY_SETPOINT');
        // fetching address and length of MODBUS_NIGHT_SETPOINT
        const MODBUS_NIGHT_SETPOINT = registerDetail.getDetailsByName('MODBUS_NIGHT_SETPOINT');
        // fetching address and length of MODBUS_MAX_SETPOINT
        const MODBUS_MAX_SETPOINT = registerDetail.getDetailsByName('MODBUS_MAX_SETPOINT');
        // fetching address and length of MODBUS_MIN_SETPOINT
        const MODBUS_MIN_SETPOINT = registerDetail.getDetailsByName('MODBUS_MIN_SETPOINT');

        result = await client.readHoldingRegisters(MODBUS_MAX_SETPOINT.Register_Address, MODBUS_MAX_SETPOINT.Register_Length);
        const max_temp = result.data[0];

        result = await client.readHoldingRegisters(MODBUS_MIN_SETPOINT.Register_Address, MODBUS_MIN_SETPOINT.Register_Length);
        const min_temp = result.data[0];

        logging.log(`[DM] - Max temp: ${max_temp}, Min temp: ${min_temp}`);

        if (unit.temp > max_temp) {
          await client.writeRegister(MODBUS_MAX_SETPOINT.Register_Address, [unit.temp]);
        }

        if (unit.temp < min_temp) {
          await client.writeRegister(MODBUS_MIN_SETPOINT.Register_Address, [unit.temp]);
        }

        await client.writeRegister(MODBUS_DAY_SETPOINT.Register_Address, [unit.temp * 10]);
        await sleep(200);
        await client.writeRegister(MODBUS_NIGHT_SETPOINT.Register_Address, [unit.temp * 10]);

        client.close();
        allUnitsData[id].set_temp = unit.temp;
      }

      localStorage.setItem('set_temp_info', '');
      localStorage.setItem('set_temp_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * @function checkIfRelayUpdated
 *
 * This code checks if the unit relay status is updated.
 * If updated, it uses ModbusRTU to update the relay status for each unit.
 * It also includes handling a lock file and clearing data after completion.
 */
const checkIfRelayUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfRelayUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('set_relay_info_updated');
    if (isUpdated === 'true') {
      const set_temp_info = JSON.parse(localStorage.getItem('set_relay_info'));
      const unitIds = Object.keys(set_temp_info);

      for (let id of unitIds) {
        const unit = set_temp_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        logging.log(`[DM] - Updating unit ${unit_id} relay status to ${unit.status}`);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');

        await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

        await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [unit.status]);

        client.close();
      }

      localStorage.setItem('set_relay_info', '');
      localStorage.setItem('set_relay_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * This code checks if the unit calibration information is updated.
 * If updated, it uses ModbusRTU to update the calibration values for each unit.
 * It also includes handling a lock file and clearing data after completion.
 */
const checkIfCalibrationUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfCalibrationUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('unit_cal_info_updated');
    if (isUpdated === 'true') {
      const calibration_info = JSON.parse(localStorage.getItem('unit_cal_info'));
      const unitIds = Object.keys(calibration_info);

      for (let id of unitIds) {
        const unit = calibration_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // fetching address and length of MODBUS_INTERNAL_THERMISTOR
        const MODBUS_INTERNAL_THERMISTOR = registerDetail.getDetailsByName('MODBUS_INTERNAL_THERMISTOR');
        // fetching address and length of MODBUS_ANALOG_INPUT1
        const MODBUS_ANALOG_INPUT1 = registerDetail.getDetailsByName('MODBUS_ANALOG_INPUT1');
        // fetching address and length of MODBUS_ANALOG_INPUT2
        const MODBUS_ANALOG_INPUT2 = registerDetail.getDetailsByName('MODBUS_ANALOG_INPUT2');
        // fetching address and length of MODBUS_ANALOG_INPUT3
        // const MODBUS_ANALOG_INPUT3 = registerDetail.getDetailsByName('MODBUS_ANALOG_INPUT3');

        if (unit.calibration.internal !== null) {
          await client.writeRegister(MODBUS_INTERNAL_THERMISTOR.Register_Address, [unit.calibration.internal * 10]);
        }

        if (unit.calibration.remote !== null) {
          await client.writeRegister(MODBUS_ANALOG_INPUT1.Register_Address, [unit.calibration.remote * 10]);
        }

        if (unit.calibration.supply !== null) {
          await client.writeRegister(MODBUS_ANALOG_INPUT2.Register_Address, [unit.calibration.supply * 10]);
        }

        // if (unit.calibration.humidity !== null) {
        //   await client.writeRegister(MODBUS_ANALOG_INPUT3.Register_Address, [unit.calibration.humidity]);
        // }

        client.close();
      }

      localStorage.setItem('unit_cal_info', '');
      localStorage.setItem('unit_cal_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * This code checks if the unit humidity calibration information is updated.
 * If updated, it uses ModbusRTU to update the humidity calibration value for each unit.
 * It also includes handling a lock file and clearing data after completion.
 */
const checkIfHumidityCalibrationUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfHumidityCalibrationUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('unit_hum_cal_info_updated');
    if (isUpdated === 'true') {
      const calibration_info = JSON.parse(localStorage.getItem('unit_hum_cal_info'));
      const unitIds = Object.keys(calibration_info);

      for (let id of unitIds) {
        const unit = calibration_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // fetching address and length of MODBUS_HUMIDITY
        const MODBUS_HUMIDITY = registerDetail.getHumidityDetailsByName('MODBUS_HUMIDITY');

        if (unit.calibration !== null) {
          await client.writeRegister(MODBUS_HUMIDITY.Register_Address, [unit.calibration * 10]);
        }

        client.close();
      }

      localStorage.setItem('unit_hum_cal_info', '');
      localStorage.setItem('unit_hum_cal_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * @function checkFan
 *
 * This code checks if the fan information is updated.
 * If updated, it uses ModbusRTU to control the fan state (turning it on or off) for each unit.
 * It includes handling a lock file and clearing data after completion.
 */
const checkFan = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkFan');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('fan_info_updated');
    if (isUpdated === 'true') {
      const register_info = JSON.parse(localStorage.getItem('fan_info'));
      const unitIds = Object.keys(register_info);

      for (let id of unitIds) {
        const unit = register_info[id];
        const unit_id = parseInt(id);

        let isPortAvailable = false;

        const ports = await serialport.SerialPort.list();
        for (let port of ports) {
          if (port.path === String(unit.device_manager_id)) {
            isPortAvailable = true;
          }
        }

        if (!isPortAvailable) {
          logging.log(`[DM] - Port not available for unit ${unit_id}`);
          continue;
        }

        logging.log(`[DM] - Updating unit ${unit_id} to turn ${unit.state ? 'on' : 'off'} Fan`);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');

        await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

        let params = {};

        if (unit.state === true) {
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [1]);
        } else {
          await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
        }

        client.close();
      }

      localStorage.setItem('fan_info', '');
      localStorage.setItem('fan_info_updated', 'false');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * This code checks if the unit fix register request come & the write and read registers.
 * Send data back to front-end via socketIO
 */
const checkIfFixRegisterUpdated = async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    logging.log('[DM] - Device manager is locked - checkIfFixRegisterUpdated');
    // wait for file to be removed
    return;
  }

  // create a file named '/tmp/devices.lock' in utils folder
  await fs.writeFileSync('/tmp/devices.lock', 'locked');

  try {
    const isUpdated = localStorage.getItem('unit_fix_register_info_updated');
    if (isUpdated === 'true') {
      const fix_register_info = JSON.parse(localStorage.getItem('unit_fix_register_info'));
      const unitIds = Object.keys(fix_register_info);

      for (let id of unitIds) {
        console.log(id);
        const unit = fix_register_info[id];
        const unit_id = parseInt(id);

        await sleep(100);
        const client = new ModbusRTU();
        const baudRate = await fetchSystemConfigData('baud_rate');
        client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
        client.setTimeout(500);
        await client.setID(unit_id);
        await sleep(200);

        // Read the relay data
        const relayData = await client.readHoldingRegisters(209, 1);

        // Check if the unit is offline
        if (relayData.data[0] === undefined) {
          console.error('[FR] - Unit is offline!');
          continue;
        }

        const statusMessages = [];
        // Loop through and write registers
        for (const [register, value, name] of setupRegs.tStat7FixRegisters) {
          let success = false;
          let retryCount = 2; // Number of times to retry writing the register

          while (!success && retryCount > 0) {
            try {
              await client.writeRegister(register, [value]);
              success = true;
            } catch (e) {
              console.error(`[GS] - Error writing ${register}: ${e.message}`);
              retryCount--;
              statusMessages.push(`Register ${register}(${name}), act/des (N/A/${value}) - Fix failed`);
            }
          }

          if (success) {
            // Read the register to get the data after successful write
            try {
              const readData = await client.readHoldingRegisters(register, 1);
              statusMessages.push(`Register ${register}(${name}), act/des (${readData.data[0]}/${value})`);
            } catch (e) {
              console.error(`[GS] - Error reading ${register}: ${e.message}`);
              statusMessages.push(`Failed read on register ${register}`);
            }
          }
        }

        const finalData = {
          unit_number: unit_id,
          data: statusMessages,
        };
        // Close the Modbus client
        client.close();
        socket.emit('sendFixRegistersData', finalData);
      }

      localStorage.setItem('unit_fix_register_info', '');
      localStorage.setItem('unit_fix_register_info_updated', 'false');
      socket.emit('disconnect');
    }
  } catch (err) {}

  // remove the lock file
  await fs.unlinkSync('/tmp/devices.lock');
};

/**
 * @function unexpectedConditions
 *
 */
const unexpectedConditions = async (unitData) => {
  //i have unit.unit_number
  const newUnitsData = structuredClone(allUnitsData);
  const unitIds = Object.keys(newUnitsData);

  if (unitIds.length !== 0) {
    if (newUnitsData.hasOwnProperty(unitData.unit_number)) {
      const id = unitData.unit_number; // Use the unit_number as the id
      const unit = newUnitsData[id]; // Get the unit data

      if (!unit.hasOwnProperty('device_manager_id')) {
        return; // Skip if the device_manager_id is not present
      }
      // check if a file named '/tmp/devices.lock' exists in utils folder
      if (fs.existsSync('/tmp/devices.lock')) {
        logging.log('[DM] - Device manager is locked - unexpectedConditions');
        // wait while the file is removed
        while (fs.existsSync('/tmp/devices.lock')) {
          await sleep(100);
        }
      }

      // create a file named '/tmp/devices.lock' in utils folder
      await fs.writeFileSync('/tmp/devices.lock', 'locked');

      const client = new ModbusRTU();
      const baudRate = await fetchSystemConfigData('baud_rate');
      client.connectRTUBuffered(unit.device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
      client.setTimeout(500);
      await client.setID(parseInt(id));
      await sleep(200);

      try {
        // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
        const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');

        let heatCoolMode = '';
        if (unit.mode_num === 3) {
          heatCoolMode = 'off';
        } else if (unit.mode_num === 0) {
          heatCoolMode = 'auto';
        } else if (unit.mode_num === 1) {
          heatCoolMode = 'cool';
        } else if (unit.mode_num === 2) {
          heatCoolMode = 'heat';
        } else if (unit.mode_num === 4) {
          heatCoolMode = 'vent';
        }

        let heatCoolStatus = '';
        const relayType = checkUnitType(unit.unit_type);

        switch (unit.relay_status) {
          case relayType.off:
            heatCoolStatus = 'OFF';
            break;
          case relayType.fan_on:
            heatCoolStatus = 'FAN_ON';
            break;
          case relayType.cool1:
            heatCoolStatus = 'COOL1/FAN';
            break;
          case relayType.cool2:
            heatCoolStatus = 'COOL2/FAN';
            break;
          case relayType.coolh:
            heatCoolStatus = 'COOL_H/FAN';
            break;
          case relayType.cool2h:
            heatCoolStatus = 'COOL2_H/FAN';
            break;
          case relayType.heat1:
            heatCoolStatus = 'HEAT1/FAN';
            break;
          case relayType.heat2:
            heatCoolStatus = 'HEAT2/FAN';
            break;
          default:
            heatCoolStatus = 'OFFLINE';
            break;
        }

        if (heatCoolMode === 'cool') {
          if (heatCoolStatus === 'HEAT1/FAN' || heatCoolStatus === 'HEAT2/FAN' || heatCoolStatus === 'OFFLINE') {
            // set MODBUS_DIGITAL_OUTPUT_STATUS to 0
            await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
            await sleep(200);
          }
        } else if (heatCoolMode === 'heat') {
          if ((heatCoolStatus !== 'HEAT1/FAN' && heatCoolStatus !== 'HEAT2/FAN' && heatCoolStatus !== 'OFF' && heatCoolStatus !== 'FAN_ON') || heatCoolStatus === 'OFFLINE') {
            // set MODBUS_DIGITAL_OUTPUT_STATUS to 0
            await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
            await sleep(200);
          }
        } else if (heatCoolMode === 'auto') {
          if (heatCoolStatus === 'OFFLINE') {
            console.log(id, ' coming for testing', heatCoolMode, heatCoolStatus);
            // set MODBUS_DIGITAL_OUTPUT_STATUS to 0
            await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [0]);
            await sleep(200);
          }
        }
      } catch (e) {
        logging.log(`[DM] - Error: ${e}`);
      }

      client.close();

      // remove the lock file
      await fs.unlinkSync('/tmp/devices.lock');
    }
  }
};

/**
 * @returns allUnitsData object
 */
const getUnitData = () => {
  return allUnitsData;
};

const deviceManager = {
  readUnitsData,
  getUnitData,
  checkIfModeUpdated,
  checkIfFanUpdated,
  checkIfSetTempUpdated,
  checkIfRelayUpdated,
  checkIfCalibrationUpdated,
  checkIfHumidityCalibrationUpdated,
  checkIfFixRegisterUpdated,
  unexpectedConditions,
  checkFan,
};

module.exports = deviceManager;
