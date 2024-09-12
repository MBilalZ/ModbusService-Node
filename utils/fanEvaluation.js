const moment = require('moment');
const { LocalStorage } = require('node-localstorage');
const lastFanStatus = require('./lastFanStatus');
const logging = require('./logging');
const singleUnitDetailsDB = require('./singleUnitDetailsDB');
const localStorage = new LocalStorage('localStore');

/**
 * @param {*} unit_number of the unit
 * @param {*} device_manager_id also known as port of the unit
 * @param {*} state of the fan, true or false
 * @returns nothing
 * 
 * This code updates the fan information for a unit. 
 * It retrieves the existing fan data, adds the new device manager ID and state, and stores the updated data. 
 * It logs a success or error message accordingly.
 */
const updateFan = async (unit_number, device_manager_id, state) => {
  try {
    if (unit_number && device_manager_id) {
      const unit_info = localStorage.getItem('fan_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id,
        state: state,
      };

      localStorage.setItem('fan_info', JSON.stringify(unit_info_json));
      localStorage.setItem('fan_info_updated', 'true');

      // sending response as success
      logging.log(`[FE] [UNIT ${unit_number}] - Request to turn fan ${state ? 'on' : 'off'} has been sent! `);
    } else {
      // sending response as error
      logging.log(`[FE] [UNIT ${unit_number}] - Request to turn fan ${state ? 'on' : 'off'} for unit ${unit_number} has failed!`);
    }
  } catch (err) {
    logging.log(`[FE] - Error: ${err.message}`);
  }
};

/**
 *
 * @param {*} id
 * 
 * This code evaluates the fan operation for a unit based on its settings, including occupied hours, recirculation mode, and fan running duration. 
 * It updates the fan status accordingly.
 */
const fanEvaluation = async (id, is_occupied) => {
  const unitData = await singleUnitDetailsDB(id);
  const fanSettings = unitData.fanSettings;
  // New device manager name with regex
  const device_manager_id = fanSettings.device_manager_name.match(/\/dev\/ttyUSB\d+/)[0];
  const currentTime = moment();

  if (!fanSettings) {
    logging.log(`[FE] [UNIT ${id}] - Fan data not found`);
    return -1;
  }

  if (fanSettings.fan_mode === 'on') {
    logging.log(`[FE] [UNIT ${id}] - Fan is set to turn on`);
    // turn on fan if it is off
    updateFan(id, device_manager_id, true);
    return 1;
  } else if (fanSettings.fresh_air.mode === 'occupied_hours') {
    logging.log(`[FE] [UNIT ${id}] - Fan is set to occupied hours`);
    if (is_occupied) {
      logging.log(`[FE] [UNIT ${id}] - is occupied`);
      // turn on fan if it is off
      updateFan(id, device_manager_id, true);
      return 1;
    } else {
      logging.log(`[FE] [UNIT ${id}] - is not occupied`);
      // turn off fan if it is on
      updateFan(id, device_manager_id, false);
      return 0;
    }
  } else if (fanSettings.fresh_air.mode === 'recirculation') {
    logging.log(`[FE] [UNIT ${id}] - Fan is set to recirculation`);
    const refresh_period = fanSettings.fresh_air.refresh_period;
    const minutes_on = fanSettings.fresh_air.recirculation_minutes_on;

    const lastFanOn = await lastFanStatus(id, 'on');
    const lastFanOff = await lastFanStatus(id, 'off');

    if (lastFanOn) {
      logging.log(`[FE] [UNIT ${id}] - Fan is on. Checking if it has been running for ${minutes_on} minutes`);
      const lastFanOnTime = moment(lastFanOn).add(minutes_on, 'minutes');

      if (currentTime.isAfter(lastFanOnTime)) {
        logging.log(`[FE] [UNIT ${id}] - Fan has been running for ${minutes_on} minutes. Turning off fan`);
        // turn off fan
        updateFan(id, device_manager_id, false);
        return 0;
      } else {
        logging.log(`[FE] [UNIT ${id}] - Fan has not been running for ${minutes_on} minutes. Keeping fan on`);
        return 1;
      }
    } else if (lastFanOff) {
      logging.log(`[FE] [UNIT ${id}] - Fan is off. Checking if refresh period has passed`);
      const lastFanOffTime = moment(lastFanOff);
      const newCurrentTime = currentTime.clone().subtract(refresh_period - minutes_on, 'minutes');

      if (newCurrentTime.isAfter(lastFanOffTime)) {
        logging.log(`[FE] [UNIT ${id}] - Refresh Period has passed. Turning on fan`);
        // turn on fan
        updateFan(id, device_manager_id, true);
        return 1;
      } else {
        logging.log(`[FE] [UNIT ${id}] - Refresh Period has not passed. Keeping fan off`);
        return 0;
      }
    }
  } else {
    logging.log(`[FE] [UNIT ${id}] - Fan mode is auto & fan operation is auto! Turning off fan`);
    updateFan(id, device_manager_id, false);
    return 0;
  }
};

module.exports = fanEvaluation;
