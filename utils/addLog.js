const fs = require('fs/promises');
const path = require('path');
const request = require('./request');
const config = require('./config');

const MAX_LOGS = 300;
const PROJECT_DIR = path.resolve(__dirname, '..');
const DM_LOGS_FILE = path.join(PROJECT_DIR, 'temp', 'DMLogs.txt');
const CONTROLLER_LOGS_FILE = path.join(PROJECT_DIR, 'temp', 'ControllerLogs.txt');

let dMLogs = [];
let controllerLogs = [];

/**
 * @returns get logs status
 * This code gets the log status from an external source using an async HTTP request with axios.
 * It returns the log data on success or throws an error with an explanatory message if there's an issue.
 */
const getLogsStatus = async () => {
  try {
    // axios call
    const get_resp = await request.get(config.get_logs_status);

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
    console.error(`Error: ${err}`);
  }
};

/*
 * This code loads device manager logs from a file asynchronously.
 * It creates a temporary directory if needed and stores the logs in an array.
 * Errors are logged to the console.
 */
const loadDMLogs = async () => {
  try {
    await fs.mkdir(path.join(PROJECT_DIR, 'temp'), { recursive: true });
    const data = await fs.readFile(DM_LOGS_FILE, 'utf8');
    dMLogs = data.trim().split('\n');
  } catch (err) {
    console.error(`Error loading device manager logs: ${err}`);
  }
};

/*
 * This code loads controller logs from a file asynchronously.
 * It creates a temporary directory if needed and stores the logs in an array.
 * Errors are logged to the console.
 */
const loadControllerLogs = async () => {
  try {
    await fs.mkdir(path.join(PROJECT_DIR, 'temp'), { recursive: true });
    const data = await fs.readFile(CONTROLLER_LOGS_FILE, 'utf8');
    controllerLogs = data.trim().split('\n');
  } catch (err) {
    console.error(`Error loading controller logs: ${err}`);
  }
};

/*
 *This code saves the device manager logs to a file asynchronously.
 * It writes the log data from the `dMLogs` array to the specified file location.
 * Errors are logged to the console if they occur.
 */
const saveDMLogs = async () => {
  try {
    await fs.writeFile(DM_LOGS_FILE, dMLogs.join('\n'));
  } catch (err) {
    console.error(`Error saving device manager logs: ${err}`);
  }
};

/*
 * This code saves the controller logs to a file asynchronously.
 * It writes the log data from the `controllerLogs` array to the specified file location.
 * Errors are logged to the console if they occur.
 */
const saveControllerLogs = async () => {
  try {
    await fs.writeFile(CONTROLLER_LOGS_FILE, controllerLogs.join('\n'));
  } catch (err) {
    console.error(`Error saving controller logs: ${err}`);
  }
};

let dmLogsStopped = false;
let controllerLogsStopped = false;

/**
 * This code adds logs to separate arrays based on specific conditions.
 * It checks the log status and adds the log to the corresponding array.
 * The arrays have a maximum size limit. The log arrays are then saved to files.
 */
const addLog = async (log) => {
  const match = log.match(/^\[(.*?)\]\s+-\s+\[(.*?)\]/);
  // const logsStatus = await getLogsStatus();

  // if (logsStatus.device_manager) {
  //   if (dmLogsStopped) {
  //     dmLogsStopped = false;
  //     dMLogs.push('Device manager logs resumed');
  //   }
  if ((match && match[2].toLowerCase() === 'dm') || (match && match[2] === 'SHORT TERM') || (match && match[2].toLowerCase() === 'dmh')) {
    dMLogs.push(log);
  }
  // } else {
  //   if (!dmLogsStopped) {
  //     dmLogsStopped = true;
  //     dMLogs.push('Device manager logs stopped');
  //   }
  // }

  if (dMLogs.length > MAX_LOGS) {
    dMLogs.shift();
  }

  // if (logsStatus.controller) {
  //   if (controllerLogsStopped) {
  //     controllerLogsStopped = false;
  //     controllerLogs.push('Controller logs resumed');
  //   }
  if (match && match[2].toLowerCase() !== 'dm' && match && match[2] !== 'SHORT TERM' && match && match[2].toLowerCase() !== 'dmh') {
    controllerLogs.push(log);
  }
  // } else {
  //   if (!controllerLogsStopped) {
  //     controllerLogsStopped = true;
  //     controllerLogs.push('Controller logs stopped');
  //   }
  // }

  if (controllerLogs.length > MAX_LOGS) {
    controllerLogs.shift();
  }

  await saveDMLogs();
  await saveControllerLogs();
};

loadDMLogs();
loadControllerLogs();

module.exports = { addLog, getLogsStatus };
