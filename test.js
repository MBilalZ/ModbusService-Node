// create an empty modbus client
const ModbusRTU = require('modbus-serial');
const fetchSystemConfigData = require('./utils/fetchSystemConfigData');
const client = new ModbusRTU();

// open connection to a serial port
try {
  const baudRate = fetchSystemConfigData('baud_rate');
  client.connectRTUBuffered('/dev/ttyUSB0', { baudRate: parseInt(baudRate.baud_rate) }, read);
  client.setTimeout(200);
} catch (e) {
  console.log(e);
}

const register = 132;

function read() {
  client.setID(3);
  // read the 4 registers starting at address 0
  //   console.log('Reading Device with ID 4');
  client.readHoldingRegisters(register, 1).then((data) => {
    console.log('Read: ', data);
    // console.log('Binary: ', dec2bin(data.data[0]));
    // client.writeRegister(register, [50]).then((data) => {
    //   console.log(data);
    //   process.exit(0);
    // });
    process.exit(0);
  });
}
