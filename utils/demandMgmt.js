const config = require('./config');
const deviceManager = require('./deviceManager');
const logging = require('./logging');
const request = require('./request');
const { LocalStorage } = require('node-localstorage');
const moment = require('moment');
const setRelayStatus = require('./setRelayStatus');
var localStorage = new LocalStorage('localStore');

const demandUnitsDetails = {};

const stage2UnitsNormal = {};
const stage2UnitsHys = {};

const stage1UnitsNormal = {};
const stage1UnitsHys = {};

/**
 *
 * @returns get system data from db
 *
 * This code fetches system data from an endpoint using an HTTP request.
 * If the request is successful, it returns the data object.
 * If the request fails, an error is thrown with the corresponding error message.
 */
const getSystemData = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.get_system_data);
    if (get_resp.data.status) {
      const { is_power_allowed, override_limit } = get_resp.data.data;
      return { is_power_allowed, override_limit };
    } else {
      throw {
        response: {
          data: {
            message: get_resp.data.message,
          },
        },
      };
    }
  } catch (err) {
    console.log(err);
  }
};

/**
 * @param {*} unit_number of the unit
 * @param {*} device_manager_id also known as port of the unit
 * @param {*} temp as the set temp
 * @returns nothing
 *
 * This code sets the desired temperature for a specific unit in a device management system.
 * It stores the temperature information and provides feedback on whether the temperature was successfully set or encountered an error.
 * The function requires the unit number, device manager ID, and desired temperature as input parameters.
 */
const setUnitTemp = async (unit_number, device_manager_id, temp) => {
  try {
    if (unit_number && device_manager_id && temp) {
      const unit_info = localStorage.getItem('set_temp_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id,
        temp: temp,
      };

      localStorage.setItem('set_temp_info', JSON.stringify(unit_info_json));
      localStorage.setItem('set_temp_info_updated', 'true');

      // sending response as success
      logging.log(`[DMDGT] [UNIT ${unit_number}] - Set temp has been set successfully!`);
    } else {
      // sending response as error
      logging.log(`[DMDGT] [UNIT ${unit_number}] - Set temp is not set! Please specify input parameters!`);
    }
  } catch (err) {
    logging.log(`[DMDGT] - Error: ${err.message}`);
  }
};

/**
 *
 * @returns all units data with details
 * This code fetches the latest details of all units from a device management system and returns them as an object.
 * If an error occurs, it logs the error message.
 */
const allUnitsDetails = async () => {
  try {
    const all_units_power = {};
    // axios call
    const get_resp = await request.get(config.units_readings_latest);
    const data = get_resp.data.data;

    for (let d of data) {
      all_units_power[d.unit_number] = {
        hysterisis: d.heat_cool?.hysterisis,
        occ_high: d.temperature_settings?.cool?.occ_high,
        power_info: d.power_information,
        zone_priority: d.temperature_settings?.cool?.zone_priority,
      };
    }

    return all_units_power;
  } catch (err) {
    logging.log(`[DMDGT] - Error: ${err.message}`);
  }
};

/**
 * This code retrieves the most recent information for all units from a device management system and organizes it into an object.
 * If any errors occur during the process, it logs the corresponding error message.
 */
const get_greatest_temp_diff = (flag) => {
  let max_temp_diff_unit_id = -1;

  if (flag === 0) {
    const stage2UnitsNormalKeys = Object.keys(stage2UnitsNormal);

    if (stage2UnitsNormalKeys.length > 0) {
      let max_temp_diff = 0;
      for (let unit_id of stage2UnitsNormalKeys) {
        if (stage2UnitsNormal[unit_id].temp_diff > max_temp_diff) {
          max_temp_diff = stage2UnitsNormal[unit_id].temp_diff;
          max_temp_diff_unit_id = unit_id;
        }
      }

      if (max_temp_diff_unit_id !== -1) {
        stage2UnitsNormal[max_temp_diff_unit_id].temp_diff = 0;
      }
    }

    return max_temp_diff_unit_id;
  } else if (flag === 1) {
    const stage2UnitsHysKeys = Object.keys(stage2UnitsHys);

    if (stage2UnitsHysKeys.length > 0) {
      let max_temp_diff = -99;
      for (let unit_id of stage2UnitsHysKeys) {
        if (stage2UnitsHys[unit_id].temp_diff > max_temp_diff) {
          max_temp_diff = stage2UnitsHys[unit_id].temp_diff;
          max_temp_diff_unit_id = unit_id;
        }
      }

      if (max_temp_diff_unit_id !== -1) {
        stage2UnitsHys[max_temp_diff_unit_id].temp_diff = 0;
      }
    }

    return max_temp_diff_unit_id;
  } else if (flag === 2) {
    const stage1UnitsNormalKeys = Object.keys(stage1UnitsNormal);

    if (stage1UnitsNormalKeys.length > 0) {
      let max_temp_diff = 0;
      for (let unit_id of stage1UnitsNormalKeys) {
        if (stage1UnitsNormal[unit_id].temp_diff > max_temp_diff) {
          max_temp_diff = stage1UnitsNormal[unit_id].temp_diff;
          max_temp_diff_unit_id = unit_id;
        }
      }

      if (max_temp_diff_unit_id !== -1) {
        stage1UnitsNormal[max_temp_diff_unit_id].temp_diff = 0;
      }
    }

    return max_temp_diff_unit_id;
  } else if (flag === 3) {
    const stage1UnitsHysKeys = Object.keys(stage1UnitsHys);

    if (stage1UnitsHysKeys.length > 0) {
      let max_temp_diff = -99;
      for (let unit_id of stage1UnitsHysKeys) {
        if (stage1UnitsHys[unit_id].temp_diff > max_temp_diff) {
          max_temp_diff = stage1UnitsHys[unit_id].temp_diff;
          max_temp_diff_unit_id = unit_id;
        }
      }

      if (max_temp_diff_unit_id !== -1) {
        stage1UnitsHys[max_temp_diff_unit_id].temp_diff = 0;
      }
    }

    return max_temp_diff_unit_id;
  }
};

/**
 *
 * @param {*} cl_power current power + power of the unit to be turned on
 * @param {*} al_power available power
 * @param {*} is_demand_allowed flag to check if demand is allowed or not
 *
 * @returns true if demand is met, false otherwise
 *
 * This code checks the demand status based on power values and unit details.
 * It retrieves necessary data and performs operations on the units. If any errors occur, it logs the error message.
 * The function returns a boolean indicating the demand status.
 */
const checkDemand = async (cl_power, al_power, is_demand_allowed = false) => {
  const all_units_details_db = await allUnitsDetails();
  const { override_limit } = await getSystemData();
  const all_units_details_tstat = await deviceManager.getUnitData();
  const unitIds = Object.keys(all_units_details_tstat);

  let prevdiff = 99;
  let zone_priority = 10;
  let closestUnit = -1;

  if (unitIds.length <= 3) {
    return true;
  }

  if (!is_demand_allowed) {
    return false;
  }

  for (let unit_id of unitIds) {
    if (demandUnitsDetails[unit_id] === undefined) {
      demandUnitsDetails[unit_id] = {
        is_set_high: false,
        expire_time: 0,
      };
    }

    const specificUnit_tstat = all_units_details_tstat[unit_id];
    const specificUnit_db = all_units_details_db[unit_id];

    const comfort_level = specificUnit_db.set_temp + specificUnit_db.hysterisis;

    if (cl_power < al_power) {
      return true;
    }

    if (specificUnit_tstat.relay_status && specificUnit_tstat.relay_status !== 0) {
      if (specificUnit_tstat.current_temp < specificUnit_tstat.set_temp && specificUnit_tstat.relay_status === 11) {
        stage2UnitsNormal[unit_id] = {
          temp_diff: specificUnit_tstat.set_temp - specificUnit_tstat.current_temp,
          device_manager_id: specificUnit_tstat.device_manager_id,
        };
      } else if (specificUnit_tstat.current_temp > specificUnit_tstat.set_temp && specificUnit_tstat.current_temp < comfort_level && specificUnit_tstat.relay_status === 11) {
        stage2UnitsHys[unit_id] = {
          temp_diff: specificUnit_tstat.set_temp - specificUnit_tstat.current_temp,
          device_manager_id: specificUnit_tstat.device_manager_id,
        };
      } else if (specificUnit_tstat.current_temp < specificUnit_tstat.set_temp && specificUnit_tstat.relay_status === 9) {
        stage1UnitsNormal[unit_id] = {
          temp_diff: specificUnit_tstat.set_temp - specificUnit_tstat.current_temp,
          device_manager_id: specificUnit_tstat.device_manager_id,
        };
      } else if (specificUnit_tstat.current_temp > specificUnit_tstat.set_temp && specificUnit_tstat.current_temp < comfort_level && specificUnit_tstat.relay_status === 9) {
        stage1UnitsHys[unit_id] = {
          temp_diff: specificUnit_tstat.set_temp - specificUnit_tstat.current_temp,
          device_manager_id: specificUnit_tstat.device_manager_id,
        };
      } else {
        const temp_diff = specificUnit_tstat.current_temp - specificUnit_tstat.set_temp;
        if (temp_diff < prevdiff) {
          if (specificUnit_db.zone_priority <= zone_priority && specificUnit_db.zone_priority !== 1) {
            prevdiff = temp_diff;
            zone_priority = specificUnit_db.zone_priority;
            closestUnit = unit_id;
          }
        }
      }
    }
  }

  const new_cl_power = cl_power;

  while (new_cl_power > al_power) {
    const c1_unit_id = get_greatest_temp_diff(0);

    if (c1_unit_id !== -1) {
      const stage2Power = all_units_details_db[c1_unit_id].cooling_power_information.comp2_kw;

      demandUnitsDetails[c1_unit_id].is_set_high = false;
      logging.log(`[DMDGT] [UNIT ${c1_unit_id}] - Setting to stage 1 from stage 2`);
      // set unit to stage 1
      await setRelayStatus(c1_unit_id, all_units_details_tstat[c1_unit_id].device_manager_id, 9);

      new_cl_power -= stage2Power;
      continue;
    }

    const c2_unit_id = get_greatest_temp_diff(1);

    if (c2_unit_id !== -1) {
      const stage2Power = all_units_details_db[c2_unit_id].cooling_power_information.comp2_kw;

      demandUnitsDetails[c2_unit_id].is_set_high = false;
      logging.log(`[DMDGT] [UNIT ${c2_unit_id}] - Setting to stage 1 from stage 2`);
      // set unit to stage 1
      await setRelayStatus(c2_unit_id, all_units_details_tstat[c2_unit_id].device_manager_id, 9);

      new_cl_power -= stage2Power;
      continue;
    }

    const c3_unit_id = get_greatest_temp_diff(2);

    if (c3_unit_id !== -1) {
      const stage1Power = all_units_details_db[c3_unit_id].cooling_power_information.comp1_kw;

      demandUnitsDetails[c3_unit_id].is_set_high = false;
      logging.log(`[DMDGT] [UNIT ${c3_unit_id}] - Setting to fan on from stage 1`);
      // set off unit
      await setRelayStatus(c3_unit_id, all_units_details_tstat[c3_unit_id].device_manager_id, 1);

      new_cl_power -= stage1Power;
      continue;
    }

    const c4_unit_id = get_greatest_temp_diff(3);

    if (c4_unit_id !== -1) {
      const stage1Power = all_units_details_db[c4_unit_id].cooling_power_information.comp1_kw;

      demandUnitsDetails[c4_unit_id].is_set_high = false;
      logging.log(`[DMDGT] [UNIT ${c4_unit_id}] - Setting to fan on from stage 1`);
      // set off unit
      await setRelayStatus(c4_unit_id, all_units_details_tstat[c4_unit_id].device_manager_id, 1);

      new_cl_power -= stage1Power;
      continue;
    }

    if (closestUnit !== -1) {
      const occ_high = all_units_details_db[closestUnit].occ_high;

      demandUnitsDetails[closestUnit].is_set_high = true;
      demandUnitsDetails[closestUnit].expire_time = moment().add(override_limit, 'minutes');
      logging.log(`[DMDGT] [UNIT ${closestUnit}] - Setting closest unit to occupied high ${occ_high}`);
      // set unit set temp to occ high
      await setUnitTemp(closestUnit, all_units_details_tstat[closestUnit].device_manager_id, occ_high);

      return false;
    }

    // quick fix to by exit the loop if unit status is in off or fan condition
    return;
  }

  return true;
};

/**
 * This code checks if the demand for a unit is set as high and returns true if it is, otherwise it returns false.
 */
const checkIfDemandSetHigh = async (unit_id) => {
  if (demandUnitsDetails[unit_id] === undefined) {
    return false;
  }

  const currentTime = moment();
  if (demandUnitsDetails[unit_id].expire_time !== undefined && currentTime.isAfter(demandUnitsDetails[unit_id].expire_time)) {
    demandUnitsDetails[unit_id].is_set_high = false;
    return false;
  }

  return true;
};

const demandMgmt = {
  checkDemand,
  checkIfDemandSetHigh,
};

module.exports = demandMgmt;
