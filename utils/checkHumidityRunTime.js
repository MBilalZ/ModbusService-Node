const request = require('./request');
const config = require('./config');
const logging = require('./logging');

/**
 * @returns return true/false on the base of humidity run time calculations
 *
 * This code retrieves the humidity run time using an axios request.
 * If successful, it returns the humidity running data; otherwise, it logs an error message and returns false.
 */
const checkHumidityRunTime = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.get_humidity_run_time);

    if (get_resp.data.status) {
      return get_resp.data.data.humidity_running;
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
    logging.log(`[HRT] [Error] - ${err}`);
    return false;
  }
};

module.exports = checkHumidityRunTime;
