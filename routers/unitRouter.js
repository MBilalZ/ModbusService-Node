const express = require('express');
const unitRoutes = express.Router();
const unitController = require('../controllers/unitController');

// all routes prefixed with /units
unitRoutes.get('/getAllMonitorUnitsData', unitController.allMonitorUnitsData);
unitRoutes.post('/setUnitMode', unitController.setUnitMode);
unitRoutes.post('/setCalibration', unitController.setCalibration);
unitRoutes.post('/setHumidityCalibration', unitController.setHumidityCalibration);
unitRoutes.get('/getSingleUnitDetailsDB/:unitId', unitController.dbData);
unitRoutes.get('/getLogs', unitController.allLogsFromFile);
unitRoutes.post('/saveMaintenanceAlert', unitController.saveMaintenanceAlert);
unitRoutes.post('/getSettings', unitController.getSettings);
unitRoutes.post('/fixRegisters', unitController.fixRegisters);

module.exports = unitRoutes;
