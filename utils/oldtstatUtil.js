#!/usr/bin/env node
'use strict';

const { ArgumentParser } = require('argparse');
const ModbusRTU = require('modbus-serial');
const registerDetail = require('../helpers/registerDetails');
const sleep = require('./sleep');
const fs = require('fs');
const setupRegs = require('./initRegisters');
const readline = require('readline');

// ask for confirmation before moving
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (response) => {
      resolve(response.toLowerCase().trim());
    });
  });
}

const coreRegs = [
  [142, 20],
  [143, 20],
  [144, 20],
  [145, 20],
  [157, 0],
  [158, 0],
  [169, 0],
  [170, 0],
  [345, 700],
  [350, 700],
];

const parser = new ArgumentParser({
  description: 'Tstat utility for reading and writing to tstats',
});

parser.add_argument('-d', '--device', { help: 'Device manager port, default /dev/ttyUSB0', type: String, default: '/dev/ttyUSB0', required: false });
parser.add_argument('--baudrate', { help: 'Baudrate for serial port, default 19200', type: 'int', default: 9600, required: false });
parser.add_argument('-D', '--debug', { help: 'Set debug info level, 1 - 5. Default level is 1.', type: 'int', default: 1, required: false });
parser.add_argument('-t', { help: 'Set to time the operations', default: false, required: false });
parser.add_argument('--timeout', { help: 'Set timeout for device manager, default 1000ms', type: 'int', default: 1000, required: false });
parser.add_argument('--id', { help: 'Address of the device to connect', type: 'int', required: false });
parser.add_argument('--set', { help: 'Set the temp of the device to the provided temp. ex: "tstatUtil --id 3 --set 700" -> set temp to 70', type: 'int', required: false });
parser.add_argument('--read', { help: 'Read the registers from a register file', type: String, required: false });
parser.add_argument('--readone', { help: 'Read one specific register', type: 'int', required: false });
parser.add_argument('--readrange', { help: 'Read all registers in the specified range, ex: tstatUtil --id 3 --readrange 100-150', required: false });
parser.add_argument('--scan', { help: 'Scan for devices in the provided range. ex: tstatUtil --scan 1-20', type: String, required: false });
parser.add_argument('--move', { help: 'Move the thermostat from one address to another, ex: tstatUtil --id 3 --move 4 -> move address 3 to 4.', type: 'int', required: false });
parser.add_argument('--relay', { help: 'Set relay to a specific value.', type: 'int', required: false });
parser.add_argument('--setTime', { help: 'Update the time on device to the time provided in HH:mm format', type: String, required: false });
parser.add_argument('--writeone', { help: 'Write one specific register. ex: tstatUtil --id 4 --writeone <register>:<value>', type: String, required: false });
parser.add_argument('--verify', { help: 'Verify the registers.', required: false, action: 'store_true' });
parser.add_argument('--fix', { help: 'Fix the registers', required: false, action: 'store_true' });
parser.add_argument('--core', { help: 'Can only be used with --verify & --fix. Fix the core registers only', required: false, action: 'store_true' });

const args = parser.parse_args();

const device_manager_id = args.device;
const baudrate = args.baudrate;
const debug = args.debug;
const timeit = args.t;
const timeout = args.timeout;
const id = args.id;
const set = args.set;
const read = args.read;
const readone = args.readone;
const readrange = args.readrange;
const scan = args.scan;
const move = args.move;
const relay = args.relay;
const setTime = args.setTime;
const writeone = args.writeone;
const verify = args.verify;
const fix = args.fix;
const core = args.core;

// create a file named /tmp/devices.lock to prevent multiple instances of this script from running at the same time
if (fs.existsSync('/tmp/devices.lock')) {
  // wait for the file to be removed
  while (fs.existsSync('/tmp/devices.lock')) {}
}

// create the file
fs.writeFileSync('/tmp/devices.lock', 'locked');

if ((id && id < 1) || id > 254) {
  console.log('ID must be between 1 and 254');
  // remove the file
  fs.unlinkSync('/tmp/devices.lock');
  process.exit(1);
}

console.log('\nUsing following settings:');
console.log('Device manager port: ' + device_manager_id);
console.log('Baudrate: ' + baudrate);
console.log('');

const scanForDevices = async (startAddr, stopAddr) => {
  const MODBUS_ADDRESS = registerDetail.getDetailsByName('MODBUS_ADDRESS');
  console.log('Scanning for devices in range ' + startAddr + ' - ' + stopAddr);
  const foundDevices = [];
  const freeAddresses = [];

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    for (let i = startAddr; i <= stopAddr; i++) {
      await client.setID(i);
      await client.setTimeout(timeout);
      await client
        .readHoldingRegisters(MODBUS_ADDRESS, 1)
        .then((data) => {
          foundDevices.push(i);
        })
        .catch((error) => {
          freeAddresses.push(i);
        });
      await sleep(200);
    }
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  if (foundDevices.length > 0) {
    console.log('Found devices: ', foundDevices);
    console.log('Free addresses: ', freeAddresses);
  } else {
    console.log('No devices found');
  }

  return true;
};

const moveDevice = async (id, move) => {
  const MODBUS_ADDRESS = registerDetail.getDetailsByName('MODBUS_ADDRESS');
  console.log('Moving device from ID ' + id + ' to ID ' + move);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    // read the current address
    console.log("Checking if there's a device at 'FROM' address " + id);
    try {
      await client.readHoldingRegisters(MODBUS_ADDRESS, 1);
    } catch (error) {
      console.log('No device found at address ' + id + '. Exiting.');
      return false;
    }

    // read the address we're moving to
    console.log("Checking if there's a device at 'TO' address " + move);
    try {
      await client.setID(move);
      await client.readHoldingRegisters(MODBUS_ADDRESS, 1);
      console.log('Device found at address ' + move + '. Exiting.');
      return false;
    } catch (error) {
      console.log('No device found at address ' + move + '. Moving on.');
    }

    await client.setID(id);

    /** @param {string} response */
    const response = await askQuestion('Are you sure you want to move device from ID ' + id + ' to ID ' + move + '? (y/n) ');

    if (!response.includes('y')) {
      console.log('Exiting.');
      return false;
    }

    await client.writeRegister(MODBUS_ADDRESS, [move]);
    await sleep(100);
    await client.writeRegister(MODBUS_ADDRESS, [move]);
    await sleep(100);
    await client.writeRegister(MODBUS_ADDRESS, [move]);

    // read the address we're moving to and verify if the move was successful
    try {
      await client.setID(move);
      await client.readHoldingRegisters(MODBUS_ADDRESS, 1);
      console.log('Successfuly moved device from ID ' + id + ' to ID ' + move);
    } catch (error) {
      console.log('Failed to move device from ID ' + id + ' to ID ' + move);
      return false;
    }
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const updateSetTemp = async (id, set) => {
  console.log('Setting device ID ' + id + ' set-temp to ' + set);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    // fetching address and length of MODBUS_DAY_SETPOINT
    const MODBUS_DAY_SETPOINT = registerDetail.getDetailsByName('MODBUS_DAY_SETPOINT');
    // fetching address and length of MODBUS_NIGHT_SETPOINT
    const MODBUS_NIGHT_SETPOINT = registerDetail.getDetailsByName('MODBUS_NIGHT_SETPOINT');
    // fetching address and length of MODBUS_MAX_SETPOINT
    const MODBUS_MAX_SETPOINT = registerDetail.getDetailsByName('MODBUS_MAX_SETPOINT');
    // fetching address and length of MODBUS_MIN_SETPOINT
    const MODBUS_MIN_SETPOINT = registerDetail.getDetailsByName('MODBUS_MIN_SETPOINT');

    let result;

    result = await client.readHoldingRegisters(MODBUS_MAX_SETPOINT.Register_Address, MODBUS_MAX_SETPOINT.Register_Length);
    const max_temp = result.data[0];

    result = await client.readHoldingRegisters(MODBUS_MIN_SETPOINT.Register_Address, MODBUS_MIN_SETPOINT.Register_Length);
    const min_temp = result.data[0];

    if (set > max_temp) {
      await client.writeRegister(MODBUS_MAX_SETPOINT.Register_Address, [set / 10]);
    }

    if (set < min_temp) {
      await client.writeRegister(MODBUS_MIN_SETPOINT.Register_Address, [set / 10]);
    }

    await client.writeRegister(MODBUS_DAY_SETPOINT.Register_Address, [set]);
    await client.writeRegister(MODBUS_NIGHT_SETPOINT.Register_Address, [set]);
    console.log('Set device ID ' + id + ' set-temp to ' + set);
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const readRange = async (id, start, stop) => {
  console.log('Reading range for device ID ' + id + ' from ' + start + ' to ' + stop);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    const registerList = [];

    for (let i = start; i <= stop; i++) {
      registerList.push(i);
    }

    const result = await client.readHoldingRegisters(start, registerList.length);

    for (let i = 0; i < registerList.length; i++) {
      console.log('Address: ' + registerList[i] + ' Value: ' + result.data[i]);
    }
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const readSingle = async (id, address) => {
  console.log('Reading register ' + address + ' for device ID ' + id);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    const result = await client.readHoldingRegisters(address, 1);
    console.log('Address: ' + address + ' Value: ' + result.data[0]);
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const readFromConfig = async (id, file) => {
  const registerfile = fs.readFileSync(file);

  // if file is empty, exit
  if (registerfile.length === 0) {
    console.log('File is empty');
    return false;
  }

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    // read lines one by one, if line start with a number then process it else ignore
    const lines = registerfile.toString().split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 0 && !isNaN(line[0])) {
        const register = line.split(',');
        // if register is less than 100 then ignore
        if (register[0] < 100) {
          console.log('Ignoring register ' + register[0] + ' as it is less than 100');
          continue;
        }

        console.log('Writing register ' + parseInt(register[0]) + ' with value ' + parseInt(register[1]));
        await client.writeRegister(parseInt(register[0]), [parseInt(register[1])]);
        await sleep(100);
      }
    }

    console.log('Done');
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const updateRelay = async (id, value) => {
  console.log('Updating unit ' + id + ' relay to ' + value);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
    const MODBUS_OUTPUT_MANU_ENABLE = registerDetail.getDetailsByName('MODBUS_OUTPUT_MANU_ENABLE');
    // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
    const MODBUS_DIGITAL_OUTPUT_STATUS = registerDetail.getDetailsByName('MODBUS_DIGITAL_OUTPUT_STATUS');

    await client.writeRegister(MODBUS_OUTPUT_MANU_ENABLE.Register_Address, [31]);

    await client.writeRegister(MODBUS_DIGITAL_OUTPUT_STATUS.Register_Address, [value]);

    console.log('Updated relay ' + id + ' to ' + value);
  } catch (error) {
    console.log('Error: ', error.message);

    return false;
  }

  return true;
};

const updateTime = async (id, time) => {
  const timeArray = time.split(':');
  const hour = parseInt(timeArray[0]);
  const minute = parseInt(timeArray[1]);

  console.log('Updating unit ' + id + ' time to ' + hour + ':' + minute);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
    const MODBUS_CLOCK_HOUR = registerDetail.getDetailsByName('MODBUS_CLOCK_HOUR');
    // fetching address and length of MODBUS_DIGITAL_OUTPUT_STATUS
    const MODBUS_CLOCK_MINUTE = registerDetail.getDetailsByName('MODBUS_CLOCK_MINUTE');

    console.log(hour, minute);

    await client.writeRegister(414, [hour]);
    await sleep(200);
    await client.writeRegister(415, [minute]);
    await sleep(200);

    // verify the time
    const result = await client.readHoldingRegisters(414, 1);
    if (result.data[0] !== hour) {
      console.log('Failed to update hour');
      return false;
    }

    await sleep(200);

    const result2 = await client.readHoldingRegisters(415, 1);
    if (result2.data[0] !== minute) {
      console.log('Failed to update minute');
      return false;
    }

    console.log('Updated time to ' + hour + ':' + minute + ' successfully');
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }

  return true;
};

const writeSingle = async (id, data) => {
  const parsed_data = data.split(':');
  const address = parseInt(parsed_data[0]);
  const value = parseInt(parsed_data[1]);

  console.log('Writing register ' + address + ' with value ' + value + ' for device ID ' + id);

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    await client.writeRegister(address, [value]);
    await sleep(1000);

    // read back the value and check if it matches
    const readValue = await client.readHoldingRegisters(address, 1);
    if (readValue.data[0] !== value) {
      console.log('Failed to write register ' + address + ' with value ' + value + ' for device ID ' + id);
      return false;
    }

    console.log('Successfully wrote register ' + address + ' with value ' + value + ' for device ID ' + id);
    return true;
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }
};

const verifyRegisters = async (id) => {
  const non_matching_registers = [];
  const matching_registers = [];

  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    for (const reg of setupRegs.tstat7Registers) {
      await sleep(100);
      const readValue = await client.readHoldingRegisters(reg[0], 1);
      if (readValue.data[0] !== reg[1]) {
        non_matching_registers.push(reg);
      } else {
        matching_registers.push(reg);
      }
    }

    if (matching_registers.length === setupRegs.tstat7Registers.length) {
      console.log('All registers match');
      return true;
    } else {
      console.log('Non matching registers: ', non_matching_registers);
      console.log('Matching registers: ', matching_registers);
      return false;
    }
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }
};

const fixRegisters = async (id) => {
  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    for (const reg of setupRegs.tstat7Registers) {
      await sleep(100);
      const readValue = await client.readHoldingRegisters(reg[0], 1);
      if (readValue.data[0] !== reg[1]) {
        await sleep(50);
        await client.writeRegister(reg[0], [reg[1]]);
      }
    }

    return true;
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }
};

const fixCoreRegisters = async (id) => {
  try {
    const client = new ModbusRTU();
    await client.connectRTUBuffered(device_manager_id, { baudRate: baudrate });
    await client.setID(id);
    await client.setTimeout(timeout);

    for (const reg of coreRegs) {
      await sleep(100);
      const readValue = await client.readHoldingRegisters(reg[0], 1);
      if (readValue.data[0] !== reg[1]) {
        await sleep(50);
        await client.writeRegister(reg[0], [reg[1]]);
      }
    }

    return true;
  } catch (error) {
    console.log('Error: ', error.message);
    return false;
  }
};

if (move) {
  if (!id) {
    console.log('You must use --id <id> provide an id to move from');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  if (move < 1 || move > 254) {
    console.log('Move address must be between 1 and 254');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  moveDevice(id, move).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (scan) {
  const range = scan.split('-');
  const start = parseInt(range[0]);
  const end = parseInt(range[1]);

  if (start > end) {
    console.log('Start address must be less than end address');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  scanForDevices(start, end).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (set) {
  if (!id) {
    console.log('You must use --id <id> provide an id to set');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  if (set < 0 || set > 999) {
    console.log('Set temp must be between 0 and 999');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  updateSetTemp(id, set).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (readrange) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  const range = readrange.split('-');
  const start = parseInt(range[0]);
  const end = parseInt(range[1]);

  if (start > end) {
    console.log('Start address must be less than end address');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  readRange(id, start, end).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (readone) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  readSingle(id, readone).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (read) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  readFromConfig(id, read).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (relay) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  updateRelay(id, relay).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (setTime) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  updateTime(id, setTime).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (writeone) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  writeSingle(id, writeone).then(() => {
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(0);
  });
}

if (verify) {
  if (!id) {
    console.log('You must use --id <id> provide an id to read');
    // remove the lock file
    fs.unlinkSync('/tmp/devices.lock');
    process.exit(1);
  }

  if (fix && core) {
    console.log('Verifying and fixing core registers');
    fixCoreRegisters(id).then(() => {
      console.log('Done');
      // remove the lock file
      fs.unlinkSync('/tmp/devices.lock');
      process.exit(0);
    });
  } else if (fix) {
    console.log('Verifying and fixing registers');
    fixRegisters(id).then(() => {
      console.log('Done');
      // remove the lock file
      fs.unlinkSync('/tmp/devices.lock');
      process.exit(0);
    });
  } else {
    console.log('Verifying registers');
    verifyRegisters(id).then(() => {
      console.log('Done');
      // remove the lock file
      fs.unlinkSync('/tmp/devices.lock');
      process.exit(0);
    });
  }
}
