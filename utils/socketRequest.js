const axios = require('axios');
require('dotenv').config();

const baseSocketURL = process.env.BASE_BACKEND_URL;


/**
 * This code creates an instance of Axios (HTTP client) with a base URL for socket requests, a timeout of 15 seconds, and JSON as the content type for headers.
 */
// for socket
const requestSocket = axios.create({
  baseSocketURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

module.exports = requestSocket;
