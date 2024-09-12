const logging = require('./logging.js');
const fanEvaluation = require('./fanEvaluation.js');
const { supplyTempTime } = require('./supplyTempTime.js');
const setTempAlert = require('./sendTempAlerts.js');
const setRelayStatus = require('./setRelayStatus.js');
const demandMgmt = require('./demandMgmt.js');
const lastUnitStatus = require('./lastUnitStatus.js');
const calculatePower = require('./calculatePower.js');
const singleUnitDetails = require('./singleUnitDetails.js');
const deviceManager = require('./deviceManager.js');
const autoSwitchMode = require('./autoSwitchMode.js');
const moment = require('moment');

let cool_cut_flag = false;
let heat_cut_flag = false;

/**
 *
 * @returns get all units in is occ high
 *
 * This code checks if all other units are in the "occ_high" cooling power mode, except the current unit.
 */
const checkIfOtherUnitsInOccHigh = async (currentUnitId) => {
  try {
    const allUnitsData = await deviceManager.getUnitData();
    unitIds = Object.keys(allUnitsData);

    for (const id in unitIds) {
      if (parseInt(currentUnitId) === parseInt(id)) {
        continue;
      }
      const specificUnit_db = await singleUnitDetails(id);
      const specificUnit_tstat = allUnitsData[id];

      if (specificUnit_tstat.set_temp !== specificUnit_db.powerInformation.cooling_power_information.occ_high) {
        return false;
      }
    }
    return true;
  } catch (err) {
    console.log(err);
  }
};

/**
 *
 * @param {*} id
 * @param {*} specificUnit_tstat
 * @param {*} within_outside_above
 * @param {*} within_outside_below
 * @param {*} set_temp
 * @param {*} specificUnit_db
 * @param {*} allUnitsDlc
 * @param {*} heatCoolMode
 * @param {*} heatCoolStatus
 * @param {*} autoBasedLastHeatCoolMode
 * @param {*} override_type
 * @param {*} relayType
 * @param {*} isVentOrOcc
 * @param {*} isSchedule
 * @param {*} supplySensor
 * @param {*} currentTime
 * @param {*} outsideTemp
 * @param {*} allowed_power
 * @param {*} current_power
 * @param {*} isDemand
 * @param {*} is_power_allowed
 * @param {*} override_limit
 * @param {*} setUnitTemp
 *
 * The code handles the behavior of a heat-cool HVAC unit based on conditions such as temperature, mode settings, and relay status.
 * It performs actions like turning the fan on/off and logging information.
 */
const heatCoolModule = async (id, specificUnit_tstat, within_outside_above, within_outside_below, set_temp, specificUnit_db, allUnitsDlc, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, override_type, relayType, isVentOrOcc, isSchedule, supplySensor, currentTime, outsideTemp, allowed_power, current_power, isDemand, is_power_allowed, override_limit, localStorage, setUnitTemp) => {
  const allowKeypadTempAdjust = specificUnit_db.allowKeypadTempAdjust;

  const preHeatTime = specificUnit_db.preHeatTime;
  const preCoolTime = specificUnit_db.preCoolTime;
  const hysterisis = specificUnit_db.heatCoolLimits.hysterisis;
  const minSwitchTime = specificUnit_db.heatCoolLimits.min_switch_time;
  const coolingPowerInfo = specificUnit_db.powerInformation.cooling_power_information;
  const heatingPowerInfo = specificUnit_db.powerInformation.heating_power_information;
  const unitType = specificUnit_db.unitType;
  const coolLowLimit = specificUnit_db.heatCoolLimits.cool_low_limit;
  const heatHiLimit = specificUnit_db.heatCoolLimits.heat_hi_limit;

  //get allowed power check and normal override time system data

  try {
    if (specificUnit_tstat.current_temp <= within_outside_above && specificUnit_tstat.current_temp > set_temp) {
      allUnitsDlc[id].dlcOperation = 'WITHIN ABOVE';
      logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE Condition Met - Relay status is ${specificUnit_tstat.relay_status}`);

      if (heatCoolMode === 'auto' && override_type === 'UNO' && preHeatTime.un_occ_ideal < specificUnit_tstat.current_temp && specificUnit_tstat.current_temp < preCoolTime.un_occ_ideal) {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE - Turn off unit`);

        if (specificUnit_tstat.relay_status !== relayType.off && heatCoolMode !== 'off') {
          await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.off);
          allUnitsDlc[id].relayStatus = relayType.off;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE - Status is already set to fan off`);
        }

        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL2/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Check supply temp < cool cutoff. Cool Cut Flag is ${cool_cut_flag}`);

        if (supplySensor.enabled && !cool_cut_flag && specificUnit_tstat.supply_temp < supplySensor.cut_off_cool) {
          cool_cut_flag = true;
          // Send alert 4 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Send alert 4 - Under supply limit`);
          await setTempAlert('Under Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be under ${supplySensor.cut_off_cool}. The compressor will be turned off until the supply temperature rises to prevent coil freeze. Immediate attention needed.`, 0, 5, id, 15, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Turn off compressor keep fan on until supply temp > cool cut in & End - Next Unit`);

          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Status is already set to fan on`);
          }
        } else if (cool_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Check supply temp > cool cut in time - turing on AC stage 1`);

          if (specificUnit_tstat.supply_temp > supplySensor.cut_in_cool) {
            cool_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
              allUnitsDlc[id].relayStatus = relayType.cool1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Status is already set to turn AC on stage 1`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Set AC to stage 1 & End`);

          if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
            allUnitsDlc[id].relayStatus = relayType.cool1;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC 2) - Status is already set to turn AC on stage 1`);
          }
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL1/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Check supply temp < cool cutoff. Supply temp is ${specificUnit_tstat.supply_temp}. Cool Cut Flag is ${cool_cut_flag}`);

        if (supplySensor.enabled && !cool_cut_flag && specificUnit_tstat.supply_temp < supplySensor.cut_off_cool) {
          cool_cut_flag = true;
          // Send alert 4 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Send alert 4 - Under supply limit`);
          await setTempAlert('Under Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be under ${supplySensor.cut_off_cool}. The compressor will be turned off until the supply temperature rises to prevent coil freeze. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Turn off compressor keep fan on until supply temp > cool cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Status is already set to fan on`);
          }
        } else if (cool_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Check supply temp > cool cut in time - turning on AC stage 1`);

          if (specificUnit_tstat.supply_temp > supplySensor.cut_in_cool) {
            cool_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
              allUnitsDlc[id].relayStatus = relayType.cool1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - Status is already set to turn AC on stage 1`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC) - End - Next Unit`);
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && (specificUnit_tstat.relay_status === relayType.off || specificUnit_tstat.relay_status === relayType.fan_on)) {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC NOT RUNNING) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
      } else if ((heatCoolMode == 'heat' || autoBasedLastHeatCoolMode === 'heat') && (heatCoolStatus === 'HEAT1/FAN' || heatCoolStatus === 'HEAT2/FAN')) {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Check supply temp > heat cutoff. supply temp is ${specificUnit_tstat.supply_temp}. Heat Cut Flag is ${heat_cut_flag}`);

        if (supplySensor.enabled && !heat_cut_flag && specificUnit_tstat.supply_temp > supplySensor.cut_off_heat) {
          heat_cut_flag = true;
          // Send alert 3 - Over supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Send alert 3 - Over supply limit`);
          await setTempAlert('Over Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be over ${supplySensor.cut_off_heat}. The heat will be turned off until the supply temperature cools to prevent unit damage. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Turn heat off keep running, until supply temp < heat cut in & End - Next`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Status is already set to fan on`);
          }
        } else if (heat_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Check supply temp > cool cut in time - turning on Heat stage 1`);

          if (specificUnit_tstat.supply_temp < supplySensor.cut_in_heat) {
            heat_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
              allUnitsDlc[id].relayStatus = relayType.heat1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Status is already set to turn Heat on stage 1`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (HEAT) - Leave Alone - End - Next Unit`);
        }
      } else {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (NO CONDITION MET) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
        logging.log(`[HCM] [UNIT ${id}] - WITHIN ABOVE (NO CONDITION MET) - Leave Alone - End - Next Unit`);
      }
    } else if (specificUnit_tstat.current_temp >= within_outside_below && specificUnit_tstat.current_temp < set_temp) {
      allUnitsDlc[id].dlcOperation = 'WITHIN BELOW';
      logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW - Checking if unit is in demand override limit.`);
      await demandMgmt.checkIfDemandSetHigh(id);

      logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW Condition Met - Relay status is ${specificUnit_tstat.relay_status}`);

      if (heatCoolMode === 'auto' && override_type === 'UNO' && preHeatTime.un_occ_ideal < specificUnit_tstat.current_temp && specificUnit_tstat.current_temp < preCoolTime.un_occ_ideal) {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW - Turn off unit`);

        if (specificUnit_tstat.relay_status !== relayType.off && heatCoolMode !== 'off') {
          await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.off);
          allUnitsDlc[id].relayStatus = relayType.off;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW - Status is already set to fan off`);
        }

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL1/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Check supply temp < cool cutoff. Cool Cut Flag is ${cool_cut_flag}`);

        if (supplySensor.enabled && !cool_cut_flag && specificUnit_tstat.supply_temp < supplySensor.cut_off_cool) {
          cool_cut_flag = true;
          // Send alert 4 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Send alert 4 - Under supply limit`);
          await setTempAlert('Under Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be under ${supplySensor.cut_off_cool}. The compressor will be turned off until the supply temperature rises to prevent coil freeze. Immediate attention needed.`, 0, 5, id, 15, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Turn off compressor keep fan on until supply temp > cool cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Status is already set to fan on`);
          }
        } else if (cool_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Check supply temp > cool cut in time - turing on AC stage 1`);

          if (specificUnit_tstat.supply_temp > supplySensor.cut_in_cool) {
            cool_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
              allUnitsDlc[id].relayStatus = relayType.cool1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Status is already set to turn AC on stage 1`);
            }
          }
        } else {
          if (supplySensor.enabled) {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Evaluate supply temp time`);

            await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.cool_alarm_delta, supplySensor.cool_current_time);
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
          }

          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC) - Leave Alone & End - Next Unit`);
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && (specificUnit_tstat.relay_status === relayType.off || specificUnit_tstat.relay_status === relayType.fan_on)) {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC NOT RUNNING) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (AC NOT RUNNING) - Leave Alone & End - Next Unit`);
      } else if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && heatCoolStatus === 'HEAT2/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Check supply temp > heat cutoff. Heat Cut Flag is ${heat_cut_flag}`);

        if (supplySensor.enabled && !heat_cut_flag && specificUnit_tstat.supply_temp > supplySensor.cut_off_heat) {
          heat_cut_flag = true;
          // Send alert 3 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Send alert 3 - Over supply limit`);
          await setTempAlert('Over Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be over ${supplySensor.cut_off_heat}. The heat will be turned off until the supply temperature cools to prevent unit damage. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Turn heat off, keep fan on on until supply temp < cool cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Status is already set to fan on`);
          }
        } else if (heat_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Check supply temp > cool cut in time - turning on Heat Stage 1`);

          if (specificUnit_tstat.supply_temp < supplySensor.cut_in_heat) {
            heat_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
              allUnitsDlc[id].relayStatus = relayType.heat1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Status is already set to turn Heat on stage 1`);
            }
          }
        } else {
          if (supplySensor.enabled) {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Evaluate supply temp time`);

            await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.heat_alarm_delta, supplySensor.heat_current_time);
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
          }
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Set to stage 1 & End - Next Unit`);

          if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
            allUnitsDlc[id].relayStatus = relayType.heat1;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT 2) - Status is already set to heat stage 1`);
          }
        }
      } else if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && heatCoolStatus === 'HEAT1/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Check supply temp > heat cutoff. Heat Cut Flag is ${heat_cut_flag}`);

        if (supplySensor.enabled && !heat_cut_flag && specificUnit_tstat.supply_temp > supplySensor.cut_off_heat) {
          heat_cut_flag = true;
          // Send alert 3 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Send alert 3 - Over supply limit`);
          await setTempAlert('Over Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be over ${supplySensor.cut_off_heat}. The heat will be turned off until the supply temperature cools to prevent unit damage. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Turn heat off, keep fan on until supply temp < heat cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Status is already set to fan on`);
          }
        } else if (heat_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Check supply temp > cool cut in time - turning on Heat stage 1`);

          if (specificUnit_tstat.supply_temp < supplySensor.cut_in_heat) {
            heat_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
              allUnitsDlc[id].relayStatus = relayType.heat1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Status is already set to turn Heat on stage 1`);
            }
          }
        } else {
          if (supplySensor.enabled) {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Evaluate supply temp time`);

            await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.heat_alarm_delta, supplySensor.heat_current_time);
          } else {
            logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
          }

          logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (HEAT) - Leave Alone & End - Next Unit`);
        }
      } else {
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (NO CONDITION MET) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
        logging.log(`[HCM] [UNIT ${id}] - WITHIN BELOW (NO CONDITION MET) - Leave Alone - End - Next Unit`);
      }
    } else if (specificUnit_tstat.current_temp > within_outside_above) {
      allUnitsDlc[id].dlcOperation = 'OUTSIDE ABOVE';
      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE Condition Met - Relay status is ${specificUnit_tstat.relay_status}`);

      if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && (specificUnit_tstat.relay_status === relayType.off || specificUnit_tstat.relay_status === relayType.fan_on)) {
        //getting last heat on time

        let isModeAuto = false;
        let lastHeatSwitchTime;

        if (heatCoolMode === 'auto') {
          let lastHeatON = await lastUnitStatus(id, 'heat');
          if (lastHeatON === undefined) {
            const zeroTime = moment().startOf('day');
            lastHeatON = zeroTime;
          }
          lastHeatSwitchTime = moment(lastHeatON).add(minSwitchTime, 'minutes');
          isModeAuto = true;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Mode is not auto`);
        }

        //getting last AC run
        let lastACTimeON = await lastUnitStatus(id, 'COOL1/FAN');
        if (lastACTimeON === undefined) {
          const zeroTime = moment().startOf('day');
          lastACTimeON = zeroTime;
        }
        const lastCoolSwitchTime = moment(lastACTimeON).add(coolingPowerInfo.decompression_time, 'minutes');

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Time since last heat + Min switch time < current time`);
        if (!isModeAuto || lastHeatSwitchTime.isBefore(currentTime)) {
          // calculate powers
          const powers = await calculatePower(id, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, coolingPowerInfo, heatingPowerInfo, unitType, 'cool', 'COOL1/FAN');
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - New power will be ${powers}`);
          const newStagePower = current_power + powers;

          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Check if stage 1 power < Allowed power`);
          if (newStagePower < parseFloat(allowed_power)) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Outside temp < AC External Limit`);
            if (outsideTemp < coolLowLimit) {
              // Send warning 13 - External temp too cold
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Send outdoor temp warning 13`);
              await setTempAlert('External temp too cold', `Warning: Unit ${id} compressor is not being turned on due to outside temperatures ${outsideTemp} below External temp limit ${coolLowLimit}.`, 0, 2, id, 10, 2, 2);

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Time since last AC run > decompression time. ${lastCoolSwitchTime.format('YYYY-MM-DD HH:mm')}`);

              if (lastCoolSwitchTime && lastCoolSwitchTime.isBefore(currentTime)) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Turn on AC stage 1 - End - Next Unit`);

                if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
                  await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
                  allUnitsDlc[id].relayStatus = relayType.cool1;
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Status is already set to turn on AC stage 1`);
                }
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
              }
            }
          } else {
            const isDemandFull = await demandMgmt.checkDemand(newStagePower, parseFloat(allowed_power), isDemand);
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Checking demand management`);
            if (isDemandFull) {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Demand management has been successful`);

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Outside temp < AC External Limit`);
              if (outsideTemp < coolLowLimit) {
                // Send warning 13 - External temp too cold
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Send outdoor temp warning 13`);
                await setTempAlert('External temp too cold', `Warning: Unit ${id} compressor is not being turned on due to outside temperatures ${outsideTemp} below External temp limit ${coolLowLimit}.`, 0, 2, id, 10, 2, 1);

                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Time since last AC run > decompression time`);

                if (lastCoolSwitchTime && lastCoolSwitchTime.isBefore(currentTime)) {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Turn on AC stage 1 - End - Next Unit`);

                  if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
                    await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
                    allUnitsDlc[id].relayStatus = relayType.cool1;
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Status is already set to turn on AC stage 1`);
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
                }
              }
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC NOT RUNNING) - Leave Alone - End - Next Unit`);
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL1/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check If Cooling Multi-stage selected`);

        if (coolingPowerInfo.multi_stage_capable) {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check supply temp < cool cutoff. Cool Cut Flag is ${cool_cut_flag}`);

          if (supplySensor.enabled && !cool_cut_flag && specificUnit_tstat.supply_temp < supplySensor.cut_off_cool) {
            cool_cut_flag = true;
            // Send alert 4 - Under supply limit
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Send alert 4 - Under supply limit`);
            await setTempAlert('Under Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be under ${supplySensor.cut_off_cool}. The compressor will be turned off until the supply temperature rises to prevent coil freeze. Immediate attention needed.`, 0, 5, id, 15, 100, 3);

            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Turn off compressor keep fan on until supply temp > cool cut in & End - Next Unit`);
            if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
              allUnitsDlc[id].relayStatus = relayType.fan_on;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to fan on`);
            }
          } else if (cool_cut_flag) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check supply temp > cool cut in time - turning on AC stage 1`);

            if (specificUnit_tstat.supply_temp > supplySensor.cut_in_cool) {
              cool_cut_flag = false;
              if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
                await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
                allUnitsDlc[id].relayStatus = relayType.cool1;
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to turn AC on stage 1`);
              }
            }
          } else {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Current temp > set temp + hysteresis + stage 2 trigger`);

            if (specificUnit_tstat.current_temp > set_temp + hysterisis + coolingPowerInfo.difference) {
              //getting last AC2 run
              let lastAC2TimeON = await lastUnitStatus(id, 'COOL2/FAN');

              if (lastAC2TimeON === undefined) {
                const zeroTime = moment().startOf('day');
                lastAC2TimeON = zeroTime;
              }
              const lastCool2SwitchTime = moment(lastAC2TimeON).add(coolingPowerInfo.decompression_time, 'minutes');

              // calculate powers
              const powers = await calculatePower(id, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, coolingPowerInfo, heatingPowerInfo, unitType, 'cool', 'COOL2/FAN');
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - New power will be ${powers}`);
              const newStagePower = current_power + powers;

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check if stage 2 power < Allowed power`);

              if (newStagePower < parseFloat(allowed_power)) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Outside temp > AC External Limit`);

                if (outsideTemp > coolLowLimit) {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Time since last AC2 run > decompression time`);
                  if (lastCool2SwitchTime && lastCool2SwitchTime.isBefore(currentTime)) {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Turn on AC stage 2 - Next Unit`);

                    if (specificUnit_tstat.relay_status !== relayType.cool2 && heatCoolMode !== 'off') {
                      await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool2);
                      allUnitsDlc[id].relayStatus = relayType.cool2;
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to turn on AC stage 2`);
                    }
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Leave Alone - End - Next Unit`);
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Turn off AC`);

                  if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
                    await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
                    allUnitsDlc[id].relayStatus = relayType.fan_on;
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to fan on`);
                  }

                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Evaluate Fan`);
                  //Evaluate fan module here
                  const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
                  if (fanEv === 0) {
                    allUnitsDlc[id].relayStatus = relayType.off;
                  } else if (fanEv === 1) {
                    allUnitsDlc[id].relayStatus = relayType.fan_on;
                  }

                  // Send warning 13 - External temp too cold
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Send warning 13 - Send outdoor temp warning 13`);
                  await setTempAlert('External temp too cold', `Warning: Unit ${id} compressor is not being turned on due to outside temperatures ${outsideTemp} below External temp limit ${coolLowLimit}.`, 0, 2, id, 10, 2, 2);
                }
              } else {
                const isDemandFull = await demandMgmt.checkDemand(newStagePower, parseFloat(allowed_power), isDemand);
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Checking demand management`);

                if (isDemandFull) {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Demand management has been successful`);

                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Outside temp > AC External Limit`);
                  if (outsideTemp > coolLowLimit) {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Time since last AC2 run > decompression time`);

                    if (lastCool2SwitchTime && lastCool2SwitchTime.isBefore(currentTime)) {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Turn on AC stage 2 - Next Unit`);

                      if (specificUnit_tstat.relay_status !== relayType.cool2 && heatCoolMode !== 'off') {
                        await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool2);
                        allUnitsDlc[id].relayStatus = relayType.cool2;
                      } else {
                        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to turn on AC stage 2`);
                      }
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Leave Alone - End - Next Unit`);
                    }
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Turn off AC`);

                    if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
                      await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
                      allUnitsDlc[id].relayStatus = relayType.fan_on;
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to fan on`);
                    }

                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Evaluate Fan`);
                    //Evaluate fan module here
                    const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
                    if (fanEv === 0) {
                      allUnitsDlc[id].relayStatus = relayType.off;
                    } else if (fanEv === 1) {
                      allUnitsDlc[id].relayStatus = relayType.fan_on;
                    }

                    // Send warning 13 - External temp too cold
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Send warning 13 - Send outdoor temp warning 13`);
                    await setTempAlert('External temp too cold', `Warning: Unit ${id} compressor is not being turned on due to outside temperatures ${outsideTemp} below External temp limit ${coolLowLimit}.`, 0, 2, id, 10, 2, 2);
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check if Allowed power override checked?`);

                  if (is_power_allowed) {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Check if Allow Keypad Selected/Enabled`);

                    if (allowKeypadTempAdjust.enabled) {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Leave Alone - End - Next Unit`);
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Allow Keypad not enabled`);
                      let normalOverrideTime = 0;
                      let overrideAllowed = {};
                      try {
                        const overrideTime = localStorage.getItem('normalOverrideTime');
                        if (overrideTime) {
                          overrideAllowed = JSON.parse(overrideTime);
                        }
                      } catch (e) {
                        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - ${e}`);
                      }

                      if (overrideAllowed.hasOwnProperty(id) && overrideAllowed[id].normalOverrideTime) {
                        if (moment().isBefore(overrideAllowed[id].normalOverrideTime)) {
                          // set_temp = preCoolTime.occ_ideal;
                          set_temp = preCoolTime.occ_high;
                          // write set temp for unit
                          if (specificUnit_tstat.set_temp !== set_temp) {
                            await setUnitTemp(id, specificUnit_tstat.device_manager_id, set_temp);
                          }
                          // Setting unit to AC stage 2
                          const isOccHigh = await checkIfOtherUnitsInOccHigh(id);
                          if (isOccHigh) {
                            if ((specificUnit_tstat.relay_status !== relayType.cool2 || specificUnit_tstat.set_temp !== set_temp) && heatCoolMode !== 'off') {
                              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool2);
                              allUnitsDlc[id].relayStatus = relayType.cool2;
                            } else {
                              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Status is already set to turn AC on stage 2`);
                            }
                          } else {
                            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Other units are not in occupied high`);
                          }
                        } else {
                          overrideAllowed[id] = {};
                        }
                      } else {
                        normalOverrideTime = moment(currentTime).add(override_limit, 'minutes');
                        overrideAllowed[id] = {
                          normalOverrideTime: normalOverrideTime,
                        };
                      }
                      localStorage.setItem('normalOverrideTime', JSON.stringify(overrideAllowed));
                    }
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Leave Alone - End - Next Unit`);
                  }
                }
              }
            } else {
              if (supplySensor.enabled) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Evaluate supply temp time`);

                await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.cool_alarm_delta, supplySensor.cool_current_time);
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
              }

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - Leave Alone - End - Next Unit`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC) - MultiStage Not Enabled - End - Next Unit`);
        }
      } else if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL2/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Supply temp < Cool cutoff. Cool Cut Flag is ${cool_cut_flag}`);

        if (supplySensor.enabled && !cool_cut_flag && specificUnit_tstat.supply_temp < supplySensor.cut_off_cool) {
          cool_cut_flag = true;
          // Send alert 4 - Under supply limit
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Send alert 4 - Under supply limit`);
          await setTempAlert('Under Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be under ${supplySensor.cut_off_cool}. The compressor will be turned off until the supply temperature rises to prevent coil freeze. Immediate attention needed.`, 0, 5, id, 15, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Turn off compressor keep fan on on until supply temp > cool cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Status is already set to fan on`);
          }
        } else if (cool_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Check supply temp > cool cut in time - turing on AC stage 1`);

          if (specificUnit_tstat.supply_temp > supplySensor.cut_in_cool) {
            cool_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.cool1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.cool1);
              allUnitsDlc[id].relayStatus = relayType.cool1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Status is already set to turn AC on stage 1`);
            }
          }
        } else {
          if (supplySensor.enabled) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Evaluate supply temp time`);

            await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.cool_alarm_delta, supplySensor.cool_current_time);
          } else {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
          }

          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (AC 2) - Leave Alone - Next Unit`);
        }
      } else if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && (heatCoolStatus === 'HEAT1/FAN' || heatCoolStatus === 'HEAT2/FAN')) {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (HEAT 1 or 2) - Turn off heat`);

        if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
          await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (HEAT 1 or 2) - Status is already set to fan on`);
        }
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (HEAT 1 or 2) - AutoSwitch Mode`);
        let autoBasedLastHeatCoolMode = await autoSwitchMode(id, heatCoolMode, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp);
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (HEAT 1 or 2) - Auto switch mode is ${autoBasedLastHeatCoolMode}`);

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (HEAT 1 or 2) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      } else {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (NO CONDITION MET) - AutoSwitch Mode`);

        let autoBasedLastHeatCoolMode = await autoSwitchMode(id, heatCoolMode, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp);
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (NO CONDITION MET) - Auto switch mode is ${autoBasedLastHeatCoolMode}`);

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE ABOVE (NO CONDITION MET) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      }
    } else if (specificUnit_tstat.current_temp < within_outside_below) {
      allUnitsDlc[id].dlcOperation = 'OUTSIDE BELOW';
      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW Condition Met - Relay status is ${specificUnit_tstat.relay_status}`);

      if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && (specificUnit_tstat.relay_status === relayType.off || specificUnit_tstat.relay_status === relayType.fan_on)) {
        //getting last heat on time

        let isModeAuto = false;
        let lastCoolSwitchTime;

        if (heatCoolMode === 'auto') {
          let lastCoolON = await lastUnitStatus(id, 'cool');
          if (lastCoolON === undefined) {
            const zeroTime = moment().startOf('day');
            lastCoolON = zeroTime;
          }
          lastCoolSwitchTime = moment(lastCoolON).add(minSwitchTime, 'minutes');
          isModeAuto = true;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Mode is not auto`);
        }

        //getting last HEAT run
        let lastHEATTimeON = await lastUnitStatus(id, 'HEAT1/FAN');
        if (lastHEATTimeON === undefined) {
          const zeroTime = moment().startOf('day');
          lastHEATTimeON = zeroTime;
        }

        const lastHEATSwitchTime = moment(lastHEATTimeON).add(coolingPowerInfo.decompression_time, 'minutes');

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Time since last cool + Min switch time < current time`);

        if (!isModeAuto || lastCoolSwitchTime.isBefore(currentTime)) {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Outside temp < heat External Limit`);

          if (outsideTemp < heatHiLimit) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Check if its heat pump`);

            if (unitType === 'heat_pump') {
              // calculate powers
              const powers = await calculatePower(id, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, coolingPowerInfo, heatingPowerInfo, unitType, 'heat', 'HEAT1/FAN');
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - New power will be ${powers}`);
              const newStagePower = current_power + powers;

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Check if stage 1 power > allowed power`);

              if (newStagePower < parseFloat(allowed_power)) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Time since last HEAT run > decompression time`);

                if (lastHEATSwitchTime && lastHEATSwitchTime.isBefore(currentTime)) {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Turn on heat stage 1 - End - Next Unit`);

                  if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
                    await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
                    allUnitsDlc[id].relayStatus = relayType.heat1;
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Status is already set to turn on HEAT stage 1`);
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Leave Alone - End - Next Unit`);
                }
              } else {
                const isDemandFull = await demandMgmt.checkDemand(newStagePower, parseFloat(allowed_power), isDemand);
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Checking demand management`);

                if (isDemandFull) {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Demand management has been successful`);

                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Time since last HEAT run > decompression time`);
                  if (lastHEATSwitchTime && lastHEATSwitchTime.isBefore(currentTime)) {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Turn on heat stage 1 - End - Next Unit`);

                    if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
                      await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
                      allUnitsDlc[id].relayStatus = relayType.heat1;
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Status is already set to turn on HEAT stage 1`);
                    }
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Leave Alone - End - Next Unit`);
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Leave Alone - End - Next Unit`);
                }
              }
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Turn on heat stage 1 - End - Next Unit`);

              if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
                await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
                allUnitsDlc[id].relayStatus = relayType.heat1;
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Status is already set to turn on HEAT stage 1`);
              }
            }
          } else {
            // Send warning 14 - External temp too cold
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Send outdoor temp warning 14`);

            await setTempAlert('External temp too hot', `Warning: Unit ${id} heat is not being turned on due to outside temperatures ${outsideTemp} above External temp limit ${heatHiLimit}.`, 0, 2, id, 11, 2, 2);

            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - End - Next Unit`);
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT NOT RUNNING) - Leave Alone - Next Unit`);
        }
      } else if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && heatCoolStatus === 'HEAT1/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Check If Heating Multi-stage selected`);

        if (heatingPowerInfo.multi_stage_capable) {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Check supply temp > heat cutoff. Heat Cut Flag is ${heat_cut_flag}`);

          if (supplySensor.enabled && !heat_cut_flag && specificUnit_tstat.supply_temp > supplySensor.cut_off_heat) {
            heat_cut_flag = true;
            // Send alert 3 - Over supply limit
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Send alert 3 - Over supply limit`);
            await setTempAlert('Over Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be over ${supplySensor.cut_off_heat}. The heat will be turned off until the supply temperature cools to prevent unit damage. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Turn off heat keep fan on until supply temp < heat cut in & End - Next Unit`);
            if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
              allUnitsDlc[id].relayStatus = relayType.fan_on;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Status is already set to fan on`);
            }
          } else if (heat_cut_flag) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Check supply temp < heat cut in time - turning on Heat Stage 1`);

            if (specificUnit_tstat.supply_temp < supplySensor.cut_in_heat) {
              heat_cut_flag = false;
              if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
                await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
                allUnitsDlc[id].relayStatus = relayType.heat1;
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Status is already set to turn Heat on stage 1`);
              }
            }
          } else {
            //getting last HEAT 2 run
            let lastHEAT2TimeON = await lastUnitStatus(id, 'HEAT2/FAN');
            if (lastHEAT2TimeON === undefined) {
              const zeroTime = moment().startOf('day');
              lastHEAT2TimeON = zeroTime;
            }

            const lastHEAT2SwitchTime = moment(lastHEAT2TimeON).add(coolingPowerInfo.decompression_time, 'minutes');

            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - current temp < set temp - hysteresis - stage 2 trigger`);

            if (specificUnit_tstat.current_temp < set_temp - hysterisis - coolingPowerInfo.difference) {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Outside temp < Heat External Limit`);

              if (outsideTemp < heatHiLimit) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Check if its heat pump`);

                if (unitType === 'heat_pump') {
                  // calculate powers
                  const powers = await calculatePower(id, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, coolingPowerInfo, heatingPowerInfo, unitType, 'heat', 'HEAT2/FAN');
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - New power will be ${powers}`);
                  const newStagePower = current_power + powers;

                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Check if stage 2 power < Allowed power`);
                  if (newStagePower < parseFloat(allowed_power)) {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Time since last HEAT 2 run > decompression time`);

                    if (lastHEAT2SwitchTime && lastHEAT2SwitchTime.isBefore(currentTime)) {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Turn on Heat stage 2 - Next Unit`);

                      if (specificUnit_tstat.relay_status !== relayType.heat2 && heatCoolMode !== 'off') {
                        await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat2);
                        allUnitsDlc[id].relayStatus = relayType.heat2;
                      } else {
                        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Status is already set to turn on HEAT stage 2`);
                      }
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Next Unit`);
                    }
                  } else {
                    // 'Check with demand management if other units can be turned off'
                    const isDemandFull = await demandMgmt.checkDemand(newStagePower, parseFloat(allowed_power), isDemand);
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Checking demand management`);

                    if (isDemandFull) {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Demand management has been successful`);

                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Time since last HEAT 2 run > decompression time`);

                      if (lastHEAT2SwitchTime && lastHEAT2SwitchTime.isBefore(currentTime)) {
                        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Turn on Heat stage 2 - Next Unit`);

                        if (specificUnit_tstat.relay_status !== relayType.heat2 && heatCoolMode !== 'off') {
                          await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat2);
                          allUnitsDlc[id].relayStatus = relayType.heat2;
                        } else {
                          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Status is already set to turn on HEAT stage 2`);
                        }
                      } else {
                        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Next Unit`);
                      }
                    } else {
                      logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Leave Alone - End - Next Unit`);
                    }
                  }
                } else {
                  logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Turn on Heat stage 2 - Next Unit`);

                  if (specificUnit_tstat.relay_status !== relayType.heat2 && heatCoolMode !== 'off') {
                    await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat2);
                    allUnitsDlc[id].relayStatus = relayType.heat2;
                  } else {
                    logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Status is already set to turn on HEAT stage 2`);
                  }
                }
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Evaluate Fan`);
                //Evaluate fan module here
                const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
                if (fanEv === 0) {
                  allUnitsDlc[id].relayStatus = relayType.off;
                } else if (fanEv === 1) {
                  allUnitsDlc[id].relayStatus = relayType.fan_on;
                }

                // Send warning 14 - External temp too cold
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Send warning 14 - Send outdoor temp warning 14`);
                await setTempAlert('External temp too hot', `Warning: Unit ${id} heat is not being turned on due to outside temperatures ${outsideTemp} above External temp limit ${heatHiLimit}.`, 0, 2, id, 11, 2, 2);
              }
            } else {
              if (supplySensor.enabled) {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Evaluate supply temp time`);

                await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.heat_alarm_delta, supplySensor.heat_current_time);
              } else {
                logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
              }

              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - Leave Alone - End - Next Unit`);
            }
          }
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT) - MultiStage Not Enabled - End - Next Unit`);
        }
      } else if ((heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') && heatCoolStatus === 'HEAT2/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Supply temp > Heat cutoff temp. Heat Cut Flag is ${heat_cut_flag}`);

        if (supplySensor.enabled && !heat_cut_flag && specificUnit_tstat.supply_temp > supplySensor.cut_off_heat) {
          heat_cut_flag = true;
          // Send alert 3 - Over supply limit
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Send alert 3 - Over supply limit`);
          await setTempAlert('Over Supply Limit', `Alert: Unit ${id} supply temperature is ${specificUnit_tstat.supply_temp}. Supply temp should not be over ${supplySensor.cut_off_heat}. The heat will be turned off until the supply temperature cools to prevent unit damage. Immediate attention needed.`, 0, 5, id, 16, 100, 3);

          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Turn off heat keep fan on until supply temp > heat cut in & End - Next Unit`);
          if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
            await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
            allUnitsDlc[id].relayStatus = relayType.fan_on;
          } else {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Status is already set to fan on`);
          }
        } else if (heat_cut_flag) {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Check supply temp < heat cut in time - turning Heat stage 1`);

          if (specificUnit_tstat.supply_temp < supplySensor.cut_in_heat) {
            heat_cut_flag = false;
            if (specificUnit_tstat.relay_status !== relayType.heat1 && heatCoolMode !== 'off') {
              await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.heat1);
              allUnitsDlc[id].relayStatus = relayType.heat1;
            } else {
              logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Status is already set to turn Heat on stage 1`);
            }
          }
        } else {
          if (supplySensor.enabled) {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Evaluate supply temp time`);

            await supplyTempTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.supply_temp, specificUnit_tstat.current_temp, supplySensor.heat_alarm_delta, supplySensor.heat_current_time);
          } else {
            logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Supply sensor in not enabled, please enable it to evaluate supply temp time`);
          }

          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (HEAT 2) - Next Unit`);
        }
      } else if (((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && heatCoolStatus === 'COOL1/FAN') || heatCoolStatus === 'COOL2/FAN') {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (COOL 1 or 2) - Turn off cool`);

        if (specificUnit_tstat.relay_status !== relayType.fan_on && heatCoolMode !== 'off') {
          await setRelayStatus(id, specificUnit_tstat.device_manager_id, relayType.fan_on);
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        } else {
          logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (COOL 1 or 2) - Status is already set to fan on`);
        }
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (COOL 1 or 2) - AutoSwitch Mode`);

        let autoBasedLastHeatCoolMode = await autoSwitchMode(id, heatCoolMode, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp);
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (COOL 1 or 2) - Auto switch mode is ${autoBasedLastHeatCoolMode}`);

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (COOL 1 or 2) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      } else {
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (NO CONDITION MET) - AutoSwitch Mode`);

        let autoBasedLastHeatCoolMode = await autoSwitchMode(id, heatCoolMode, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp);
        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (NO CONDITION MET) - Auto switch mode is ${autoBasedLastHeatCoolMode}`);

        logging.log(`[HCM] [UNIT ${id}] - OUTSIDE BELOW (NO CONDITION MET) - Evaluate Fan`);
        //Evaluate fan module here
        const fanEv = await fanEvaluation(id, isVentOrOcc || isSchedule);
        if (fanEv === 0) {
          allUnitsDlc[id].relayStatus = relayType.off;
        } else if (fanEv === 1) {
          allUnitsDlc[id].relayStatus = relayType.fan_on;
        }
      }
    }
  } catch (e) {
    logging.log(`[HCM] - Error: ${e}`);
  }
};

module.exports = heatCoolModule;
