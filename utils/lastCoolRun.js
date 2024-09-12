const request = require('./request');
const config = require('./config');
const logging = require('./logging');

/**
 * @param {string} unit
 * @param {string} status
 *
 * @returns get time when cool 1 run first time from now
 *
 * The function retrieves the timestamp of the last cooling operation for a specific HVAC unit.
 * It sends a request to the server and returns the timestamp if successful, otherwise logs an error message.
 */
const lastCoolRun = async (unit, status) => {
  let statusData = {
    unit_number: unit,
    status: status,
  };
  try {
    // axios call
    const get_resp = await request.post(config.get_last_cool_run, statusData);

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
    logging.log(`[LCR] [UNIT ${unit}] - ${err}`);
    return false;
  }
};

module.exports = lastCoolRun;
