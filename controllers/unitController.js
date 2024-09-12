const ioClient = require('socket.io-client');
const ModbusRTU = require('modbus-serial');
const serialport = require('serialport');
const socket = ioClient.connect('http://localhost:5050');
const { LocalStorage } = require('node-localstorage');
const fs = require('fs/promises');
const path = require('path');
const logging = require('../utils/logging');
const deviceManager = require('../utils/deviceManager');
const autoSwitchMode = require('../utils/autoSwitchMode');
const { checkUnitType } = require('../helpers/relayTable');
const { createConnection, closeConnection } = require('../services/db');
const request = require('../utils/request');
const fetchSystemConfigData = require('../utils/fetchSystemConfigData');
const sleep = require('../utils/sleep');
const setupRegs = require('../utils/initRegisters');

// constructor function to create a storage directory inside our project for all our localStorage setItem.
var localStorage = new LocalStorage('localStore');

const PROJECT_DIR = path.resolve(__dirname, '..');
const DM_LOGS_FILE = path.join(PROJECT_DIR, 'temp', 'DMLogs.txt');
const CONTROLLER_LOGS_FILE = path.join(PROJECT_DIR, 'temp', 'ControllerLogs.txt');

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns  Monitor units data from different units & device manager Ids
 */
const allMonitorUnitsData = async (req, res) => {
  let monitorUnitsData = {};
  try {
    const allUnitsData = await deviceManager.getUnitData();
    unitIds = Object.keys(allUnitsData);
    if (unitIds.length !== 0) {
      for (const id of unitIds) {
        const specificUnit = allUnitsData[id];
        if (specificUnit.hasOwnProperty('relay_status')) {
          let status = '';
          const relayType = checkUnitType(specificUnit.unit_type);
          switch (specificUnit.relay_status) {
            case relayType.off:
              status = 'OFF';
              break;
            case relayType.fan_on:
              status = 'FAN_ON';
              break;
            case relayType.cool1:
              status = 'COOL1/FAN';
              break;
            case relayType.cool2:
              status = 'COOL2/FAN';
              break;
            case relayType.coolh:
              status = 'COOL_H/FAN';
              break;
            case relayType.cool2h:
              status = 'COOL2_H/FAN';
              break;
            case relayType.heat1:
              status = 'HEAT1/FAN';
              break;
            case relayType.heat2:
              status = 'HEAT2/FAN';
              break;
            default:
              status = 'OFFLINE';
              break;
          }

          let mode = '';
          if (specificUnit.mode_num === 4) {
            mode = 'vent';
          } else if (specificUnit.mode_num === 3) {
            mode = 'off';
          } else if (specificUnit.mode_num === 0) {
            mode = 'auto';
            // setting auto switch mode
            const autoMode = await autoSwitchMode(id, mode, specificUnit.current_temp, specificUnit.set_temp, false);
            logging.log(`[UC] - Auto switch mode is ${autoMode}`, false);

            if (autoMode !== -1) mode = `auto/${autoMode}`;
          } else if (specificUnit.mode_num === 1) {
            mode = 'cool';
          } else if (specificUnit.mode_num === 2) {
            mode = 'heat';
          }

          monitorUnitsData[`T-Stat-${id}`] = {
            t_stat_id: parseInt(id),
            curr_temp: specificUnit.current_temp,
            set_temp: specificUnit.set_temp,
            sensor_type: specificUnit.sensor_type,
            status: status,
            supply_temp: specificUnit.supply_temp,
            mode: mode,
            humid: specificUnit.humidity,
          };
        } else {
          monitorUnitsData[`T-Stat-${id}`] = {
            t_stat_id: parseInt(id),
            curr_temp: '',
            set_temp: '',
            sensor_type: '',
            status: 'OFFLINE',
            supply_temp: '',
            mode: 'unit_offline',
            humid: '',
          };
        }
      }
      res.status(200).json({
        status: 1,
        allUnitsData: monitorUnitsData,
        message: 'Monitor units data of all units has been sent successfully!',
      });
    } else {
      res.status(200).json({
        status: 0,
        allUnitsData: {},
        message: 'No data found from back-end server!!!',
      });
    }
  } catch (err) {
    logging.log(`[UC] - Error: ${err.message}`);
  }
};

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns setting unit mode and send response back
 */
const setUnitMode = async (req, res) => {
  const { unit_number, device_manager_id, mode } = req.body;
  try {
    if (unit_number && device_manager_id && mode) {
      const unit_info = localStorage.getItem('unit_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      // New device manager name with regex
      let device_manager_id_regexed = device_manager_id.match(/\/dev\/ttyUSB\d+/);

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id_regexed[0],
        mode: mode,
      };

      localStorage.setItem('unit_info', JSON.stringify(unit_info_json));
      console.log(unit_info_json);
      localStorage.setItem('unit_info_updated', 'true');

      // sending response as success
      res.status(200).json({
        status: 1,
        message: `Unit mode has been set successfully!`,
      });
    } else {
      // sending response as error
      res.status(200).json({
        status: 0,
        message: `Unit mode is not set! Please specify input parameters!`,
      });
    }
  } catch (err) {
    console.log(err);

    // sending response as error
    res.status(200).json({
      status: 0,
      message: `Unit mode is not set!`,
    });
  }
};

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns setting unit calibration and send response back
 */
const setCalibration = async (req, res) => {
  const { unit_number, device_manager_id, calibration } = req.body;

  try {
    if (unit_number && device_manager_id && calibration) {
      const unit_info = localStorage.getItem('unit_cal_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      // New device manager name with regex
      let device_manager_id_regexed = device_manager_id.match(/\/dev\/ttyUSB\d+/);

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id_regexed[0],
        calibration: calibration,
      };

      localStorage.setItem('unit_cal_info', JSON.stringify(unit_info_json));
      localStorage.setItem('unit_cal_info_updated', 'true');

      // sending response as success
      res.status(200).json({
        status: 1,
        message: `Unit calibration has been set successfully!`,
      });
    }
  } catch (err) {
    console.log(err);

    // sending response as error
    res.status(200).json({
      status: 0,
      message: `Unit calibration is not set!`,
    });
  }
};

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns setting unit calibration for humidity sensor and send response back
 */
const setHumidityCalibration = async (req, res) => {
  const { humidity_id, humidity_device_manager_id, calibration } = req.body;

  try {
    if (!humidity_id || !humidity_device_manager_id || !calibration) {
      // sending response as error
      res.status(400).json({
        status: 0,
        message: `Set params properly.`,
      });
    } else {
      const unit_info = localStorage.getItem('unit_hum_cal_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      // New device manager name with regex
      let humidity_device_manager_id_regexed = humidity_device_manager_id.match(/\/dev\/ttyUSB\d+/);

      unit_info_json[humidity_id] = {
        device_manager_id: humidity_device_manager_id_regexed[0],
        calibration: calibration,
      };

      localStorage.setItem('unit_hum_cal_info', JSON.stringify(unit_info_json));
      localStorage.setItem('unit_hum_cal_info_updated', 'true');

      // sending response as success
      res.status(200).json({
        status: 1,
        message: `Unit humidity calibration has been set successfully!`,
      });
    }
  } catch (err) {
    console.log(err);

    // sending response as error
    // res.status(200).json({
    //   status: 0,
    //   message: `Unit calibration is not set!`,
    // });
  }
};

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns retrieve single unit data from database
 */
const dbData = async (req, res) => {
  const id = req.params.unitId;

  try {
    const query = `
    SELECT *
    FROM system_ac_units_setup AS su
    LEFT JOIN devices_manager AS dm ON su.device_manager_id = dm.id
    LEFT JOIN ac_unit_information AS ai ON su.id = ai.ac_unit_id
    LEFT JOIN ac_unit_power_information AS pi ON su.id = pi.ac_unit_id
    LEFT JOIN ac_unit_temperature AS at ON su.id = at.ac_unit_id
    LEFT JOIN facility_purges AS fp ON su.id = fp.ac_unit_id
    WHERE su.unit_number = ?
  `;

    // creating database connection here
    const connection = await createConnection();

    connection.query(query, [id], async (err, rows, fields) => {
      if (err) res.status(400).json({ error: 'An error occurred while fetching data' });
      const data = rows[0];

      // closing database connection here
      await closeConnection(connection);

      let finalData = {
        occ_hours: {},
        heat_cool: {},
        temperature_settings: {
          cool: {},
          warm: {},
        },
        fan_settings: {},
      };

      const monday = data.mon_occ_timings;
      const tuesday = data.tue_occ_timings;
      const wednesday = data.wed_occ_timings;
      const thursday = data.thu_occ_timings;
      const friday = data.fri_occ_timings;
      const saturday = data.sat_occ_timings;
      const sunday = data.sun_occ_timings;

      // const monday = JSON.parse(data.mon_occ_timings);
      // const tuesday = JSON.parse(data.tue_occ_timings);
      // const wednesday = JSON.parse(data.wed_occ_timings);
      // const thursday = JSON.parse(data.thu_occ_timings);
      // const friday = JSON.parse(data.fri_occ_timings);
      // const saturday = JSON.parse(data.sat_occ_timings);
      // const sunday = JSON.parse(data.sun_occ_timings);

      finalData.occ_hours.monday = monday;
      finalData.occ_hours.tuesday = tuesday;
      finalData.occ_hours.wednesday = wednesday;
      finalData.occ_hours.thursday = thursday;
      finalData.occ_hours.friday = friday;
      finalData.occ_hours.saturday = saturday;
      finalData.occ_hours.sunday = sunday;

      finalData.heat_cool.mode = data.heat_cool_mode;
      finalData.heat_cool.switch_delta = data.switch_delta;
      finalData.heat_cool.min_switch_time = data.min_switch_time;
      finalData.heat_cool.hysterisis = data.hysterisis;
      finalData.heat_cool.heat_hi_limit = data.external_high_temp_limit;
      finalData.heat_cool.cool_low_limit = data.external_low_cool_limit;

      finalData.temperature_settings.cool.occ_low = data.cool_occ_low;
      finalData.temperature_settings.cool.occ_ideal = data.cool_occ_ideal;
      finalData.temperature_settings.cool.occ_high = data.cool_occ_high;
      finalData.temperature_settings.cool.un_occ_ideal = data.cool_unocc_ideal;
      finalData.temperature_settings.cool.un_occ_high = data.cool_unocc_high;
      finalData.temperature_settings.cool.precool_occ_time = data.precool_occ_time;
      finalData.temperature_settings.cool.precool_peak_time = data.precool_peak_time;
      finalData.temperature_settings.cool.precool_peak = data.precool_peak === 0 ? false : true;
      finalData.temperature_settings.cool.zone_priority = data.zone_priority;
      finalData.temperature_settings.cool.optimal_precool_start = data.optimal_start_precool_time === 0 ? false : true;

      finalData.temperature_settings.warm.occ_ideal = data.warm_occ_ideal;
      finalData.temperature_settings.warm.un_occ_ideal = data.warm_unocc_ideal;
      finalData.temperature_settings.warm.preheat_time = data.preheat_occ_time;
      finalData.temperature_settings.warm.optimal_preheat_start = data.optimal_start_preheat_time === 0 ? false : true;

      finalData.fan_settings.device_manager_name = data.name;
      finalData.fan_settings.fan_mode = data.fan_mode;
      finalData.fan_settings.fresh_air = data.fresh_air;

      res.status(200).json(finalData);
    });
  } catch (err) {
    logging.log('[UC] - Error fetching db data');
  }
};

/**
 *
 * @param {*} req for query
 * @param {*} res to send data
 * @returns all logs from file store in location temp/logs
 */
const allLogsFromFile = async (req, res) => {
  const logType = req.query.log_type;

  if (!logType) {
    return res.status(400).json({
      status: 0,
      allLogs: [],
      message: 'log_type is required!',
    });
  }

  let logs;
  try {
    if (logType === 'device-manager') {
      await fs.mkdir(path.join(PROJECT_DIR, 'temp'), { recursive: true });
      const data = await fs.readFile(DM_LOGS_FILE, 'utf8');
      logs = data.trim().split('\n');
    } else if (logType === 'controller') {
      await fs.mkdir(path.join(PROJECT_DIR, 'temp'), { recursive: true });
      const data = await fs.readFile(CONTROLLER_LOGS_FILE, 'utf8');
      logs = data.trim().split('\n');
    }

    res.status(200).json({
      status: 1,
      allLogs: logs,
      message: 'Logs generated successfully!',
    });
  } catch (err) {
    console.error(`Error loading logs: ${err}`);
    res.status(400).json({
      status: 0,
      allLogs: [],
      message: 'Error loading logs!',
    });
  }
};

/**
 *
 * @param {*} req for body
 * @param {*} res to send data
 * @returns store maintenance alert via socket io hardware code
 */
const saveMaintenanceAlert = async (req, res) => {
  const { name, message, type, is_read, unit_number, freq_type, module_type } = req.body;

  let alertData = {
    name,
    message,
    type,
    is_read,
    freq_type,
    unit_number,
    module_type,
  };
  try {
    socket.emit('sendAlert', alertData);
    const tempAlarm = await request.post(config.temp_alerts, alertData);
    socket.emit('disconnect');

    if (tempAlarm.data.status) {
      res.status(200).json({
        status: 1,
        alertData: tempAlarm.data.data,
        message: 'Maintenance alert sent successfully!',
      });
    } else {
      res.status(400).json({
        status: 0,
        alertData: [],
        message: 'Error saving alert!',
      });
    }
  } catch (err) {
    console.error(`Error saving alert: ${err}`);
    res.status(400).json({
      status: 0,
      alertData: [],
      message: 'Error saving alert!',
    });
  }
};

// Define the registers
const registersList = [6, 7, 8, 9, 121, 382, 130, 131, 132, 349, 348, 354, 355, 347, 346, 352, 353, 254, 209];
// Define the register identifiers
const registerIdentifiers = {
  6: 'zone_6',
  7: 'model_Firmware_7',
  8: 'hm_Firmware_8',
  9: 'firmware_9',
  121: 'temps_121',
  382: 'remote_Local_382',
  130: 'internal_130',
  131: 'remote_131',
  132: 'dats_132',
  349: 'setpoint_day_heat_349',
  348: 'setpoint_day_cool_348',
  354: 'setpoint_night_heat_354',
  355: 'setpoint_night_cool_355',
  347: 'deadband_day_heat_347',
  346: 'deadband_day_cool_346',
  352: 'deadband_night_heat_352',
  353: 'deadband_night_cool_353',
  254: 'control_relay_254',
  209: 'relay_status_209',
};
// Registers to divide by 10
const registersToDivideBy10 = [7, 121, 130, 131, 132, 346, 347, 348, 349, 352, 353, 354, 355];

/**
 *
 * @param {*} req for body
 * @param {*} res to send data
 * @returns get settings from modbus registers for a specific unit
 */
const getSettings = async (req, res) => {
  const { unit_number } = req.body;
  let registerValues = {
    zone_6: '#',
    model_Firmware_7: '#',
    hm_Firmware_8: '#',
    firmware_9: '#',
    temps_121: '#',
    remote_Local_382: '#',
    internal_130: '#',
    remote_131: '#',
    dats_132: '#',
    setpoint_day_heat_349: '#',
    setpoint_day_cool_348: '#',
    setpoint_night_heat_354: '#',
    setpoint_night_cool_355: '#',
    deadband_day_heat_347: '#',
    deadband_day_cool_346: '#',
    deadband_night_heat_352: '#',
    deadband_night_cool_353: '#',
    control_relay_254: '#',
    relay_status_209: '#',
  };

  try {
    if (!unit_number) {
      throw new Error('Invalid request data.');
    }

    const allUnitsData = await deviceManager.getUnitData();
    const unitIds = Object.keys(allUnitsData);

    if (unitIds.includes(unit_number)) {
      const unitData = allUnitsData[unit_number];

      // Create a function to update registerValues
      const updateRegisterValues = (property, unitDataProperty) => {
        if (unitData[unitDataProperty] !== undefined) {
          registerValues[property] = unitData[unitDataProperty];
        } else {
          registerValues[property] = '#';
        }
      };

      // Call the function for each property
      updateRegisterValues('zone_6', 'modbus_address');
      updateRegisterValues('model_Firmware_7', 'product_model');
      updateRegisterValues('hm_Firmware_8', 'hardware_rev');
      updateRegisterValues('firmware_9', 'pic_version');
      updateRegisterValues('temps_121', 'current_temp');
      updateRegisterValues('remote_Local_382', 'sensor_type');
      updateRegisterValues('internal_130', 'internal_thermistor');
      updateRegisterValues('remote_131', 'analog_input1');
      updateRegisterValues('dats_132', 'supply_temp');
      updateRegisterValues('setpoint_day_heat_349', 'day_heat_setpoint');
      updateRegisterValues('setpoint_day_cool_348', 'day_cool_setpoint');
      updateRegisterValues('setpoint_night_heat_354', 'night_heat_setpoint');
      updateRegisterValues('setpoint_night_cool_355', 'night_cool_setpoint');
      updateRegisterValues('deadband_day_heat_347', 'day_heat_deadband');
      updateRegisterValues('deadband_day_cool_346', 'day_cool_deadband');
      updateRegisterValues('deadband_night_heat_352', 'night_heat_deadband');
      updateRegisterValues('deadband_night_cool_353', 'night_cool_deadband');
      updateRegisterValues('control_relay_254', 'control_relay');
      updateRegisterValues('relay_status_209', 'relay_status');

      res.status(200).json({
        status: 1,
        data: registerValues,
        message: `Unit data fetched successfully!`,
      });
    } else {
      res.status(200).json({
        status: 0,
        data: registerValues,
        message: `No data found`,
      });
    }
  } catch (error) {
    console.error(`[GS] - Error: ${error.message}`);
    res.status(500).json({
      status: 0,
      data: registerValues,
      message: error.message,
    });
  }
};
const getSettingsOld = async (req, res) => {
  const { unit_number, device_manager_name, device_name } = req.body;

  try {
    if (!unit_number || !device_manager_name || device_name !== 'Tstat 7') {
      throw new Error('Invalid request data.');
    }

    const device_manager_id = device_manager_name.match(/\/dev\/ttyUSB\d+/)?.[0];
    if (!device_manager_id) {
      throw new Error('No device manager found!');
    }

    if (!(await serialport.SerialPort.list()).some((port) => port.path === device_manager_id)) {
      throw new Error(`Port ${device_manager_id} not available!`);
    }

    const client = new ModbusRTU();
    const baudRate = await fetchSystemConfigData('baud_rate');
    client.connectRTUBuffered(device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
    client.setTimeout(500);

    await client.setID(parseInt(unit_number));
    await sleep(200);

    const registerValues = {};

    for (const register of registersList) {
      try {
        const readData = await client.readHoldingRegisters(register, 1);
        let value = readData.data[0] != null && readData.data[0] !== '' ? parseFloat(readData.data[0]) : null;

        // Check if the register needs to be divided by 10
        if (registersToDivideBy10.includes(register)) {
          value = value !== null ? value / 10 : null;
        }

        registerValues[registerIdentifiers[register]] = value !== null ? value.toString() : '';
      } catch (e) {
        console.error(`[GS] - Error reading ${registerIdentifiers[register]}: ${e.message}`);
        res.status(500).json({
          status: 0,
          data: [],
          message: `[GS] - Error reading ${registerIdentifiers[register]}: ${e.message}`,
        });
      }
    }

    res.status(200).json({
      status: 1,
      message: 'Success',
      data: registerValues,
    });

    client.close();
  } catch (error) {
    console.error(`[GS] - Error: ${error.message}`);
    res.status(500).json({
      status: 0,
      data: [],
      message: error.message,
    });
  }
};

/**
 *
 * @param {*} req for body
 * @param {*} res to send data
 * @returns fix registers will write and read data from registers (admin debug)
 */

const fixRegisters = async (req, res) => {
  try {
    const { unit_number, device_manager_name } = req.body;

    // Check for required request data
    if (!unit_number || !device_manager_name) {
      throw new Error('Invalid request data.');
    }

    // Extract device manager ID from the name
    const device_manager_id = device_manager_name.match(/\/dev\/ttyUSB\d+/)?.[0];
    if (!device_manager_id) {
      throw new Error('No device manager found!');
    }

    // Check if the specified port is available
    const availablePorts = await serialport.SerialPort.list();
    if (!availablePorts.some((port) => port.path === device_manager_id)) {
      throw new Error(`Port ${device_manager_id} not available!`);
    }

    const unit_info = localStorage.getItem('unit_fix_register_info');
    let unit_info_json = {};
    if (unit_info) {
      unit_info_json = JSON.parse(unit_info);
    }
    unit_info_json[unit_number] = { device_manager_id };

    localStorage.setItem('unit_fix_register_info', JSON.stringify(unit_info_json));
    localStorage.setItem('unit_fix_register_info_updated', 'true');

    // sending response as success
    res.status(200).json({
      status: 1,
      message: 'Fix registers data written successfully',
      data: [],
    });
  } catch (error) {
    console.error(`[GS] - Error: ${error.message}`);
    res.status(500).json({
      status: 0,
      data: [],
      message: error.message,
    });
  }
};
const fixRegistersOld = async (req, res) => {
  try {
    const { unit_number, device_manager_name } = req.body;

    // Check for required request data
    if (!unit_number || !device_manager_name) {
      throw new Error('Invalid request data.');
    }

    // Extract device manager ID from the name
    const device_manager_id = device_manager_name.match(/\/dev\/ttyUSB\d+/)?.[0];
    if (!device_manager_id) {
      throw new Error('No device manager found!');
    }

    // Check if the specified port is available
    const availablePorts = await serialport.SerialPort.list();
    if (!availablePorts.some((port) => port.path === device_manager_id)) {
      throw new Error(`Port ${device_manager_id} not available!`);
    }

    // Create a ModbusRTU client
    const client = new ModbusRTU();
    const baudRate = await fetchSystemConfigData('baud_rate');
    client.connectRTUBuffered(device_manager_id, { baudRate: parseInt(baudRate.baud_rate) });
    client.setTimeout(500);

    // Set the Modbus ID and wait for a short period
    await client.setID(parseInt(unit_number));
    await sleep(200);

    // Read the relay data
    const relayData = await client.readHoldingRegisters(209, 1);

    // Check if the unit is offline
    if (relayData.data[0] === undefined) {
      console.error('[IR ERROR] - Unit is offline!');
      res.status(200).json({
        status: 1,
        message: 'Unit is offline!',
        data: [],
      });
      return;
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

    // Close the Modbus client
    client.close();

    // Respond with success
    res.status(200).json({
      status: 1,
      message: 'Fix registers data fetched successfully',
      data: statusMessages,
    });
  } catch (error) {
    console.error(`[GS] - Error: ${error.message}`);
    res.status(500).json({
      status: 0,
      data: [],
      message: error.message,
    });
  }
};

const unitController = {
  allMonitorUnitsData,
  setUnitMode,
  setCalibration,
  setHumidityCalibration,
  dbData,
  allLogsFromFile,
  saveMaintenanceAlert,
  getSettings,
  fixRegisters,
};

module.exports = unitController;
