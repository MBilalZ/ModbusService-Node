const config = require('../utils/config.js');
const request = require('../utils/request');
const deviceManager = require('../utils/deviceManager.js');
const logging = require('../utils/logging.js');
const singleUnitDetails = require('../utils/singleUnitDetails.js');
const { checkUnitType } = require('../helpers/relayTable');

/**
 *
 * @returns current outside temp
 */
const getOutsideTemp = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.get_outside_temp);
    if (get_resp.data.status) {
      return get_resp.data.data;
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
 *
 * @returns single unit data
 */
const getUnitInformation = async (id) => {
  let unitData = {};
  let singleUnit = {};

  // setting up unit for API
  singleUnit = {
    ac_unit_id: id,
  };
  try {
    const singleUnitData = await request.post(config.get_single_unit_readings, singleUnit);
    if (singleUnitData.data.data.power_information && singleUnitData.data.data.humidity_monitoring) {
      unitData.powerInformation = singleUnitData.data.data.power_information;
      unitData.humidity = singleUnitData.data.data.humidity_monitoring;
      return unitData;
    } else {
      return [];
    }
  } catch (err) {
    logging.log(`[SHORT TERM] [UNIT ${id}] - Error: ${err.message}`);
  }
};

/**
 *
 * @returns get unit current power
 */
const getCurrentPower = (status, unit_info) => {
  const power_info = unit_info.powerInformation;
  const unit_type = unit_info.unitType;

  // Current power calculation
  if (status === 'FAN_ON') {
    return power_info.cooling_power_information.comp3_kw;
  } else if (status === 'COOL1/FAN') {
    return power_info.cooling_power_information.comp1_kw + power_info.cooling_power_information.comp3_kw;
  } else if (status === 'COOL2/FAN') {
    return power_info.cooling_power_information.comp1_kw + power_info.cooling_power_information.comp2_kw + power_info.cooling_power_information.comp3_kw;
  } else if (status === 'HEAT1/FAN') {
    if (unit_type === 'heat_pump') {
      return power_info.cooling_power_information.comp1_kw + power_info.cooling_power_information.comp3_kw;
    } else {
      if (power_info.heating_power_information.type === 'gas') {
        return power_info.cooling_power_information.comp3_kw;
      } else {
        return power_info.heating_power_information.stage1 + power_info.cooling_power_information.comp3_kw;
      }
    }
  } else if (status === 'HEAT2/FAN') {
    if (unit_type === 'heat_pump') {
      return power_info.cooling_power_information.comp1_kw + power_info.cooling_power_information.comp2_kw + power_info.cooling_power_information.comp3_kw;
    } else {
      if (power_info.heating_power_information.type === 'gas') {
        return power_info.cooling_power_information.comp3_kw;
      } else {
        return power_info.heating_power_information.stage1 + power_info.heating_power_information.stage2 + power_info.cooling_power_information.comp3_kw;
      }
    }
  } else if (status === 'OFF') {
    return 0;
  } else if (status === 'COOL_H/FAN') {
    return 0;
  } else if (status === 'COOL2_H/FAN') {
    return 0;
  } else if (status === 'OFFLINE') {
    return 0;
  } else {
    return 0;
  }
};

const update = async () => {
  try {
    const allUnitsData = await deviceManager.getUnitData();

    //getting outside temp from backend api
    const getOutsideTem = await getOutsideTemp();
    const finalOutsideTemp = getOutsideTem ? getOutsideTem[0].temperature : '';
    const finalOutsideHum = getOutsideTem ? getOutsideTem[0].humidity : '';

    unitIds = Object.keys(allUnitsData);
    if (unitIds.length !== 0) {
      for (const id of unitIds) {
        const specificUnit = allUnitsData[id];
        if (specificUnit.hasOwnProperty('relay_status')) {
          let fan_status = 'off';

          let mode = '';
          if (specificUnit.mode_num === 4) {
            mode = 'vent';
          } else if (specificUnit.mode_num === 3) {
            mode = 'off';
          } else if (specificUnit.mode_num === 0) {
            mode = 'auto';
          } else if (specificUnit.mode_num === 1) {
            mode = 'cool';
          } else if (specificUnit.mode_num === 2) {
            mode = 'heat';
          }

          let status = '';
          const relayType = checkUnitType(specificUnit.unit_type);
          switch (specificUnit.relay_status) {
            case relayType.fan_on:
              status = 'FAN_ON';
              fan_status = 'on';
              break;
            case relayType.cool1:
              status = 'COOL1/FAN';
              fan_status = 'on';
              break;
            case relayType.cool2:
              status = 'COOL2/FAN';
              fan_status = 'on';
              break;
            case relayType.coolh:
              status = 'COOL_H/FAN';
              fan_status = 'on';
              break;
            case relayType.cool2h:
              status = 'COOL2_H/FAN';
              fan_status = 'on';
              break;
            case relayType.heat1:
              status = 'HEAT1/FAN';
              fan_status = 'on';
              break;
            case relayType.heat2:
              status = 'HEAT2/FAN';
              fan_status = 'on';
              break;
            default:
              status = 'OFF';
              fan_status = 'off';
              break;
          }

          let humidity_set_point = 0;
          const unit_info = await getUnitInformation(id);
          const humidity_info = unit_info.humidity;

          if (unit_info.length !== 0) {
            humidity_set_point = humidity_info.enabled ? humidity_info.target_humidity : 0;
          } else {
            logging.log(`[SHORT TERM] [UNIT ${id}] - No Power & Humidity info found in the database.`);
          }

          const { override_type } = await singleUnitDetails(id);

          // Get power value
          const currentPower = await getCurrentPower(status, unit_info);

          const short_term_data = {
            zone_id: parseInt(id),
            outside_temp: parseFloat(finalOutsideTemp.toFixed(2)),
            outside_humid: parseFloat(finalOutsideHum.toFixed(2)),
            avg_temp: specificUnit.current_temp,
            set_temp: specificUnit.set_temp,
            fan_status: fan_status,
            max_status: '', // no idea
            relay: specificUnit.relay_status,
            mode: mode,
            status: status,
            supply_temp: specificUnit.supply_temp,
            humid: specificUnit.humidity,
            humidSP: humidity_set_point, // coming from db
            power: currentPower,
            econ_status: 'off',
            cool_occ_time: specificUnit.cool_occ_time,
            cool_peak_time: specificUnit.cool_peak_time,
            set_warm_temp: 0,
            warm_occ_time: specificUnit.warm_occ_time,
            temperature_data: specificUnit.temperature_data,
            override: override_type,
          };

          // sending changed data to backend
          await request.post(config.short_term_readings_create, short_term_data);
          logging.log(`[SHORT TERM] [UNIT ${id}] - Cron job executed to send data in short term reading table.`);
          // logging.log(post_resp.data);
        }
      }
    } else {
      logging.log('[SHORT TERM] - No units found in the database.');
    }
  } catch (err) {
    logging.log(`[SHORT TERM] Error: ${err.message}`);
  }
};

const short_term_cron = {
  update,
};

module.exports = short_term_cron;
