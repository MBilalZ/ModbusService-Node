const logging = require('./logging');
const moment = require('moment');
const lastCoolRun = require('./lastCoolRun');
const setRelayStatus = require('./setRelayStatus');

let unitFiveTwentyFiveTimer = {};

/**
 *
 * @param {*} id
 * @param {*} heatCoolMode
 * @param {*} autoBasedMode
 * @param {*} heatCoolStatus
 * @param {*} currentTemp
 * @param {*} supplyTemp
 * @param {*} deviceManagerId
 * @param {*} outsideTemp
 * @param {*} tempLimit525
 * @param {*} setTemp
 *
 *
 * This code evaluates the "5/25" feature for a unit.
 * It checks if the unit meets specific conditions related to cooling mode, fan status, temperatures, and time.
 * If the conditions are met, it controls the compressor and sets a 5-minute timer.
 * Logging is included for tracking the evaluation process.
 */
const evaluateFiveTwentyFive = async (id, heatCoolMode, autoBasedMode, heatCoolStatus, currentTemp, supplyTemp, deviceManagerId, outsideTemp, is525Selected, tempLimit525, setTemp) => {
  if (unitFiveTwentyFiveTimer[id] === undefined) {
    unitFiveTwentyFiveTimer[id] = {
      timer: false,
      timerEndTime: 0,
    };
  }
  const currentTime = moment();
  logging.log(`[5/25] [UNIT ${id}] - Check is five twenty five engaged`);

  if (is525Selected) {
    logging.log(`[5/25] [UNIT ${id}] - Check if CT < Set Temp`);

    if (currentTemp < setTemp) {
      logging.log(`[5/25] [UNIT ${id}] - CT is less than set temp`);
      return -1;
    } else {
      logging.log(`[5/25] [UNIT ${id}] - Check if cool or auto/cool and status is fan`);

      if ((heatCoolMode === 'cool' || autoBasedMode === 'cool') && heatCoolStatus === 'FAN_ON') {
        logging.log(`[5/25] [UNIT ${id}] - Has compressor been off for 5 min for 5/25 timer?`);

        const isTimeOn = await checkIfTimerIsOn(id);
        logging.log(`[5/25] [UNIT ${id}] - 5/25 timer is ${isTimeOn}`);

        if (isTimeOn === false) {
          logging.log(`[5/25] [UNIT ${id}] - Check if CT > ST`);

          if (currentTemp > supplyTemp) {
            logging.log(`[5/25] [UNIT ${id}] - Turn compressor 1 back on`);

            if (heatCoolStatus !== 'COOL1/FAN' && heatCoolMode !== 'off') {
              await setRelayStatus(id, deviceManagerId, 9);
            } else {
              logging.log(`[5/25] [UNIT ${id}] - Status is already set to turn on turn compressor 1 back on || mode is off`);
            }
            return -1;
          } else {
            logging.log(`[5/25] [UNIT ${id}] - CT is not greater than ST`);
            return -1;
          }
        } else {
          logging.log(`[5/25] [UNIT ${id}] - 5 minutes is not passed, timer is still on`);
          return -1;
        }
      } else {
        logging.log(`[5/25] [UNIT ${id}] - Check if unit running AC Stage 1`);

        if ((heatCoolMode === 'cool' || autoBasedMode === 'cool') && heatCoolStatus === 'COOL1/FAN') {
          logging.log(`[5/25] [UNIT ${id}] - Check if supply temp below 60`);

          if (supplyTemp < 60) {
            logging.log(`[5/25] [UNIT ${id}] - Check if outside temp < 5/25 temp limit`);

            if (outsideTemp < tempLimit525) {
              logging.log(`[5/25] [UNIT ${id}] - Has Cool been on for 25 consecutive minutes?`);

              const lastCoolOn = await lastCoolRun(id, 'COOL1/FAN');
              logging.log(`[5/25] [UNIT ${id}] - Last COOL1/FAN on time ${lastCoolOn}`);

              if (lastCoolOn) {
                logging.log(`[5/25] [UNIT ${id}] - Last status is COOL1/FAN. Check if it has been running for 25 minutes`);
                const lastCoolOnTime = moment(lastCoolOn).add(25, 'minutes');

                if (currentTime.isAfter(lastCoolOnTime)) {
                  logging.log(`[5/25] - [UNIT ${id}] - COOL1/FAN has been running for 25 minutes`);

                  logging.log(`[5/25] [UNIT ${id}] - Turn compressor off for 5 minutes, start 5/25 timer, leave fan on`);

                  if (!unitFiveTwentyFiveTimer[id].timer) {
                    logging.log(`[5/25] [UNIT ${id}] - Starting 5/25 timer`);

                    unitFiveTwentyFiveTimer[id].timer = true;
                    unitFiveTwentyFiveTimer[id].timerEndTime = moment().add(5, 'minutes');

                    logging.log(`[5/25] [UNIT ${id}] - Turning off compressor, leave fan on`);

                    if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                      await setRelayStatus(id, deviceManagerId, 1);
                    } else {
                      logging.log(`[5/25] [UNIT ${id}] - Status is already set to fan on`);
                    }

                    return 1;
                  }
                } else {
                  logging.log(`[5/25] - [UNIT ${id}] - COOL1/FAN has not been running for 25 minutes`);
                  return -1;
                }
              }
            } else {
              logging.log(`[5/25] - [UNIT ${id}] - Outside temp is not less than 5/25 temp limit`);
              return -1;
            }
          } else {
            logging.log(`[5/25] [UNIT ${id}] - Supply temp is not below 60`);
            return -1;
          }
        } else {
          logging.log(`[5/25] [UNIT ${id}] - Unit not running in stage 1`);
          return -1;
        }
      }
    }
  } else {
    logging.log(`[5/25] [UNIT ${id}] - five twenty five not engaged`);
    return -1;
  }
};
/**
 * This code checks if the "5/25" timer is active for a unit.
 * It compares the timer end time with the current time and returns a boolean indicating the timer status.
 */
const checkIfTimerIsOn = async (id) => {
  logging.log(`[5/25] - [UNIT ${id}] - 5/25 timer end time is ${unitFiveTwentyFiveTimer[id]?.timerEndTime}`);

  if (unitFiveTwentyFiveTimer[id] === undefined || unitFiveTwentyFiveTimer[id].timerEndTime === 0) {
    return false;
  }
  const currentTime = moment();
  if (unitFiveTwentyFiveTimer[id].timerEndTime !== 0 && currentTime.isAfter(unitFiveTwentyFiveTimer[id].timerEndTime)) {
    unitFiveTwentyFiveTimer[id].timer = false;
    unitFiveTwentyFiveTimer[id].timerEndTime = 0;
    return false;
  }
  return true;
};

const fiveTwentyFiveEvaluation = {
  evaluateFiveTwentyFive,
  checkIfTimerIsOn,
};

module.exports = fiveTwentyFiveEvaluation;
