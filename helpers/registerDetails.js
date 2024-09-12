const registerList = require('../utils/registersList');
const registersListHumidity = require('../utils/registersListHumidity');

/**
 *
 * @param {*} name name of register
 * @returns  an object with all required register details
 */
exports.getDetailsByName = (name) => {
  let details = {};
  for (let register of registerList.allRegisters) {
    if (name === register.Register_Name) {
      // details[name] = {
      details.Register_Address = register.Register_Address;
      details.Register_Length = register.Register_Length;
      details.Operation = register.Operation;
      details.Data_Format = register.Data_Format;
      details.Description = register.Description;
      // };
      return details;
    } else {
      ('No register details available with this name');
    }
  }
};

/**
 *
 * @param {*} name name of register
 * @returns  an object with all required register details
 */
exports.getHumidityDetailsByName = (name) => {
  let details = {};
  for (let register of registersListHumidity.allRegisters) {
    if (name === register.Register_Name) {
      // details[name] = {
      details.Register_Address = register.Register_Address;
      details.Register_Length = register.Register_Length;
      details.Operation = register.Operation;
      details.Data_Format = register.Data_Format;
      details.Description = register.Description;
      // };
      return details;
    } else {
      ('No humidity register details available with this name');
    }
  }
};
