const ioClient = require('socket.io-client');
const socket = ioClient.connect('http://localhost:5050');
const config = require('./config');
const logging = require('./logging');
const request = require('./request');

/**
 *
 * @param {*} req for params
 * @param {*} res to send data
 * @returns save specific units temperature alert to database
 *
 * Function for setting temperature alerts based on specified parameters.
 * It checks alert frequency and previous alerts, then emits an alert event and creates a new temperature alert if conditions are met.
 */
const setTempAlert = async (name, message, isRead, type, unitId, freqType, freqPerDay, moduleType) => {
  let alertData = {
    name: name,
    message: message,
    type: type,
    is_read: isRead,
    freq_type: freqType,
    unit_number: unitId,
    module_type: moduleType,
  };

  const freqOfAlert = await getAlertFrequency(freqType, unitId);
  try {
    if (freqOfAlert.today_count <= freqPerDay) {
      const lastAlert = await getLastAlert(unitId, freqType);

      if (lastAlert.are4HoursPassed) {
        socket.emit('sendAlert', alertData);
        const tempAlarm = await request.post(config.temp_alerts, alertData);
        socket.emit('disconnect');
        return tempAlarm.data;
      } else {
        logging.log(`[STA] [UNIT ${unitId}] - Cannot send new alert as 4 hours not passed`);
      }
    } else {
      logging.log(`[STA] [UNIT ${unitId}] - Today's alerts limit has been reached`);
    }
  } catch (err) {
    logging.log(`[STA] - Error: ${err.message}`);
  }
};

/**
 *
 * @returns frequency of alert based on condition
 *
 * This code Retrieves alert frequency based on type and unit number using an API call, returning the data if successful or logging an error message if not.
 */
const getAlertFrequency = async (freq, unit_number) => {
  try {
    // axios call
    const get_resp = await request.get(config.get_alerts_frequency(freq, unit_number));
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
    logging.log(`[STA] [UNIT ${unit_number}] - ${err}`);
  }
};

/**
 *
 * @returns get a true/false flag if last unit alert time is passed or not (Time is 4h)
 *
 * Retrieves the last alert of a specific type for a given unit number using an API call, returning the data if successful or logging an error message if not.
 */
const getLastAlert = async (unit_number, type) => {
  try {
    // axios call
    const get_resp = await request.get(config.get_last_alerts(unit_number, type));
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
    logging.log(`[STA] [UNIT ${unit_number}] - ${err}`);
  }
};

module.exports = setTempAlert;
