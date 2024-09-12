const standardTable = {
  off: 0,
  fan_on: 1,
  cool1: 9,
  cool2: 11,
  heat1: 17,
  heat2: 21,
  coolh: 13,
  cool2h: 15,
};
const heatPumpOTable = {
  off: 0,
  fan_on: 1,
  cool1: 25,
  cool2: 27,
  heat1: 9,
  heat2: 11,
  coolh: 29,
  cool2h: 31,
};
const heatPumpBTable = {
  off: 0,
  fan_on: 1,
  cool1: 9,
  cool2: 11,
  heat1: 25,
  heat2: 27,
  coolh: 13,
  cool2h: 15,
};

const checkUnitType = (unitType) => {
  if (unitType === 0) {
    return heatPumpOTable;
  } else if (unitType === 1) {
    return heatPumpBTable;
  } else {
    return standardTable;
  }
};

module.exports = {
  checkUnitType,
};
