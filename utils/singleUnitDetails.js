const config = require('./config');
const logging = require('./logging');
const request = require('./request');

/**
 *
 * @param { unit } unit number
 * @returns every unit fan control status and occupied hours details
 *
 * Retrieves detailed information and settings for a single AC unit, including override status, fan control, temperature alerts, and more.
 * Returns the unit data or -1 if unsuccessful.
 */
const singleUnitDetails = async (unit) => {
  let unitData = {};
  let singleUnit = {};

  // setting up unit for API
  singleUnit = {
    ac_unit_id: unit,
  };

  try {
    const singleUnitData = await request.post(config.get_single_unit_readings, singleUnit);
    if (singleUnitData.data.status) {
      // data for override status
      unitData.override_type = singleUnitData.data.data.set_temp_type;

      // data for ventilation fan control
      unitData.ventilationFanControl = singleUnitData.data.data.ventilation_fan_control;
      unitData.OccHours = singleUnitData.data.data.occ_hours;
      unitData.deviceName = singleUnitData.data.data.device_manager_name;

      // data for temperature alerts
      unitData.tempAlarms = singleUnitData.data.data.temperature_alarm;
      unitData.heatCoolLimits = singleUnitData.data.data.heat_cool;
      unitData.active_holiday = singleUnitData.data.data.active_holiday;

      // data for calculate set zone temperature
      unitData.overrideExpTime = singleUnitData.data.data.override_expire_time;
      unitData.setTemp = singleUnitData.data.data.set_temp;
      unitData.allowKeypadTempAdjust = singleUnitData.data.data.allow_keypad_temp_adjust;
      unitData.activeEvent = singleUnitData.data.data.active_event;
      unitData.peakTimePrecool = singleUnitData.data.data.temperature_settings.cool;
      unitData.preHeatTime = singleUnitData.data.data.temperature_settings.warm;
      unitData.preCoolTime = singleUnitData.data.data.temperature_settings.cool;
      unitData.overrideType = singleUnitData.data.data.set_temp_type;
      unitData.hwExpire = singleUnitData.hardware_override_expire;

      //data for heat/cool administration
      unitData.supplySensor = singleUnitData.data.data.supply_sensor;
      unitData.powerInformation = singleUnitData.data.data.power_information;
      unitData.unitType = singleUnitData.data.data.unit_type;

      //data for fan evaluation
      unitData.fanSettings = {
        fan_mode: singleUnitData.data.data.fan_mode,
        fresh_air: singleUnitData.data.data.fresh_air,
      };

      //data for 5/25 evaluation
      unitData.fiveTwentyFiveEngaged = singleUnitData.data.data.five_twenty_five_engaged;
      unitData.tempLimit525 = singleUnitData.data.data.limit_525;

      //data for facility purge
      unitData.facilityPurge = singleUnitData.data.data.facility_purge;

      //data for humidity control
      unitData.humidityMonitoring = singleUnitData.data.data.humidity_monitoring;

      //data of managed or un managed
      unitData.managed = singleUnitData.data.data.dlc_managed;

      return unitData;
    } else {
      throw {
        response: {
          data: {
            message: singleUnitData.data.message,
          },
        },
      };
    }
  } catch (err) {
    logging.log(`[SUD] [UNIT ${unit}] - ${err}`);
    return -1;
  }
};

module.exports = singleUnitDetails;
