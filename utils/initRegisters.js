const ModbusRTU = require('modbus-serial');
const config = require('../utils/config.js');
const request = require('../utils/request');
const logging = require('./logging');
const sleep = require('./sleep.js');
const serialport = require('serialport');
const fetchSystemConfigData = require('./fetchSystemConfigData.js');

/**
 *
 * @returns all units data with details
 *
 * The code retrieves the latest readings for all units by making an HTTP GET request to a specified endpoint.
 */
const allUnitsDetails = async () => {
  try {
    const get_resp = await request.get(config.units_readings_latest);
    return get_resp.data.data;
  } catch (err) {
    logging.log(`[SETUP] - Error: ${err.message}`);
  }
};

// TSTAT7 Registers Set
const tstat7Registers = [
  // Register Address, Value
  [142, 20],
  [143, 20],
  [144, 20],
  [145, 20],
  [146, 20],
  [728, 1],
  [122, 1],
  [123, 1],
  [124, 0],
  [104, 1],
  [117, 10],
  [254, 31], // Setting relays to manual switch
  [262, 1],
  [565, 0], // Do not enable day/night change
  [730, 0], // Do not enforce manual keypad temp limits
];

// In previous system we need to set initial registers on every device manager run

// TSTAT7 Registers Set
const tStat7RegistersNew = [
  // Register Address, Value
  [103, 1],
  [104, 1],
  [105, 1],
  [106, 3],
  [107, 1],
  [110, 1],
  [117, 5], // In Old list value was 10 now its 5
  [122, 1],
  [123, 1],
  [124, 0],
  [125, 0],
  [142, 20],
  [143, 20],
  [144, 20],
  [145, 20],
  [146, 20],
  [209, 0],
  [241, 3],
  [242, 30],
  [262, 1],
  [345, 700], // it will write this as 70
  //[346, 5], // it will write this as 0.5
  //[347, 5], // it will write this as 0.5
  [348, 700], // it will write this as 70
  [349, 68],
  [350, 67],
  //[352, 5], // it will write this as 0.5
  //[353, 5], // it will write this as 0.5
  [354, 67],
  [355, 720],
  [364, 70],
  [365, 74],
  [366, 64],
  [373, 1],
  [396, 0],
  [418, 5],
  [419, 0],
  [424, 22],
  [425, 0],
  [426, 6],
  [427, 0],
  [432, 21],
  [433, 0],
  [254, 31],
  [565, 1],
  [730, 0],
  [262, 1],
  [728, 1],
];

const tStat7FixRegisters = [
  // Register Address, Value, Name
  [103, 1, 'MODBUS_SEQUENCE'],
  [104, 1, 'MODBUS_DEGC_OR_F'],
  [105, 1, 'MODBUS_FAN_MODE'],
  [106, 3, 'MODBUS_POWERUP_MODE'],
  [107, 1, 'MODBUS_AUTO_ONLY'],
  [110, 1, 'MODBUS_BAUDRATE'],
  [117, 5, 'MODBUS_DEAD_MASTER'], // In Old list value was 10 now its 5
  [122, 1, 'MODBUS_ANALOG1_RANGE'],
  [123, 1, 'MODBUS_ANALOG2_RANGE'],
  [124, 0, 'MODBUS_ANALOG3_RANGE'],
  [125, 0, 'MODBUS_ANALOG4_RANGE'],
  [142, 20, 'MODBUS_FILTER'],
  [143, 20, 'MODBUS_INPUT1_FILTER'],
  [144, 20, 'MODBUS_INPUT2_FILTER'],
  [145, 20, 'MODBUS_INPUT3_FILTER'],
  [146, 20, 'MODBUS_INPUT4_FILTER'],
  [209, 0, 'MODBUS_DIGITAL_OUTPUT_STATUS'],
  [241, 3, 'MODBUS_CYCLING_DELAY'],
  [242, 30, 'MODBUS_CHANGOVER_DELAY'],
  [262, 1, 'MODBUS_DEADMASTER_AUTO_MANUAL'],
  [345, 700, 'MODBUS_DAY_SETPOINT'], // it will write this as 70
  //[346, 5, 'MODBUS_DAY_COOLING_DEADBAND'], // it will write this as 0.5
  //[347, 5, 'MODBUS_DAY_HEATING_DEADBAND'], // it will write this as 0.5
  [348, 700, 'MODBUS_DAY_COOLING_SETPOINT'], // it will write this as 70
  [349, 68, 'MODBUS_DAY_HEATING_SETPOINT'],
  [350, 67, 'MODBUS_NIGHT_SETPOINT'],
  //[352, 5, 'MODBUS_NIGHT_HEATING_DEADBAND'], // it will write this as 0.5
  //[353, 5, 'MODBUS_NIGHT_COOLING_DEADBAND'], // it will write this as 0.5
  [354, 67, 'MODBUS_NIGHT_HEATING_SETPOINT'],
  [355, 720, 'MODBUS_NIGHT_COOLING_SETPOINT'],
  [364, 70, 'MODBUS_POWERUP_SETPOINT'],
  [365, 74, 'MODBUS_MAX_SETPOINT'],
  [366, 64, 'MODBUS_MIN_SETPOINT'],
  [373, 1, 'MODBUS_SETPOINT_INCREASE'],
  [396, 0, 'MODBUS_SPECIAL_MENU_LOCK'],
  [418, 5, 'WORK_DAY_WAKE_TIME_HOUR'],
  [419, 0, 'WORK_DAY_WAKE_TIME_MINUTES'],
  [424, 22, 'WORK_DAY_SLEEP_TIME_HOUR'],
  [425, 0, 'WORK_DAY_SLEEP_TIME_MINUTES'],
  [426, 6, 'WEEKEND_DAY_WAKE_TIME_HOUR'],
  [427, 0, 'WEEKEND_DAY_WAKE_TIME_MINUTES'],
  [432, 21, 'WEEKEND_SLEEP_TIME_HOUR'],
  [433, 0, 'WEEKEND_SLEEP_TIME_MINUTES'],
  [254, 31, 'MODBUS_OUTPUT_MANU_ENABLE'],
  [565, 1, 'MODBUS_SCHEDULE_ON_OFF'],
  [730, 0, 'SETPOINT_UNLIMIT'],
  [262, 1, 'MODBUS_DEADMASTER_AUTO_MANUAL'],
  [728, 1, 'MODBUS_ICON_MANUAL_MODE'],
];

/**
 * Initializes registers for HVAC units, ensuring proper communication and initialization.
 */
const initRegisters = async () => {
  logging.log('[IR SETUP] - Initializing registers...');

  const unitDetails = await allUnitsDetails();
  if (!unitDetails || unitDetails.length === 0) {
    logging.log('[IR ERROR] - No units found!');
    return;
  }

  const baudRate = parseInt(await fetchSystemConfigData('baud_rate'));

  const availablePorts = (await serialport.SerialPort.list()).map((port) => port.path);

  for (const unit of unitDetails) {
    if (!unit.dlc_managed) {
      logging.log(`[IR ERROR] - Unit ${unit.unit_number} skipping because it's not DLC managed.`);
      continue;
    }
    const device_manager_id = unit.device_manager_name.match(/\/dev\/ttyUSB\d+/);
    if (!device_manager_id) {
      logging.log('[IR ERROR] - No device manager found!');
      continue;
    }

    const devicePath = device_manager_id[0];
    if (!availablePorts.includes(devicePath)) {
      logging.log(`[IR ERROR] - Port ${devicePath} not available!`);
      continue;
    }

    // check if device name is not equal to Tstat 7
    if (unit.device_name !== 'Tstat 7') {
      logging.log('[IR ERROR] - Unit type not found!');
      continue;
    }

    const client = new ModbusRTU();
    client.connectRTUBuffered(devicePath, { baudRate });
    client.setTimeout(500);

    try {
      await client.setID(unit.unit_number);
      await sleep(200);

      const relayData = await client.readHoldingRegisters(209, 1);
      // checking if unit is offline then continue on next unit
      if (relayData.data[0] === undefined) {
        logging.log('[IR ERROR] - Unit is offline!');
        continue;
      }

      for (const [register, value] of tStat7RegistersNew) {
        try {
          logging.log(`[IR SETUP] - Unit ${unit.unit_number} - Writing register ${register} with value ${value}.`);
          await client.writeRegister(register, [value]);
        } catch (e) {
          // Handle write error if necessary
        }
      }
      logging.log(`[IR SETUP] - Unit ${unit.unit_number} initialized!`);
    } catch (e) {
      logging.log(`[IR ERROR] - Unit ${unit.unit_number} not available: ${e.message}`);
    } finally {
      client.close();
    }
  }
};

const setupRegs = {
  initRegisters,
  // tstat7Registers,
  tStat7RegistersNew,
  tStat7FixRegisters,
};

module.exports = setupRegs;
