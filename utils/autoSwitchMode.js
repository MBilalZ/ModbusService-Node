const singleUnitDetailsDB = require('./singleUnitDetailsDB');
const moment = require('moment');
const logging = require('./logging');
const lastUnitStatusDB = require('./lastUnitStatusDB');

const allUnitsASM = {};
/**
 * This code automatically switches the mode of a unit based on temperature and time. 
 * It determines whether the unit should be in "cool" or "heat" mode, considering factors like 
    the current temperature, set temperature, and time elapsed since the last mode switch. 
 * The function returns the updated mode.
 */
const autoSwitchMode = async (id, mode, current_temp, set_temp, dolLog = true) => {
  if (allUnitsASM[id] === undefined) {
    allUnitsASM[id] = {};
  }

  if (mode !== 'auto') {
    logging.log(`[ASM] [UNIT ${id}] - Mode is not auto! Returning...`, dolLog);
    return -1;
  }

  const currentTime = moment();
  const unitDetails_db = await singleUnitDetailsDB(id);
  const minSwitchTime = unitDetails_db.heatCoolLimits.min_switch_time;
  const hysterisis = unitDetails_db.heatCoolLimits.hysterisis;
  const coolUnOccIdeal = unitDetails_db.preCoolTime.un_occ_ideal;
  const heatUnOccIdeal = unitDetails_db.preHeatTime.un_occ_ideal;
  const override_type = unitDetails_db.override_type;

  if (override_type === 'UNO' && current_temp > heatUnOccIdeal && current_temp < coolUnOccIdeal && allUnitsASM[id].unit_mode) {
    logging.log(`[ASM] [UNIT ${id}] - Override type is UNO and current temp is between unocc ideal temps`, dolLog);
    return allUnitsASM[id].unit_mode;
  }

  const nowSwitchTime = currentTime.subtract(minSwitchTime, 'minutes');

  if (allUnitsASM[id].unit_mode && allUnitsASM[id].unit_mode === 'cool') {
    logging.log(`[ASM] [UNIT ${id}]- Unit is in Auto/Cool mode`, dolLog);
    allUnitsASM[id].unit_mode = 'cool';
    const lastCoolON = await lastUnitStatusDB(id, 'cool');

    logging.log(`[ASM] [UNIT ${id}] - Last cool ON: ${lastCoolON}, Now Switch Time: ${nowSwitchTime}`, dolLog);

    if (lastCoolON === null) {
      logging.log(`[ASM] [UNIT ${id}] - Last cool on is null`, dolLog);

      if (set_temp - hysterisis > current_temp) {
        logging.log(`[ASM] [UNIT ${id}] - Current temp is below set temp - hysterisis`, dolLog);
        allUnitsASM[id].unit_mode = 'heat';

        return allUnitsASM[id].unit_mode;
      } else {
        logging.log(`[ASM] [UNIT ${id}] - Current temp is above set temp - hysterisis`, dolLog);

        return allUnitsASM[id].unit_mode;
      }
    } else {
      if (moment(lastCoolON).isBefore(nowSwitchTime)) {
        logging.log(`[ASM] [UNIT ${id}] - Min switch time has passed for cool`, dolLog);

        if (set_temp - hysterisis > current_temp) {
          logging.log(`[ASM] [UNIT ${id}] - Current temp is below set temp - hysterisis`, dolLog);
          allUnitsASM[id].unit_mode = 'heat';

          return allUnitsASM[id].unit_mode;
        } else {
          logging.log(`[ASM] [UNIT ${id}] - Current temp is above set temp - hysterisis`, dolLog);

          return allUnitsASM[id].unit_mode;
        }
      } else {
        logging.log(`[ASM] [UNIT ${id}] - Min switch time has not passed for cool`, dolLog);

        return allUnitsASM[id].unit_mode;
      }
    }
  } else {
    logging.log(`[ASM] [UNIT ${id}] - Unit Mode is Auto/Heat`, dolLog);
    allUnitsASM[id].unit_mode = 'heat';
    const lastHeatON = await lastUnitStatusDB(id, 'heat');

    logging.log(`[ASM] [UNIT ${id}] - Last heat ON: ${lastHeatON}, Now Switch Time: ${nowSwitchTime}`, dolLog);
    if (lastHeatON === null) {
      logging.log(`[ASM] [UNIT ${id}] - Last heat on is null`, dolLog);

      if (set_temp + hysterisis < current_temp) {
        logging.log(`[ASM] [UNIT ${id}] - Current temp is above set temp + hysterisis`, dolLog);
        allUnitsASM[id].unit_mode = 'cool';

        return allUnitsASM[id].unit_mode;
      } else {
        logging.log(`[ASM] [UNIT ${id}] - Current temp is below set temp + hysterisis`, dolLog);

        return allUnitsASM[id].unit_mode;
      }
    } else {
      if (moment(lastHeatON).isBefore(nowSwitchTime)) {
        logging.log(`[ASM] [UNIT ${id}] - Min switch time has passed for heat`, dolLog);

        if (set_temp + hysterisis < current_temp) {
          logging.log(`[ASM] [UNIT ${id}] - Current temp is above set temp + hysterisis`, dolLog);
          allUnitsASM[id].unit_mode = 'cool';

          return allUnitsASM[id].unit_mode;
        } else {
          logging.log(`[ASM] [UNIT ${id}] - Current temp is below set temp + hysterisis`, dolLog);

          return allUnitsASM[id].unit_mode;
        }
      } else {
        logging.log(`[ASM] [UNIT ${id}] - Min switch time has not passed for heat`, dolLog);

        return allUnitsASM[id].unit_mode;
      }
    }
  }
};

module.exports = autoSwitchMode;
