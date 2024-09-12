const { LocalStorage } = require('node-localstorage');
const logging = require('./logging');
var localStorage = new LocalStorage('localStore');

/**
 * @param {*} req for params
 * @param {*} res to send data
 * @returns setting unit relay status and send response back
 *
 * This code updates the relay status of a unit by storing the device manager ID and status in the local storage.
 * It logs a success message if the update is successful or an error message if the input parameters are missing.
 */
const setRelayStatus = async (unit_number, device_manager_id, status) => {
  try {
    if (unit_number && device_manager_id) {
      const unit_info = localStorage.getItem('set_relay_info');
      let unit_info_json = {};
      if (unit_info) {
        unit_info_json = JSON.parse(unit_info);
      }

      unit_info_json[unit_number] = {
        device_manager_id: device_manager_id,
        status: status,
      };

      localStorage.setItem('set_relay_info', JSON.stringify(unit_info_json));
      localStorage.setItem('set_relay_info_updated', 'true');

      // sending response as success
      logging.log(`[RS] - [UNIT ${unit_number}] - Unit relay register has been set successfully!`);
    } else {
      // sending response as error
      logging.log(`[RS] - [UNIT ${unit_number}] - Unit relay register is not set! Please specify input parameters!`);
    }
  } catch (err) {
    logging.log(`[RS] - Error: ${err.message}`);
  }
};

module.exports = setRelayStatus;
