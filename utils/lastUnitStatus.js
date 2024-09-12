const request = require('./request');
const config = require('./config');
const logging = require('./logging');

/**
 * @param {string} unit
 * @param {string} status
 *
 * @returns get last status of particular unit from db
 *
 * The lastUnitStatus function fetches the timestamp of the last status change for a given HVAC unit.
 * It logs any errors encountered during the process.
 */
const lastUnitStatus = async (unit, status) => {
  let statusData = {
    unit_number: unit,
    status: status,
  };
  try {
    // axios call
    const get_resp = await request.post(config.get_last_status_dlc, statusData);
    if (get_resp.data.status) {
      return get_resp.data.data.created_at;
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
    logging.log(`[LUS] [UNIT ${unit}] - ${err}`);
  }
};

module.exports = lastUnitStatus;
