const config = require('./config');
const logging = require('./logging');
const request = require('./request');
const setTempAlert = require('./sendTempAlerts');

/**
 *
 * @returns unit running time in minutes
 *
 * This code retrieves the running time of a specific unit in minutes based on its ID and mode.
 * Returns the running time if successful, otherwise logs an error message.
 */
const getUnitRunningTime = async (unitId, status) => {
  try {
    // axios call
    const get_resp = await request.get(config.get_unit_running_time(unitId, status));
    if (get_resp.data.status) {
      return get_resp.data.data ? get_resp.data.data.difference_in_minutes : 0;
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
    logging.log(`[STT] [UNIT ${unitId}] - ${err}`);
  }
};

/**
 *
 * @param {*} unitId Unit id
 * @param {*} heatCoolMode Unit mode
 * @param {*} heatCoolStatus unit status
 * @param {*} supplyTemp unit supply temp
 * @param {*} currentTemp unit current temp
 * @param {*} alarmDeltaTemp unit alarm delta temp (heat/cool)
 * @param {*} testTime unit test time (heat/cool) in minutes
 *
 * @returns to the condition from where it called
 *
 * Checks if the unit's supply temperature is within the expected range based on current temperature, alarm delta, and running time.
 * Logs alerts if not in range, otherwise continues with the evaluation.
 */
const supplyTempTime = async (unitId, heatCoolMode, heatCoolStatus, supplyTemp, currentTemp, alarmDeltaTemp, testTime) => {
  const overCoolSupply = currentTemp - alarmDeltaTemp;
  const underHeatSupply = currentTemp + alarmDeltaTemp;

  const overCoolSupplyTemp = parseFloat(overCoolSupply.toFixed(2));
  const underHeatSupplyTemp = parseFloat(underHeatSupply.toFixed(2));

  const unitRunningTime = await getUnitRunningTime(unitId, heatCoolStatus);

  if (heatCoolMode === 'cool') {
    logging.log(`[STT] [UNIT ${unitId}] - Unit running time is ${unitRunningTime}`);
    if (unitRunningTime > testTime) {
      logging.log(`[STT] [UNIT ${unitId}] - Unit running Cool > Cool Test time. overCoolSupplyTemp is ${overCoolSupplyTemp}`);
      if (supplyTemp < overCoolSupplyTemp) {
        logging.log(`[STT] [UNIT ${unitId}] - Supply temp < Current temp - Cool Alarm`);
        return -1;
      } else {
        // saving alert to db for Supply temp < Current temp - Cool alarm condition
        logging.log(`[STT] [UNIT ${unitId}] - Send Alert 5 - Unit not cooling`);
        await setTempAlert('Over Cool Supply Temp', `Alert: Unit ${unitId} is not cooling. Supply temperature is ${supplyTemp}. Expected temperature is ${overCoolSupplyTemp}.`, 0, 5, unitId, 3, 1, 3);
      }
    } else {
      return -1;
    }
  } else if (heatCoolMode === 'heat') {
    logging.log(`[STT] [UNIT ${unitId}] - Unit running time is ${unitRunningTime}`);
    if (unitRunningTime > testTime) {
      logging.log(`[STT] [UNIT ${unitId}] - Unit running Heat > Heat Test Time. underHeatSupplyTemp is ${underHeatSupplyTemp}`);
      if (supplyTemp > underHeatSupplyTemp) {
        logging.log(`[STT] [UNIT ${unitId}] - Supply Temp > Current temp + Heat Alarm`);
        return -1;
      } else {
        // saving alert to db for Supply temp > Current temp + Heat alarm condition
        logging.log(`[STT] [UNIT ${unitId}] - Send Alert 6 - Unit not heating`);
        await setTempAlert('Under Heat Supply Temp', `Alert: Unit ${unitId} is not heating. Supply temperature is ${supplyTemp}. Expected temperature is ${underHeatSupplyTemp}.`, 0, 5, unitId, 4, 1, 3);
      }
    } else {
      return -1;
    }
  }
};

const evaluateSupplyTempTime = {
  supplyTempTime,
};

module.exports = evaluateSupplyTempTime;
