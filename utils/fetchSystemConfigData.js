const request = require('./request');
const config = require('./config');
const logging = require('./logging');

/**
 * @returns get baud rate from db
 * This code fetches system configuration data for a given key by making an API request.
 * It retrieves the data if the request is successful, otherwise it logs an error message
 */
const fetchSystemConfigData = async (key) => {
  try {
    // axios call
    const get_resp = await request.get(config.get_static_fields(key));
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
    logging.log(`[System Config Data] - ${err}`);
  }
};

module.exports = fetchSystemConfigData;
