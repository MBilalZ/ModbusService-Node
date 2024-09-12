const fs = require('fs');
const path = require('path');
const moment = require('moment');

const oldPath = process.env.HOME + '/.pm2/logs/';
const newPath = '/dlc/logs/hardware/';

const daysThreshold = 30;

const moveFiles = async () => {
  const files = fs.readdirSync(oldPath).filter(fn => fn.endsWith('.log.gz'));

  for (const file of files) {
    fs.rename(oldPath + file, newPath + file, function (err) {
      if (err) throw err
      console.log('Successfully moved!')
    })
  }
}

const removeOldFiles = async () => {
  // Calculate the date threshold
  const thresholdDate = moment().subtract(daysThreshold, 'days');

  // Read the files in the directory
  fs.readdir(newPath, (err, files) => {
    if (err) {
      console.error('Error reading directory:', err);
      return;
    }

    // Iterate over each file
    files.forEach((file) => {
      const filePath = path.join(newPath, file);

      // Get the file's stats
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error getting file stats:', err);
          return;
        }

        // Check if the file is older than the threshold
        if (stats.isFile() && moment(stats.mtime) < thresholdDate) {
          // Remove the file
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error('Error deleting file:', err);
              return;
            }
            console.log('Deleted file:', filePath);
          });
        }
      });
    });
  });
}

const moveLogs = {
  moveFiles,
  removeOldFiles
}

module.exports = moveLogs;