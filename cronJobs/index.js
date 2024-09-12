const CronJob = require('cron').CronJob;
const logging = require('../utils/logging');
const short_term_cron = require('./short_term_cron');
const moveLogs = require('./moveLogs');
const updateTime = require('./updateTime');

// start a cron job to run every 15 minutes
const short_term_cron_job = new CronJob('*/15 * * * *', () => {
  logging.log('[CRON] - Short term cron job started.');
  short_term_cron.update();
});

// start a cron job to run every day at 1:00 AM
const move_files_job = new CronJob('0 1 * * *', () => {
  logging.log('[CRON] - Move files job started.');
  moveLogs.moveFiles();
});

// start a cron job to run every day at 2:00 AM
const remove_old_files_job = new CronJob('0 2 * * *', () => {
  logging.log('[CRON] - Remove old files job started.');
  moveLogs.removeOldFiles();
});

// start a cron job to run every day
const update_time_job = new CronJob('0 0 * * *', () => {
  logging.log('[CRON] - Update time job started.');
  updateTime();
});

// start all cron jobs
const startCrons = () => {
  short_term_cron_job.start();
  move_files_job.start();
  remove_old_files_job.start();
  update_time_job.start();
};

module.exports = {
  startCrons,
};
