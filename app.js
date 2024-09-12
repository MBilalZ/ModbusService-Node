const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

// Require the routers
const unitRouter = require('./routers/unitRouter');
const dlcRouter = require('./routers/dlcRouter');
const deviceManager = require('./utils/deviceManager');
const dlcController = require('./controllers/dlcController.js');
const short_term = require('./controllers/short_term.js');
const errorHandler = require('./middlewares/errorHandler');
const setupRegs = require('./utils/initRegisters');
const logging = require('./utils/logging');
const { getLogsStatus } = require('./utils/addLog.js');

// load cron jobs
require('./cronJobs').startCrons();

require('dotenv').config();
require('./utils/request');

// Enable CORS
const allowedOrigins = ['http://3.20.209.136:8000', 'http://172.173.176.4:90', 'http://localhost:5050'];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

// Parse incoming request bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up a view engine
app.set('view engine', 'ejs');

// Set up routes
app.use('/units', unitRouter);
app.use('/dlc', dlcRouter);

app.get('/', (req, res) => {
  res.send('Welcome to the SES DLC Hardware page!');
});

/** catch 404 and forward to error handler */
app.use('*', (req, res) => {
  return res.status(404).json({
    success: false,
    message: `API endpoint doesn't exist`,
  });
});

// Error / Exception handling
app.use(errorHandler);

(async () => {
  // check if a file named '/tmp/devices.lock' exists in utils folder
  if (fs.existsSync('/tmp/devices.lock')) {
    console.log('Devices are locked. Exiting...');
    // delete the file
    fs.unlinkSync('/tmp/devices.lock');
  }

  let isServiceRunning;
  let dmFlag = false;
  let dlcFlag = false;

  while (true) {
    isServiceRunning = await getLogsStatus();

    if (isServiceRunning.device_manager && !dmFlag) {
      logging.log('[DM] - has started running');
      dmFlag = true;
      // setting default registers
      await setupRegs.initRegisters();
    } else if (!isServiceRunning.device_manager && dmFlag) {
      logging.log('[DM] - has stopped running');
      dmFlag = false;
      // check if a file named '/tmp/devices.lock' exists in utils folder
      if (fs.existsSync('/tmp/devices.lock')) {
        console.log('Devices are locked. Exiting...');
        // delete the file
        fs.unlinkSync('/tmp/devices.lock');
      }
    }
    if (isServiceRunning.device_manager) {
      // reading all units data
      await deviceManager.readUnitsData();
    }

    // reading short term data
    await short_term.update();

    if (isServiceRunning.controller && !dlcFlag) {
      logging.log('[DLC] - has started running');
      dlcFlag = true;
    } else if (!isServiceRunning.controller && dlcFlag) {
      logging.log('[DLC] - has stopped running');
      dlcFlag = false;
    }
    if (isServiceRunning.controller) {
      // running dlc operations
      await dlcController.dlcOperations();
    }
  }
})();

// Start the server
const port = process.env.PORT || 5050;
// const newPort = `0.0.0.0:${port}`;
const server = http.Server(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 5000, // Set the ping timeout to 5 seconds
});

/*Socket Events */

let socketCount = 0; // Variable to keep track of the socket connections count

// When a socket connects, increment the socket count
io.on('connection', async (socket) => {
  socketCount++; // Increment the socket count
  // console.log(`Made socket connection successfully on id ${socket.id}. Total connections: ${socketCount}`);

  // send alert to all clients
  socket.on('sendAlert', async (data) => {
    io.emit('receiveAlerts', data);
  });

  // send fix register data to all clients
  socket.on('sendFixRegistersData', async (data) => {
    io.emit('fixRegister', data);
  });
  // When a socket disconnects, decrement the socket count
  socket.on('disconnect', async () => {
    socketCount--; // Decrement the socket count
    // console.log(`User disconnected. Total connections: ${socketCount}`);
  });
});

// Server starts listening
server.listen(port, () => {
  console.log(`Server is running on ${port} port.`);
});
