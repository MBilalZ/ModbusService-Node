const config = require('../utils/config.js');
const logging = require('../utils/logging.js');
const request = require('../utils/request');
const moment = require('moment');
const deviceManager = require('../utils/deviceManager.js');
const { LocalStorage } = require('node-localstorage');
const { checkIfModeUpdated, checkIfFanUpdated, checkIfSetTempUpdated, checkIfRelayUpdated, checkIfFixRegisterUpdated, checkIfCalibrationUpdated, checkIfHumidityCalibrationUpdated, checkFan } = require('../utils/deviceManager.js');
const { default: axios } = require('axios');
const demandMgmt = require('../utils/demandMgmt.js');
const singleUnitDetails = require('../utils/singleUnitDetails.js');
const autoSwitchMode = require('../utils/autoSwitchMode.js');
const setTempAlert = require('../utils/sendTempAlerts.js');
const { checkIfTimerIsOn, evaluateFiveTwentyFive } = require('../utils/evaluateFiveTwentyFive.js');
const { evaluateFacilityPurgeTime, checkIfInPurgeTime } = require('../utils/facilityPurgeTime.js');
const { evaluateHumidityValue, checkIfHumidityIsRunning } = require('../utils/evaluateHumidity.js');
const { checkUnitType } = require('../helpers/relayTable');
const heatCoolModule = require('../utils/heatCoolModule.js');
const fetchSystemConfigData = require('../utils/fetchSystemConfigData.js');

var localStorage = new LocalStorage('localStore');

/**
 * @param {*} unit_number of the unit
 * @param {*} device_manager_id also known as port of the unit
 * @param {*} temp as the set temp
 * @returns nothing
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
      logging.log(`[DLC] - Unit set temp has been set successfully!`);
    } else {
      // sending response as error
      logging.log(`[DLC] - Unit set temp is not set! Please specify input parameters!`);
    }
  } catch (err) {
    logging.log(`[DLC] - Setting set temp error: ${err.message}`);
  }
};

/**
 * @param {*} unit_number of the unit
 * @param {*} device_manager_id also known as port of the unit
 * @param {*} state of the fan, true or false
 * @returns nothing
 */
const setRelayToFan = async (unit_number, device_manager_id, state) => {
  try {
    if (unit_number && device_manager_id) {
      const unit_info = localStorage.getItem('register_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id,
        state: state,
      };

      localStorage.setItem('register_info', JSON.stringify(unit_info_json));
      localStorage.setItem('register_info_updated', 'true');

      // sending response as success
      logging.log(`[DLC] - Unit register has been set successfully!`);
    } else {
      // sending response as error
      logging.log(`[DLC] - Unit register is not set! Please specify input parameters!`);
    }
  } catch (err) {
    logging.log(`[DLC] - Setting relay to fan error: ${err.message}`);
  }
};

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
    logging.log(`[DLC] - Outside temp error ${err}`);
  }
};

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns save specific unit override type
 */
const setOverrideType = async (unit, type, expire_time) => {
  let overrideData = {
    unit_number: unit,
    set_temp_type: type,
    hardware_override_expire: expire_time !== null ? expire_time.format('HH:mm') : '',
  };

  try {
    const overrideType = await request.post(config.set_override_type, overrideData);
    if (overrideType.data.status === 1) {
      logging.log(`[DLC] [UNIT ${unit}] - Override type ${type} is set`);
    } else {
      logging.log(`[DLC] [UNIT ${unit}] - Override type ${type} is not set.`);
    }
  } catch (e) {
    logging.log(`[DLC] [UNIT ${unit}] - ${e.response.data}`);
  }
};

/**
 *
 * @returns get peak time from db
 */
const getPeakHours = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.peak_time_hours);
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
    logging.log(`[DLC] - Peak hours time error ${err}`);
  }
};

/**
 *
 * @returns get current & allowed power from db
 */
const getPowerDLC = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.get_power_dlc);
    if (get_resp.data.status) {
      const { current_power, allowed_power } = get_resp.data.data;
      return { current_power, allowed_power };
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
    logging.log(`[DLC] - Powers error ${err}`);
  }
};

/**
 *
 * @returns get system data from db
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
 *
 * @param {*} unitId of the unit
 * @returns get unit offline time from db
 */
const getUnitOfflineTime = async (unitId) => {
  try {
    // axios call
    const get_resp = await request.get(config.get_unit_offline_time(unitId));
    if (get_resp.data.status) {
      return get_resp.data.data ? get_resp.data.data.running_time_in_minutes : null;
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
    logging.log(`[DLC] [UNIT ${unitId}] - Offline error ${err}`);
  }
};

const allUnitsDlc = {};

/**
 *
 * cron job method to implement all dlc controller logic
 */
const dlcOperations = async () => {
  try {
    const allUnitsData = await deviceManager.getUnitData();
    unitIds = Object.keys(allUnitsData);

    if (unitIds.length !== 0) {
      //getting outside temp
      const getOutsideTem = await getOutsideTemp();
      const outsideTemp = getOutsideTem ? parseFloat(getOutsideTem[0].temperature.toFixed(2)) : 0.0;

      //getting peak hours time
      const getPeakHoursTime = await getPeakHours();
      const peakTimeOn = getPeakHoursTime ? moment(getPeakHoursTime.peak_time_on, 'HH:mm') : null;
      const peakTimeOff = getPeakHoursTime ? moment(getPeakHoursTime.peak_time_off, 'HH:mm') : null;
      const peakDateStart = getPeakHoursTime ? moment(getPeakHoursTime.start_date_month, 'M-D') : null;
      const peakDateEnd = getPeakHoursTime ? moment(getPeakHoursTime.end_date_month, 'M-D') : null;

      //sending unit to fetch details of occupied hours and fan control
      for (const id of unitIds) {
        if (!allUnitsDlc.hasOwnProperty(id)) {
          allUnitsDlc[id] = {};
        }
        await checkIfModeUpdated();
        await checkIfFanUpdated();
        await checkIfCalibrationUpdated();
        await checkIfHumidityCalibrationUpdated();
        await checkFan();
        await checkIfSetTempUpdated();
        await checkIfRelayUpdated();
        await checkIfFixRegisterUpdated();

        const specificUnit_db = await singleUnitDetails(id);
        const specificUnit_tstat = allUnitsData[id];

        //get allowed power check and normal override time system data
        const { is_power_allowed, override_limit } = await getSystemData();
        //get current & allowed power
        const { allowed_power, current_power } = await getPowerDLC();

        let peakNotNull = false;
        if (peakTimeOn !== null && peakTimeOff !== null && peakDateStart !== null && peakDateEnd !== null) {
          peakNotNull = true;
        }

        if (specificUnit_tstat.hasOwnProperty('relay_status')) {
          // setting current tstat mode and status

          let heatCoolMode = '';
          if (specificUnit_tstat.mode_num === 3) {
            heatCoolMode = 'off';
          } else if (specificUnit_tstat.mode_num === 0) {
            heatCoolMode = 'auto';
          } else if (specificUnit_tstat.mode_num === 1) {
            heatCoolMode = 'cool';
          } else if (specificUnit_tstat.mode_num === 2) {
            heatCoolMode = 'heat';
          } else if (specificUnit_tstat.mode_num === 4) {
            heatCoolMode = 'vent';
          }

          if (heatCoolMode === 'off') {
            await setUnitTemp(id, specificUnit_tstat.current_temp);
            await setOverrideType(id, '', null);

            continue;
          }

          let heatCoolStatus = '';
          const relayType = checkUnitType(specificUnit_tstat.unit_type);
          switch (specificUnit_tstat.relay_status) {
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

          logging.log(`[DLC] [UNIT ${id}] is undergoing...**********************************************************`);
          logging.log(`[DLC] [UNIT ${id}] - CURRENT TEMP: ${specificUnit_tstat.current_temp}, SET TEMP: ${specificUnit_tstat.set_temp}, RELAY STATUS: ${specificUnit_tstat.relay_status}, MODE: ${heatCoolMode}, STATUS: ${heatCoolStatus}, DLC OPERATION: ${allUnitsDlc[id].dlcOperation}`);
          const currentTime = moment();

          //extracting data from API
          const minTemp = specificUnit_db.ventilationFanControl.min;
          const maxTemp = specificUnit_db.ventilationFanControl.max;
          const ventilationEnabled = specificUnit_db.ventilationFanControl.enabled;

          const coldTempAlarm = specificUnit_db.tempAlarms.cold;
          const warmTempAlarm = specificUnit_db.tempAlarms.warm;

          //setting start and end time
          let occStartTime = null;
          let occEndTime = null;
          let isVentOrOcc = false;
          let isSchedule = false;
          let scheduleSetTemp = null;

          const todayDay = moment().format('dddd');
          if (todayDay) {
            const OccHours = specificUnit_db.OccHours[todayDay.toLowerCase()];
            if (OccHours.start_time !== '' || OccHours.end_time !== '') {
              occStartTime = moment(OccHours.start_time, 'HH:mm');
              occEndTime = moment(OccHours.end_time, 'HH:mm');
              isVentOrOcc = currentTime.isBetween(occStartTime, occEndTime);
            } else {
              if (OccHours.schedule.length !== 0) {
                for (const schedule of OccHours.schedule) {
                  occStartTime = moment(schedule.start_time, 'HH:mm');
                  occEndTime = moment(schedule.end_time, 'HH:mm');
                  isSchedule = currentTime.isBetween(occStartTime, occEndTime);
                  if (isSchedule) {
                    scheduleSetTemp = schedule.temp;
                    break;
                  }
                }
              }
            }
          }

          const updateOverride = async () => {
            if (isVentOrOcc) {
              await setOverrideType(id, 'OCC', occEndTime);
            } else if (isSchedule) {
              await setOverrideType(id, 'S', occEndTime);
            } else if (specificUnit_db.active_holiday) {
              await setOverrideType(id, 'H', null);
            } else {
              let unoExpireTime = occStartTime;
              // check if occ time has passed
              if (currentTime.isAfter(occEndTime)) {
                let nextDay = moment(todayDay, 'dddd').add(1, 'days');
                let nextTimeSet = false;

                while (nextTimeSet === false) {
                  const occHours = specificUnit_db.OccHours[nextDay.format('dddd').toLowerCase()];

                  if (occHours.start_time !== '' || occHours.end_time !== '') {
                    unoExpireTime = moment(occHours.start_time, 'HH:mm');
                    nextTimeSet = true;
                  } else {
                    if (occHours.schedule.length !== 0) {
                      const schedule = occHours.schedule[0];
                      unoExpireTime = moment(schedule.start_time, 'HH:mm');
                      nextTimeSet = true;
                    }
                  }

                  nextDay = nextDay.add(1, 'days');
                }
              }
              await setOverrideType(id, 'UNO', unoExpireTime);
            }
          };

          if (ventilationEnabled) {
            allUnitsDlc[id].dlcOperation = 'Ventilation';
            allUnitsDlc[id].ventilationElse = true;
            //check if current time is during occupied hours
            if (isVentOrOcc || isSchedule || specificUnit_db.active_holiday) {
              //check if outside temp is greater than min temp and less than max temp
              if (outsideTemp > minTemp && outsideTemp < maxTemp) {
                //Start of evaluate fan operations

                //checking and setting fan on
                if (specificUnit_tstat.relay_status === 1) {
                  logging.log(`[DLC] [UNIT ${id}] - Fan is already on`);
                  allUnitsDlc[id].relayStatus = 1;

                  await updateOverride();

                  logging.log(`[DLC] [UNIT ${id}] - NEW SET TEMP: ${specificUnit_tstat.set_temp}, RELAY STATUS: ${allUnitsDlc[id].relayStatus}, DLC OPERATION: ${allUnitsDlc[id].dlcOperation}`);

                  continue;
                } else {
                  logging.log(`[DLC] [UNIT ${id}] - Fan is going to turn on`);

                  // write relay to 1 to turn on fan
                  await setRelayToFan(id, specificUnit_tstat.device_manager_id, true);
                  allUnitsDlc[id].relayStatus = 1;

                  await updateOverride();

                  logging.log(`[DLC] [UNIT ${id}] - NEW SET TEMP: ${specificUnit_tstat.set_temp}, RELAY STATUS: ${allUnitsDlc[id].relayStatus}, DLC OPERATION: ${allUnitsDlc[id].dlcOperation}`);

                  continue;
                }
                //End of evaluate fan operations
              } else {
                await updateOverride();
              }
            } else {
              logging.log(`[DLC] [UNIT ${id}] - Current time is not in occupied or schedule hours for ventilation`);
            }

            // checking and setting fan off
            if (specificUnit_tstat.relay_status === 0) {
              logging.log(`[DLC] [UNIT ${id}] - Fan is already off`);
              allUnitsDlc[id].relayStatus = 0;
            } else {
              logging.log(`[DLC] [UNIT ${id}] - Fan is going to turn off`);

              // write relay to 0 to turn off fan
              await setRelayToFan(id, specificUnit_tstat.device_manager_id, false);
              allUnitsDlc[id].relayStatus = 0;
            }

            await updateOverride();

            logging.log(`[DLC] [UNIT ${id}] - NEW SET TEMP: ${specificUnit_tstat.set_temp}, RELAY STATUS: ${allUnitsDlc[id].relayStatus}, DLC OPERATION: ${allUnitsDlc[id].dlcOperation}`);

            continue;
          } else {
            logging.log(`[DLC] [UNIT ${id}] - Ventilation is not enabled`);
            // checking and setting fan off
            if (allUnitsDlc[id].ventilationElse) {
              allUnitsDlc[id].relayStatus = 0;
              allUnitsDlc[id].ventilationElse = false;
              logging.log(`[DLC] [UNIT ${id}] - Fan is going to turn off. Ventilation is disabled`);

              let mode = '';
              if (specificUnit_tstat.mode_num === 4) {
                mode = 'vent';
              } else if (specificUnit_tstat.mode_num === 3) {
                mode = 'off';
              } else if (specificUnit_tstat.mode_num === 0) {
                mode = 'auto';
              } else if (specificUnit_tstat.mode_num === 1) {
                mode = 'cool';
              } else if (specificUnit_tstat.mode_num === 2) {
                mode = 'heat';
              }

              const params = {
                unit_number: parseInt(id),
                mode: mode,
              };

              const prevMode = await request.post(config.get_previous_mode, params);

              if (prevMode.data.data) {
                const newParams = {
                  unit_number: parseInt(id),
                  device_manager_id: specificUnit_tstat.device_manager_id,
                  mode: prevMode.data?.data?.mode,
                };

                await axios.post('http://localhost:5050/units/setUnitMode', newParams);
              }
            }
          }

          let autoBasedLastHeatCoolMode = await autoSwitchMode(id, heatCoolMode, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp);
          logging.log(`[DLC] [UNIT ${id}] - Auto switch mode is ${autoBasedLastHeatCoolMode}`);

          //Start of calculate zone set temp module
          const overrideExpTime = specificUnit_db.overrideExpTime;
          const setTemp = specificUnit_db.setTemp;
          const allowKeypadTempAdjust = specificUnit_db.allowKeypadTempAdjust;
          const activeEvent = specificUnit_db.activeEvent;
          const peakTimePrecool = specificUnit_db.peakTimePrecool;

          const peakPreCoolStart = peakTimeOn.clone().subtract(peakTimePrecool.precool_occ_time, 'minutes');

          const preHeatTime = specificUnit_db.preHeatTime;
          const preCoolTime = specificUnit_db.preCoolTime;
          const hysterisis = specificUnit_db.heatCoolLimits.hysterisis;

          const overrideTypeDB = specificUnit_db.overrideType;
          const hwExpireDB = specificUnit_db.hwExpire;

          let set_temp = 0;
          let isAlarm = false;
          let isDemand = false;

          //Start of Temperature Alarms/Alert Module...
          //Alert types:0 => error, 1 => success, 2 => warning, 3 => danger, 4 => info, 5 => alert

          //Outdoor temp alarms
          if (specificUnit_tstat.current_temp < coldTempAlarm) {
            // saving alert to db for current temp is less than cold temp alarm condition
            await setTempAlert('Under Zone Temp', `Alert: Unit ${id} current zone temperature is ${specificUnit_tstat.current_temp} and is under the set alarm temperature of ${coldTempAlarm}. Immediate attention needed.`, 0, 5, id, 2, 1, 2);
            logging.log(`[DLC] [UNIT ${id}] - Alert - Temperature is cold`);

            // if(heatCoolMode === 'auto' || heatCoolMode === 'heat')
            if (heatCoolMode === 'auto' || heatCoolMode === 'heat') {
              // updating set temp to occupied ideal temp
              if (specificUnit_tstat.set_temp !== preHeatTime.occ_ideal) {
                await setUnitTemp(id, specificUnit_tstat.device_manager_id, preHeatTime.occ_ideal);
              }
              set_temp = preHeatTime.occ_ideal;
            } else {
              set_temp = specificUnit_tstat.set_temp;
            }
            isAlarm = true;
            isDemand = true;
            // continue;
          } else if (specificUnit_tstat.current_temp > warmTempAlarm) {
            // saving alert to db for current temp is greater than warm temp alarm condition
            await setTempAlert('Over Zone Temp', `Alert: Unit ${id} current zone temperature is ${specificUnit_tstat.current_temp} and is over the set alarm temperature of ${warmTempAlarm}. Immediate attention needed.`, 0, 5, id, 1, 1, 2);
            logging.log(`[DLC] [UNIT ${id}] - Alert - Temperature is warm`);

            if (heatCoolMode === 'auto' || heatCoolMode === 'cool') {
              // updating set temp to occupied ideal temp
              if (specificUnit_tstat.set_temp !== preCoolTime.occ_high) {
                await setUnitTemp(id, specificUnit_tstat.device_manager_id, preCoolTime.occ_high);
              }
              set_temp = preCoolTime.occ_high;
            } else {
              set_temp = specificUnit_tstat.set_temp;
            }
            isAlarm = true;
            isDemand = true;
            // continue;
          }

          //Start of determine action for Cool/Heat Administration

          let isKeypadTempAdjust = false;
          let keypadTempAdjustSetTemp = null;
          let keypadTempAdjustEndTime = null;

          // keypad temp adjust logic
          if (allowKeypadTempAdjust.enabled) {
            if (allUnitsDlc[id].expired === false) {
              isKeypadTempAdjust = true;
              keypadTempAdjustSetTemp = allUnitsDlc[id].kpd_set_temp;
              keypadTempAdjustEndTime = allUnitsDlc[id].kpd_end_time;
            }

            if (allUnitsDlc[id].kpd_set_temp === '' || allUnitsDlc[id].kpd_set_temp === undefined) {
              keypadTempAdjustSetTemp = specificUnit_tstat.set_temp;
              keypadTempAdjustEndTime = currentTime.clone().add(allowKeypadTempAdjust.keypad_override_time, 'hours');

              allUnitsDlc[id].kpd_set_temp = keypadTempAdjustSetTemp;
              allUnitsDlc[id].kpd_end_time = keypadTempAdjustEndTime;
              allUnitsDlc[id].expired = false;

              isKeypadTempAdjust = true;
            } else if (allUnitsDlc[id].kpd_set_temp !== specificUnit_tstat.set_temp) {
              keypadTempAdjustSetTemp = specificUnit_tstat.set_temp;
              keypadTempAdjustEndTime = currentTime.clone().add(allowKeypadTempAdjust.keypad_override_time, 'hours');

              allUnitsDlc[id].kpd_set_temp = keypadTempAdjustSetTemp;
              allUnitsDlc[id].kpd_end_time = keypadTempAdjustEndTime;
              allUnitsDlc[id].expired = false;

              isKeypadTempAdjust = true;
            }

            if (allUnitsDlc[id].kpd_end_time && allUnitsDlc[id].kpd_end_time !== '') {
              if (currentTime.isAfter(allUnitsDlc[id].kpd_end_time)) {
                // allUnitsDlc[id].kpd_set_temp = '';
                allUnitsDlc[id].kpd_end_time = '';
                allUnitsDlc[id].expired = true;
                isKeypadTempAdjust = false;
              }
            }
          } else {
            allUnitsDlc[id].kpd_set_temp = '';
            allUnitsDlc[id].kpd_end_time = '';
            allUnitsDlc[id].expired = false;
          }

          logging.log(`[DLC] [UNIT ${id}] - Current power is ${current_power} & Allowed power is ${parseFloat(allowed_power)}`);

          let occHoursTime_cool = null;
          let occHoursTime_heat = null;
          const OccHours_temp = specificUnit_db.OccHours[todayDay.toLowerCase()];

          if (OccHours_temp.schedule.length !== 0) {
            for (const schedule of OccHours_temp.schedule) {
              occStartTime = moment(schedule.start_time, 'HH:mm');

              if (!currentTime.isAfter(occStartTime)) {
                occHoursTime_heat = occStartTime.clone().subtract(preHeatTime.preheat_time, 'minutes');
                occHoursTime_cool = occStartTime.clone().subtract(preCoolTime.precool_occ_time, 'minutes');
                break;
              }
            }
          } else if (occStartTime !== null) {
            occHoursTime_heat = occStartTime.clone().subtract(preHeatTime.preheat_time, 'minutes');
            occHoursTime_cool = occStartTime.clone().subtract(preCoolTime.precool_occ_time, 'minutes');
          }

          //set temperature based on different conditions
          let override_type = '';
          let active_holiday = false;
          let expire_time = null;

          if (!isAlarm) {
            if (overrideExpTime !== '') {
              logging.log(`[DLC] [UNIT ${id}] - Coming in override exp time condition`);
              set_temp = setTemp;
              override_type = 'M';
            } else if (isKeypadTempAdjust) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in allowed keypad temp adjust condition`);
              set_temp = keypadTempAdjustSetTemp;
              override_type = 'K';
              expire_time = keypadTempAdjustEndTime;
            } else if (activeEvent.length !== 0) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in active event condition`);
              set_temp = activeEvent[0].temp;
              override_type = 'E';
              expire_time = moment(activeEvent[0].end_time, 'HH:mm');
            } else if (specificUnit_db.active_holiday) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in holiday condition`);
              active_holiday = true;

              if (heatCoolMode === 'heat') {
                set_temp = preHeatTime.un_occ_ideal;
                logging.log(`[DLC] [UNIT ${id}] - Holiday Heat`);
              } else if (heatCoolMode === 'cool') {
                set_temp = preCoolTime.un_occ_ideal;
                logging.log(`[DLC] [UNIT ${id}] - Holiday Cool`);
              } else if (heatCoolMode === 'auto') {
                const tmp_chk = preCoolTime.un_occ_ideal - specificUnit_db.heatCoolLimits.hysterisis;
                logging.log(`[DLC] [UNIT ${id}] - Holiday Auto`);

                if (specificUnit_tstat.current_temp > tmp_chk) {
                  set_temp = preCoolTime.un_occ_ideal;
                  logging.log(`[DLC] [UNIT ${id}] - Holiday Auto - Cool`);
                } else {
                  set_temp = preHeatTime.un_occ_ideal;
                  logging.log(`[DLC] [UNIT ${id}] - Holiday Auto - Heat`);
                }
              }

              override_type = 'H';
            } else if (isSchedule) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in occupied schedule condition`);
              set_temp = scheduleSetTemp;
              override_type = 'S';
              expire_time = occEndTime;
            } else if (peakTimePrecool.precool_peak && peakNotNull && currentTime.isBetween(peakDateStart, peakDateEnd) && currentTime.isBetween(peakPreCoolStart, peakTimeOn) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in pre-peak cool condition`);
              set_temp = peakTimePrecool.occ_low;
              override_type = 'PPC';
              expire_time = peakTimeOn;
              isDemand = true;
            } else if (peakNotNull && currentTime.isBetween(peakDateStart, peakDateEnd) && currentTime.isBetween(peakTimeOn, peakTimeOff) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in peak time hours condition`);
              set_temp = preCoolTime.occ_high;
              override_type = 'P';
              expire_time = peakTimeOff;
              isDemand = true;
            } else if (preHeatTime.optimal_preheat_start && occStartTime && currentTime.isBetween(occHoursTime_heat, occStartTime) && (heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('heat')))) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in optimal pre heat time condition`);
              set_temp = preHeatTime.occ_ideal;
              override_type = 'OPH';
              expire_time = occStartTime;
              isDemand = true;
            } else if (preCoolTime.optimal_precool_start && occStartTime && currentTime.isBetween(occHoursTime_cool, occStartTime) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in optimal pre cool time condition`);
              set_temp = preCoolTime.occ_ideal;
              override_type = 'OPC';
              expire_time = occStartTime;
              isDemand = true;
            } else if (isVentOrOcc) {
              logging.log(`[DLC] [UNIT ${id}] - Coming in occupied hours`);

              isDemand = true;

              if (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool'))) {
                const demandCheck = await demandMgmt.checkIfDemandSetHigh(id);

                if (demandCheck) {
                  logging.log(`[DLC] [UNIT ${id}] - Demand set is high in demand management`);
                  set_temp = preCoolTime.occ_high;
                } else {
                  set_temp = preCoolTime.occ_ideal;
                }
              } else if (heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('heat'))) {
                set_temp = preHeatTime.occ_ideal;
              }
              override_type = 'OCC';
              expire_time = occEndTime;
            } else {
              logging.log(`[DLC] [UNIT ${id}] - Coming in unoccupied hours`);

              isDemand = true;

              if (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool'))) {
                const demandCheck = await demandMgmt.checkIfDemandSetHigh(id);

                if (demandCheck) {
                  logging.log(`[DLC] [UNIT ${id}] - Demand set is high in demand management`);
                  set_temp = preCoolTime.un_occ_high;
                  // expire_time = occStartTime;
                } else {
                  set_temp = preCoolTime.un_occ_ideal;
                  // expire_time = occStartTime;
                }
              } else if (heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('heat'))) {
                set_temp = preHeatTime.un_occ_ideal;
                // expire_time = occStartTime;
              }
              override_type = 'UNO';
            }

            logging.log(`[DLC] [UNIT ${id}] - Override type is ${override_type}`);

            // write set temp for unit
            if (set_temp !== 0 && specificUnit_tstat.set_temp !== set_temp) {
              allUnitsDlc[id].kpd_set_temp = set_temp;
              await setUnitTemp(id, specificUnit_tstat.device_manager_id, set_temp);
            }

            if (override_type === 'UNO') {
              let unoExpireTime = occStartTime;

              // check if occ time has passed
              if (currentTime.isAfter(occEndTime)) {
                let nextDay = moment(todayDay, 'dddd').add(1, 'days');
                let nextTimeSet = false;

                while (nextTimeSet === false) {
                  const occHours = specificUnit_db.OccHours[nextDay.format('dddd').toLowerCase()];

                  if (occHours.start_time !== '' || occHours.end_time !== '') {
                    unoExpireTime = moment(occHours.start_time, 'HH:mm');
                    nextTimeSet = true;
                  } else {
                    if (occHours.schedule.length !== 0) {
                      const schedule = occHours.schedule[0];
                      unoExpireTime = moment(schedule.start_time, 'HH:mm');
                      nextTimeSet = true;
                    }
                  }

                  nextDay = nextDay.add(1, 'days');
                }
              }

              expire_time = unoExpireTime;
            }

            // set override type for monitor ac page
            if (expire_time !== hwExpireDB || (overrideTypeDB !== override_type && override_type !== null)) {
              await setOverrideType(id, override_type, expire_time);
            }

            if (active_holiday) {
              continue;
            }
          } else {
            if (overrideExpTime !== '') {
              override_type = 'M';
            } else if (isKeypadTempAdjust) {
              override_type = 'K';
              expire_time = keypadTempAdjustEndTime;
            } else if (activeEvent.length !== 0) {
              override_type = 'E';
              expire_time = moment(activeEvent[0].end_time, 'HH:mm');
            } else if (specificUnit_db.active_holiday) {
              active_holiday = true;
              override_type = 'H';
            } else if (isSchedule) {
              override_type = 'S';
              expire_time = occEndTime;
            } else if (peakTimePrecool.precool_peak && peakNotNull && currentTime.isBetween(peakDateStart, peakDateEnd) && currentTime.isBetween(peakPreCoolStart, peakTimeOn) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              override_type = 'PPC';
              expire_time = peakTimeOn;
              isDemand = true;
            } else if (peakNotNull && currentTime.isBetween(peakDateStart, peakDateEnd) && currentTime.isBetween(peakTimeOn, peakTimeOff) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              override_type = 'P';
              expire_time = peakTimeOff;
              isDemand = true;
            } else if (preHeatTime.optimal_preheat_start && occStartTime && currentTime.isBetween(occHoursTime_heat, occStartTime) && (heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('heat')))) {
              override_type = 'OPH';
              expire_time = occStartTime;
              isDemand = true;
            } else if (preCoolTime.optimal_precool_start && occStartTime && currentTime.isBetween(occHoursTime_cool, occStartTime) && (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool' || (heatCoolMode === 'auto' && heatCoolStatus.toLowerCase().includes('cool')))) {
              override_type = 'OPC';
              expire_time = occStartTime;
              isDemand = true;
            } else if (isVentOrOcc) {
              isDemand = true;
              override_type = 'OCC';
              expire_time = occEndTime;
            } else {
              isDemand = true;
              override_type = 'UNO';
            }

            logging.log(`[DLC] [UNIT ${id}] - Override type is ${override_type} & Override time is ${expire_time}`);

            if (override_type === 'UNO') {
              let unoExpireTime = occStartTime;

              // check if occ time has passed
              if (currentTime.isAfter(occEndTime)) {
                let nextDay = moment(todayDay, 'dddd').add(1, 'days');
                let nextTimeSet = false;

                while (nextTimeSet === false) {
                  const occHours = specificUnit_db.OccHours[nextDay.format('dddd').toLowerCase()];

                  if (occHours.start_time !== '' || occHours.end_time !== '') {
                    unoExpireTime = moment(occHours.start_time, 'HH:mm');
                    nextTimeSet = true;
                  } else {
                    if (occHours.schedule.length !== 0) {
                      const schedule = occHours.schedule[0];
                      unoExpireTime = moment(schedule.start_time, 'HH:mm');
                      nextTimeSet = true;
                    }
                  }

                  nextDay = nextDay.add(1, 'days');
                }
              }

              expire_time = unoExpireTime;
            }

            // set override type for monitor ac page
            if (expire_time !== hwExpireDB || (overrideTypeDB !== override_type && override_type !== null)) {
              await setOverrideType(id, override_type, expire_time);
            }
          }
          //End of calculate zone set temp module

          const isFiveTwentyFiveTimerOn = await checkIfTimerIsOn(id);
          logging.log(`[DLC] [UNIT ${id}] - 5/25 timer is ${isFiveTwentyFiveTimerOn}`);

          if ((heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') && isFiveTwentyFiveTimerOn === true) {
            logging.log(`[DLC] [UNIT ${id}] - 5/25 timer is running, moving on to step 4`);
          } else {
            //Start of Heat/cool module
            const supplySensor = specificUnit_db.supplySensor;
            const within_outside_above = parseInt(set_temp) + hysterisis;
            const within_outside_below = parseInt(set_temp) - hysterisis;

            // Setting previous relay status
            allUnitsDlc[id].relayStatus = specificUnit_tstat.relay_status;

            logging.log(`[DLC] [UNIT ${id}] - Set temp + hysteresis is ${within_outside_above} & Set temp - hysteresis is ${within_outside_below}`);
            await heatCoolModule(id, specificUnit_tstat, within_outside_above, within_outside_below, set_temp, specificUnit_db, allUnitsDlc, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, override_type, relayType, isVentOrOcc, isSchedule, supplySensor, currentTime, outsideTemp, allowed_power, current_power, isDemand, is_power_allowed, override_limit, localStorage, setUnitTemp);
            //End of determine action for Cool/Heat Administration
          }

          //Start of 5/25 Evaluation (Step 4)
          logging.log(`[DLC] [UNIT ${id}] - Starting 5/25 Evaluation`);
          const tempLimit525 = specificUnit_db.tempLimit525;
          const is525Selected = specificUnit_db.fiveTwentyFiveEngaged;
          await evaluateFiveTwentyFive(id, heatCoolMode, autoBasedLastHeatCoolMode, heatCoolStatus, specificUnit_tstat.current_temp, specificUnit_tstat.supply_temp, specificUnit_tstat.device_manager_id, outsideTemp, is525Selected, tempLimit525, specificUnit_tstat.set_temp);
          const isFiveTwentyFiveOperation = await checkIfTimerIsOn(id);
          if (isFiveTwentyFiveOperation) {
            allUnitsDlc[id].dlcOperation = '5/25 Evaluation';
          }
          //End of 5/25 Evaluation

          //Start of Facility Purge (Step 4)
          logging.log(`[DLC] [UNIT ${id}] - Starting Facility Purge`);
          const facilityPurge = specificUnit_db.facilityPurge;
          const fanSettings = specificUnit_db.fanSettings;
          await evaluateFacilityPurgeTime(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.device_manager_id, facilityPurge, fanSettings);
          const isInPurgeTime = await checkIfInPurgeTime(id);
          if (isInPurgeTime) {
            allUnitsDlc[id].dlcOperation = 'Facility Purge';
          }
          //End of Facility Purge

          //Start of Evaluate humidity (Step 4)
          logging.log(`[DLC] [UNIT ${id}] - Starting Evaluate Humidity`);
          const humidityMonitoring = specificUnit_db.humidityMonitoring;
          const heatCoolLimits = specificUnit_db.heatCoolLimits;
          await evaluateHumidityValue(id, heatCoolMode, heatCoolStatus, specificUnit_tstat.relay_status, specificUnit_tstat.current_temp, specificUnit_tstat.set_temp, heatCoolLimits, humidityMonitoring, specificUnit_tstat.humidity, relayType, specificUnit_tstat.supply_temp, specificUnit_tstat.device_manager_id);
          const isHumidityIsRunning = await checkIfHumidityIsRunning(id);
          if (isHumidityIsRunning) {
            allUnitsDlc[id].dlcOperation = 'Humidity Running';
          }
          //End of Facility Purge

          logging.log(`[DLC] [UNIT ${id}] - NEW SET TEMP: ${set_temp}, RELAY STATUS: ${allUnitsDlc[id].relayStatus}, DLC OPERATION: ${allUnitsDlc[id].dlcOperation}`);
        } else {
          logging.log(`[DLC] [UNIT ${id}] - No data found`);
          const managed = specificUnit_db.managed;

          // check if unit is managed or not
          if (managed) {
            // Unit offline alarm
            const unitOfflineTime = await getUnitOfflineTime(id);
            const unitOfflineAlertTime = await fetchSystemConfigData('unit_offline_alert_time');
            if (unitOfflineTime >= (parseInt(unitOfflineAlertTime.unit_offline_alert_time) || 10)) {
              // saving alert to db for current temp is less than cold temp alarm condition
              await setTempAlert(`Unit ${id} off line`, `Alert: Unit ${id} is offline. Immediate attention needed.`, 0, 5, id, 21, 1, 1);
              logging.log(`[DLC] [UNIT ${id}] - Alert - Unit off line`);
            }
          } else {
            logging.log(`[DLC] [UNIT ${id}] - is unmanaged, cannot send alert to unmanaged units.`);
          }
        }
      }
    } else {
      logging.log('[DLC] - No units found in the database');
      return {};
    }
  } catch (err) {
    logging.log(`[DLC] - Err:  ${err}`);
  }
};

const dlcController = {
  dlcOperations,
  setRelayToFan,
  setUnitTemp,
};

module.exports = dlcController;
