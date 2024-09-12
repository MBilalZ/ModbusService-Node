const logging = require('./logging');
const moment = require('moment');
const setRelayStatus = require('./setRelayStatus');
let facilityPurgeDlcOperations = {};

/**
 *
 * @param {*} id
 * @param {*} heatCoolMode
 * @param {*} heatCoolStatus
 * @param {*} deviceManagerId
 * @param {*} facilityPurge
 * @param {*} fanSettings
 * 
 * This code evaluates and controls the facility purge time for a unit based on specific conditions, including the current time, selected purge times, heat/cool status, and fan settings. 
 * Logging is included for tracking the process.
 */
const evaluateFacilityPurgeTime = async (id, heatCoolMode, heatCoolStatus, deviceManagerId, facilityPurge, fanSettings) => {
  logging.log(`[FP] [UNIT ${id}] - Check is Facility Purge selected`);

  if (facilityPurge.enabled) {
    if (facilityPurgeDlcOperations[id] === undefined) {
      facilityPurgeDlcOperations[id] = {
        facilityPurgeSelected: false,
      };
    }

    const currentTime = moment();
    const todayDay = moment().format('dddd');
    const purges = facilityPurge.purges;

    let purgeTimeNotFound = true;

    Object.keys(purges).forEach(async (purgeKey) => {
      const purge = purges[purgeKey];
      const purgeTime = purge[todayDay.toLowerCase()];
      console.log(`${purgeKey}: ${purgeTime ? purgeTime : 'No time'}`);

      if (purgeTime !== '') {
        const purgeTimeMoment = moment(purgeTime, 'HH:mm');
        const purgeRunTime = purgeTimeMoment.clone().add(facilityPurge.purge_run_time, 'minutes');

        logging.log(`[FP] [UNIT ${id}] - Check if now > purge time and < purge time + purge run time this weekday`);
        logging.log(`[FP] [UNIT ${id}] - Current time ${currentTime}`);
        logging.log(`[FP] [UNIT ${id}] - PurgeStartTime ${purgeTimeMoment}`);
        logging.log(`[FP] [UNIT ${id}] - PurgeRunTime ${purgeRunTime}`);

        if (currentTime.isBetween(purgeTimeMoment, purgeRunTime)) {
          logging.log(`[FP] [UNIT ${id}] - Is in ${purgeKey} time`);

          logging.log(`[FP] [UNIT ${id}] - Check if status in heat or cool`);
          if (heatCoolStatus === 'COOL1/FAN' || heatCoolStatus === 'COOL2/FAN' || heatCoolStatus === 'HEAT1/FAN' || heatCoolStatus === 'HEAT2/FAN') {
            logging.log(`[FP] [UNIT ${id}] - Status in heat or cool`);
            return -1;
          } else {
            logging.log(`[FP] [UNIT ${id}] - Check if fan running in occupied hours`);


            if (fanSettings.fresh_air.mode === 'occupied_hours') {
              logging.log(`[FP] [UNIT ${id}] - Fan running in occupied hours`);
              return -1;
            } else {
              facilityPurgeDlcOperations[id].facilityPurgeSelected = true;
              logging.log(`[FP] [UNIT ${id}] - Turn fan on`);

              if (heatCoolStatus !== 'FAN_ON' && heatCoolMode !== 'off') {
                await setRelayStatus(id, deviceManagerId, 1);
              } else {
                logging.log(`[FP] [UNIT ${id}] - Status is already set to fan on`);
              }
              return 1;
            }
          }
        }
        purgeTimeNotFound = false;
        // else {
        //   purgeTimeNotFound = true;
        // }
      }
    });

    if (purgeTimeNotFound) {
      logging.log(`[FP] [UNIT ${id}] - No purge time found for today`);

      logging.log(`[FP] [UNIT ${id}] - Check if status in heat or cool`);
      if (heatCoolStatus === 'COOL1/FAN' || heatCoolStatus === 'COOL2/FAN' || heatCoolStatus === 'HEAT1/FAN' || heatCoolStatus === 'HEAT2/FAN') {
        logging.log(`[FP] [UNIT ${id}] - Status in heat or cool`);
        return -1;
      } else {
        logging.log(`[FP] [UNIT ${id}] - Check if fan running in occupied hours`);

        if (fanSettings.fresh_air.mode === 'occupied_hours') {
          logging.log(`[FP] [UNIT ${id}] - Fan running in occupied hours`);
          return -1;
        } else {
          facilityPurgeDlcOperations[id].facilityPurgeSelected = false;
          logging.log(`[FP] [UNIT ${id}] - Turn fan off`);

          if (heatCoolStatus !== 'OFF' && heatCoolMode !== 'off') {
            await setRelayStatus(id, deviceManagerId, 0);
          } else {
            logging.log(`[FP] [UNIT ${id}] - Status is already set to fan off`);
          }
          return 1;
        }
      }
    }
  } else {
    logging.log(`[FP] [UNIT ${id}] - Facility Purge is not selected`);
  }
};

/**
 * This code checks if a unit is currently in the facility purge time based on the stored data for that unit.
 */
const checkIfInPurgeTime = async (id) => {
  if (facilityPurgeDlcOperations[id] === undefined) {
    return false;
  }

  return facilityPurgeDlcOperations[id].facilityPurgeSelected;
};

const facilityPurgeTime = {
  evaluateFacilityPurgeTime,
  checkIfInPurgeTime,
};

module.exports = facilityPurgeTime;
