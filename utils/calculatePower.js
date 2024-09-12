const logging = require('./logging');

/**
 * @param {string} unit
 * @param {string} mode
 * @param {string} status
 * @param {string} autoSwitchMode
 * @param {object} coolingPowerInfo
 * @param {object} heatingPowerInfo
 * @param {string} newMode
 * @param {string} newStatus
 *
 * @returns powers
 *
 * This code calculates the power consumption difference between the current power state of a unit and a new power state.
 * It considers factors like the mode (cooling or heating), status (e.g., fan on, cool1/fan), and power information specific to cooling and heating.
 * The function returns the difference in power consumption.
 */
const calculatePower = async (unit, heatCoolMode, heatCoolStatus, autoBasedLastHeatCoolMode, coolingPowerInfo, heatingPowerInfo, unitType, newMode, newStatus) => {
  try {
    let currentUnitPower = 0;

    // Setting powers for cool & heat
    if (heatCoolMode === 'cool' || autoBasedLastHeatCoolMode === 'cool') {
      if (heatCoolStatus === 'FAN_ON') {
        currentUnitPower = coolingPowerInfo.comp3_kw;
      } else if (heatCoolStatus === 'COOL1/FAN') {
        currentUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp3_kw;
      } else if (heatCoolStatus === 'COOL2/FAN') {
        currentUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp2_kw + coolingPowerInfo.comp3_kw;
      } else {
        currentUnitPower = 0;
      }
    } else if (heatCoolMode === 'heat' || autoBasedLastHeatCoolMode === 'heat') {
      if (heatCoolStatus === 'FAN_ON') {
        currentUnitPower = coolingPowerInfo.comp3_kw;
      } else {
        currentUnitPower = 0;
      }
      if (unitType === 'heat_pump') {
        if (heatCoolStatus === 'HEAT1/FAN') {
          currentUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp3_kw;
        } else if (heatCoolStatus === 'HEAT2/FAN') {
          currentUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp2_kw + coolingPowerInfo.comp3_kw;
        }
      } else if (heatingPowerInfo.type === 'gas') {
        if (heatCoolStatus === 'HEAT1/FAN') {
          currentUnitPower = coolingPowerInfo.comp3_kw;
        } else if (heatCoolStatus === 'HEAT2/FAN') {
          currentUnitPower = coolingPowerInfo.comp3_kw;
        }
      } else if (heatingPowerInfo.type === 'electric') {
        if (heatCoolStatus === 'HEAT1/FAN') {
          currentUnitPower = heatingPowerInfo.stage1_kw + coolingPowerInfo.comp3_kw;
        } else if (heatCoolStatus === 'HEAT2/FAN') {
          currentUnitPower = heatingPowerInfo.stage1_kw + heatingPowerInfo.stage2_kw + coolingPowerInfo.comp3_kw;
        }
      } else {
        logging.log(`[CCP] [UNIT ${unit}] - Unit not is heat pump, gas or electric`);
      }
    }

    let newUnitPower = 0;
    if (newMode === 'cool') {
      if (newStatus === 'FAN_ON') {
        newUnitPower = coolingPowerInfo.comp3_kw;
      } else if (newStatus === 'COOL1/FAN') {
        newUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp3_kw;
      } else if (newStatus === 'COOL2/FAN') {
        newUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp2_kw + coolingPowerInfo.comp3_kw;
      } else {
        newUnitPower = 0;
      }
    } else if (newMode === 'heat') {
      if (newStatus === 'FAN_ON') {
        newUnitPower = coolingPowerInfo.comp3_kw;
      } else {
        newUnitPower = 0;
      }
      if (unitType === 'heat_pump') {
        if (newStatus === 'HEAT1/FAN') {
          newUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp3_kw;
        } else if (newStatus === 'HEAT2/FAN') {
          newUnitPower = coolingPowerInfo.comp1_kw + coolingPowerInfo.comp2_kw + coolingPowerInfo.comp3_kw;
        }
      } else if (heatingPowerInfo.type === 'gas') {
        if (newStatus === 'HEAT1/FAN') {
          newUnitPower = coolingPowerInfo.comp3_kw;
        } else if (newStatus === 'HEAT2/FAN') {
          newUnitPower = coolingPowerInfo.comp3_kw;
        }
      } else if (heatingPowerInfo.type === 'electric') {
        if (newStatus === 'HEAT1/FAN') {
          newUnitPower = heatingPowerInfo.stage1_kw + coolingPowerInfo.comp3_kw;
        } else if (newStatus === 'HEAT2/FAN') {
          newUnitPower = heatingPowerInfo.stage1_kw + heatingPowerInfo.stage2_kw + coolingPowerInfo.comp3_kw;
        }
      } else {
        logging.log(`[CCP] [UNIT ${unit}] - Unit not is heat pump, gas or electric`);
      }
    }
    return newUnitPower - currentUnitPower;
  } catch (err) {
    logging.log(`[CCP] [UNIT ${unit}] - ${err}`);
  }
};

module.exports = calculatePower;
