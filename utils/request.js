const axios = require('axios');
require('dotenv').config();

const baseURL = process.env.BASE_API_URL;

/**
 * The code creates an Axios client with a base URL, timeout, and headers for making HTTP requests.
 */
const request = axios.create({
  baseURL,
  // timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Key-Authorization': process.env.API_KEY,
  },
});

/**
 * The code adds a request interceptor to modify outgoing requests and handle any errors that occur during the interception.
 */
request.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * The code adds a response interceptor to handle the responses received from API calls.
 * It allows returning the response data or rejecting the response with an error.
 */
request.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

module.exports = request;
