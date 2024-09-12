const request = require('./request');
const config = require('./config');

/**
 * @param {string} unit
 * @param {string} mode
 *
 * @returns get last mode of particular unit from db
 *
 * This code retrieves the timestamp of the last mode change for a specific HVAC unit.
 * It makes a request to the server and returns the timestamp if successful, otherwise logs an error message.
 */
const lastUnitMode = async (unit, mode) => {
  let modeData = {
    unit_number: unit,
    mode: mode,
  };
  try {
    // axios call
    const get_resp = await request.post(config.get_last_mode_dlc, modeData);
    if (get_resp.data.status) {
      return get_resp.data.data.last_mode_history.created_at;
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
    logging.log(`[LUM] [UNIT ${unit}] - ${err}`);
  }
};

module.exports = lastUnitMode;
