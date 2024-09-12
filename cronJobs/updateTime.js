const { LocalStorage } = require('node-localstorage');

var localStorage = new LocalStorage('localStore');

const updateTime = async () => {
  localStorage.setItem('islastUpdated', 'true');
};

module.exports = updateTime;