const logging = require('./logging');
const moment = require('moment');
const setRelayStatus = require('./setRelayStatus');
const checkHumidityRunTime = require('./checkHumidityRunTime');
const fetchSystemConfigData = require('./fetchSystemConfigData');
const setTempAlert = require('../utils/sendTempAlerts');
let humidityDlcOperations = {};

/**
 *
 * @param {*} id
 * @param {*} heatCoolMode
 * @param {*} heatCoolStatus
 * @param {*} relayStatus
 * @param {*} currentTemp
 * @param {*} setTemp
 * @param {*} heatCoolLimits
 * @param {*} humidityMonitoring
 * @param {*} humidity
 * @param {*} relayType
 * @param {*} supplyTemp
 * @param {*} deviceManagerId
 *
 * This code evaluates the humidity control feature for a unit.
 * It checks if the unit's humidity level exceeds the target humidity, triggering alerts and fan control.
 * It also handles scenarios where humidity falls below the target, turning off humidity control.
 * Logging is included for tracking the evaluation process.
 */
const evaluateHumidityValue = async (id, heatCoolMode, heatCoolStatus, relayStatus, currentTemp, setTemp, heatCoolLimits, humidityMonitoring, humidity, relayType, supplyTemp, deviceManagerId) => {
  logging.log(`[HC] [UNIT ${id}] - Check is humidity control selected`);

  if (humidityMonitoring.enabled) {
    if (humidityDlcOperations[id] === undefined) {
      humidityDlcOperations[id] = {
        humiditySelected: false,
      };
    }

    logging.log(`[HC] [UNIT ${id}] - Is humidity > Target humidity`);

    if (humidity > humidityMonitoring.target_humidity) {
      logging.log(`[HC] [UNIT ${id}] - Is humidity running`);

      if (relayStatus === relayType.coolh || relayStatus === relayType.cool2h) {
        logging.log(`[HC] [UNIT ${id}] - Has humidity been > 65% for more than 3 hrs`);

        // // Get value from backend side and replace
        const isHumidityInRunTime = await checkHumidityRunTime();

        if (isHumidityInRunTime) {
          logging.log(`[HC] [UNIT ${id}] - Send humidity Alert`);

          const humidityTime = await fetchSystemConfigData('humidity_time');
          const humidityPercentage = await fetchSystemConfigData('humidity_percentage');

          // code for sending humidity alert
          await setTempAlert(`Humidity ${humidity} > ${parseInt(humidityPercentage.humidity_percentage)}% for ${parseInt(humidityTime.humidity_time)} hrs`, `Alert: Unit ${id} humidity has been over ${parseInt(humidityPercentage.humidity_percentage)}% for more than ${parseInt(humidityTime.humidity_time)} hours.`, 0, 5, id, 17, 1, 2);
          logging.log(`[HC] [UNIT ${id}] - Alert - Humidity ${humidity} > ${parseInt(humidityPercentage.humidity_percentage)}% for ${parseInt(humidityTime.humidity_time)} hrs`);

          logging.log(`[HC] [UNIT ${id}] - Is supply temp < 65`);

          if (supplyTemp < 65) {
            logging.log(`[HC] [UNIT ${id}] - Reheat not working, Send reheat alert`);

            // code for sending humidity alert
            await setTempAlert(`Humidity Reheat Not Working`, `Alert: Unit ${id} humidity reheat not working. Supply temp ${parseInt(supplyTemp)} < 65 when using reheat.`, 0, 5, id, 18, 1, 6);
            logging.log(`[HC] [UNIT ${id}] - Alert - Humidity Reheat Not Working`);

            logging.log(`[HC] [UNIT ${id}] - Is Current Temp < Set Temp - Hysteresis`);

            if (currentTemp < parseInt(setTemp) - heatCoolLimits.hysterisis) {
              logging.log(`[HC] [UNIT ${id}] - Set unit to fan only`);

              // code to turn fan on
              logging.log(`[HC] [UNIT ${id}] - Turn fan on`);

              if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                await setRelayStatus(id, deviceManagerId, 1);
              } else {
                logging.log(`[HC] [UNIT ${id}] - Status is already set to fan on`);
              }
              return 1;
            } else {
              logging.log(`[HC] [UNIT ${id}] - Current Temp is not less than Set Temp - Hysteresis`);
              return -1;
            }
          } else {
            logging.log(`[HC] [UNIT ${id}] - Is Current Temp < Set Temp - Hysteresis`);

            if (currentTemp < parseInt(setTemp) - heatCoolLimits.hysterisis) {
              logging.log(`[HC] [UNIT ${id}] - Set unit to fan only`);

              // code to turn fan on
              logging.log(`[HC] [UNIT ${id}] - Turn fan on`);

              if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                await setRelayStatus(id, deviceManagerId, 1);
              } else {
                logging.log(`[HC] [UNIT ${id}] - Status is already set to fan on`);
              }
              return 1;
            } else {
              logging.log(`[HC] [UNIT ${id}] - Current Temp is not less than Set Temp - Hysteresis`);
              return -1;
            }
          }
        } else {
          logging.log(`[HC] [UNIT ${id}] - Is supply temp < 65`);

          if (supplyTemp < 65) {
            logging.log(`[HC] [UNIT ${id}] - Reheat not working, Send reheat alert`);

            // code for sending humidity alert
            await setTempAlert(`Humidity Reheat Not Working`, `Alert: Unit ${id} humidity reheat not working. Supply temp ${parseInt(supplyTemp)} < 65 when using reheat.`, 0, 5, id, 18, 1, 6);
            logging.log(`[HC] [UNIT ${id}] - Alert - Humidity Reheat Not Working`);

            logging.log(`[HC] [UNIT ${id}] - Is Current Temp < Set Temp - Hysteresis`);

            if (currentTemp < parseInt(setTemp) - heatCoolLimits.hysterisis) {
              logging.log(`[HC] [UNIT ${id}] - Set unit to fan only`);

              // code to turn fan on
              logging.log(`[HC] [UNIT ${id}] - Turn fan on`);

              if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                await setRelayStatus(id, deviceManagerId, 1);
              } else {
                logging.log(`[HC] [UNIT ${id}] - Status is already set to fan on`);
              }
              return 1;
            } else {
              logging.log(`[HC] [UNIT ${id}] - Current Temp is not less than Set Temp - Hysteresis`);
              return -1;
            }
          } else {
            logging.log(`[HC] [UNIT ${id}] - Is Current Temp < Set Temp - Hysteresis`);

            if (currentTemp < parseInt(setTemp) - heatCoolLimits.hysterisis) {
              logging.log(`[HC] [UNIT ${id}] - Set unit to fan only`);

              // code to turn fan on
              logging.log(`[HC] [UNIT ${id}] - Turn fan on`);

              if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                await setRelayStatus(id, deviceManagerId, 1);
              } else {
                logging.log(`[HC] [UNIT ${id}] - Status is already set to fan on`);
              }
              return 1;
            } else {
              logging.log(`[HC] [UNIT ${id}] - Current Temp is not less than Set Temp - Hysteresis`);
              return -1;
            }
          }
        }
      } else {
        logging.log(`[HC] [UNIT ${id}] - Is humidity > target + Tol`);

        if (humidity > humidityMonitoring.target_humidity + humidityMonitoring.tolerance) {
          logging.log(`[HC] [UNIT ${id}] - Is humidity control enabled?`);

          if (humidityMonitoring.humidity_control) {
            logging.log(`[HC] [UNIT ${id}] - Turn on humidity control`);

            // code to turn humidity control on
            if (relayStatus === relayType.cool1) {
              await setRelayStatus(id, deviceManagerId, relayType.coolh);
            } else if (relayStatus === relayType.cool2) {
              await setRelayStatus(id, deviceManagerId, relayType.cool2h);
            } else {
              logging.log(`[HC] [UNIT ${id}] - Relay status if off or fan on`);
            }

            humidityDlcOperations[id].humiditySelected = true;
            return 1;
          } else {
            logging.log(`[HC] [UNIT ${id}] - Humidity control is not enabled`);
            return -1;
          }
        } else {
          logging.log(`[HC] [UNIT ${id}] - Humidity is not greater than target humidity + Tol`);
          return -1;
        }
      }
    } else {
      logging.log(`[HC] [UNIT ${id}] - Humidity is not greater than target humidity`);
      logging.log(`[HC] [UNIT ${id}] - Is humidity running`);

      if (relayStatus === relayType.coolh || relayStatus === relayType.cool2h) {
        logging.log(`[HC] [UNIT ${id}] - Is humidity < target - Tol`);

        if (humidity < humidityMonitoring.target_humidity - humidityMonitoring.tolerance) {
          logging.log(`[HC] [UNIT ${id}] - Is Current Temp < Set Temp - Hysteresis`);

          if (currentTemp < parseInt(setTemp) - heatCoolLimits.hysterisis) {
            logging.log(`[HC] [UNIT ${id}] - Turn off humidity`);

            // code for turning of humidity
            if (relayStatus === relayType.coolh) {
              await setRelayStatus(id, deviceManagerId, relayType.cool1);
            } else if (relayStatus === relayType.cool2h) {
              await setRelayStatus(id, deviceManagerId, relayType.cool2);
            } else {
              logging.log(`[HC] [UNIT ${id}] - Relay status if off or fan on`);
            }
            humidityDlcOperations[id].humiditySelected = false;
            return 1;
          } else {
            logging.log(`[HC] [UNIT ${id}] - Current Temp is not less than Set Temp - Hysteresis`);
            return -1;
          }
        } else {
          logging.log(`[HC] [UNIT ${id}] - Humidity is not less than target humidity - Tol`);
          return -1;
        }
      } else {
        logging.log(`[HC] [UNIT ${id}] - Humidity is not running`);
        return -1;
      }
    }
  } else {
    logging.log(`[HC] [UNIT ${id}] - Humidity control is not selected`);
    return -1;
  }
};

/**
 * This code checks if the humidity control is running for a specific unit.
 * It verifies the presence of humidity control operations for the unit and returns the status of whether humidity control is selected or not.
 */
const checkIfHumidityIsRunning = async (id) => {
  if (humidityDlcOperations[id] === undefined) {
    return false;
  }

  return humidityDlcOperations[id].humiditySelected;
};

const evaluateHumidity = {
  evaluateHumidityValue,
  checkIfHumidityIsRunning,
};

module.exports = evaluateHumidity;
