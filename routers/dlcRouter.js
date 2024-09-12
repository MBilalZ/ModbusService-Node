const express = require('express');
const dlcRoutes = express.Router();

const dlcController = require('../controllers/dlcController');
// dlcRoutes.post('/setRegister', dlcController.setRegister);

module.exports = dlcRoutes;
