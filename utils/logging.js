const moment = require('moment');
const { addLog } = require('./addLog');

/**
 *
 * @param {*} message
 * @param {*} dolLog
 *
 * The function logs messages to the console with a timestamp and optionally stores them in a log database.
 */
const log = async (message, dolLog = true) => {
  try {
    if (dolLog) {
      const time = moment().format('YYYY-MM-DD HH:mm:ss');
      console.log(`[${time}] -`, message);

      // get unit number and module name to store logs
      let unitNumber;
      let moduleName;
      const moduleNameMatch = message.match(/\[([^\]]+)\]/); // DLC
      const unitNumberMatch = message.match(/UNIT (\d+)/); // 1
      if (moduleNameMatch && unitNumberMatch) {
        moduleName = moduleNameMatch[1];
        unitNumber = unitNumberMatch[1];
      } else {
        unitNumber = 0;
      }
      // console.log(moduleName, unitNumber, message);
      await addLog(`[${time}] - ${message}`);
      // await addLog(unitNumber, moduleName, `[${time}] - ${message}`);
    }
  } catch (err) {
    console.log(err);
  }
};

const logging = {
  log,
};

module.exports = logging;
