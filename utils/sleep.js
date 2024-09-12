/**
 *
 * @param {*} ms number of milliseconds to sleep
 * 
 * This code creates a delay or pause in code execution for a specified number of milliseconds using a Promise-based approach.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = sleep;
