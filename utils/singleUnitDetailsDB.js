const logging = require('./logging');
const { createConnection, closeConnection } = require('../services/db');

/**
 *
 * @param { id } unit number
 *
 * Retrieves detailed information and settings for a single AC unit from a database. Returns the unit data or -1 if unsuccessful.
 */
const singleUnitDetailsDB = async (id) => {
  let unitData = {};
  let finalData = {
    occ_hours: {},
    heat_cool: {},
    temperature_settings: {
      cool: {},
      warm: {},
    },
    fan_settings: {},
  };

  try {
    const query = `
    SELECT *
    FROM system_ac_units_setup AS su
    LEFT JOIN devices_manager AS dm ON su.device_manager_id = dm.id
    LEFT JOIN ac_unit_information AS ai ON su.id = ai.ac_unit_id
    LEFT JOIN ac_unit_power_information AS pi ON su.id = pi.ac_unit_id
    LEFT JOIN ac_unit_temperature AS at ON su.id = at.ac_unit_id
    LEFT JOIN facility_purges AS fp ON su.id = fp.ac_unit_id
    WHERE su.unit_number = ?
  `;

    // creating database connection here
    const connection = await createConnection();

    const rows = await new Promise((resolve, reject) => {
      connection.query(query, [id], (err, rows, fields) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    if (rows.length === 0) {
      // Handle the case where no data is found
      logging.log(`SUD - No data found for single unit details - DB`);

      // closing database connection here
      await closeConnection(connection);
      return null;
    }

    const data = rows[0];

    // closing database connection here
    await closeConnection(connection);

    const monday = data.mon_occ_timings;
    const tuesday = data.tue_occ_timings;
    const wednesday = data.wed_occ_timings;
    const thursday = data.thu_occ_timings;
    const friday = data.fri_occ_timings;
    const saturday = data.sat_occ_timings;
    const sunday = data.sun_occ_timings;

    // const monday = JSON.parse(data.mon_occ_timings);
    // const tuesday = JSON.parse(data.tue_occ_timings);
    // const wednesday = JSON.parse(data.wed_occ_timings);
    // const thursday = JSON.parse(data.thu_occ_timings);
    // const friday = JSON.parse(data.fri_occ_timings);
    // const saturday = JSON.parse(data.sat_occ_timings);
    // const sunday = JSON.parse(data.sun_occ_timings);

    finalData.override_type = data.set_temp_type;

    finalData.occ_hours.monday = monday;
    finalData.occ_hours.tuesday = tuesday;
    finalData.occ_hours.wednesday = wednesday;
    finalData.occ_hours.thursday = thursday;
    finalData.occ_hours.friday = friday;
    finalData.occ_hours.saturday = saturday;
    finalData.occ_hours.sunday = sunday;

    finalData.heat_cool.mode = data.heat_cool_mode;
    finalData.heat_cool.switch_delta = data.switch_delta;
    finalData.heat_cool.min_switch_time = data.min_switch_time;
    finalData.heat_cool.hysterisis = data.hysterisis;
    finalData.heat_cool.heat_hi_limit = data.external_high_temp_limit;
    finalData.heat_cool.cool_low_limit = data.external_low_cool_limit;

    finalData.temperature_settings.cool.occ_low = data.cool_occ_low;
    finalData.temperature_settings.cool.occ_ideal = data.cool_occ_ideal;
    finalData.temperature_settings.cool.occ_high = data.cool_occ_high;
    finalData.temperature_settings.cool.un_occ_ideal = data.cool_unocc_ideal;
    finalData.temperature_settings.cool.un_occ_high = data.cool_unocc_high;
    finalData.temperature_settings.cool.precool_occ_time = data.precool_occ_time;
    finalData.temperature_settings.cool.precool_peak_time = data.precool_peak_time;
    finalData.temperature_settings.cool.precool_peak = data.precool_peak === 0 ? false : true;
    finalData.temperature_settings.cool.zone_priority = data.zone_priority;
    finalData.temperature_settings.cool.optimal_precool_start = data.optimal_start_precool_time === 0 ? false : true;

    finalData.temperature_settings.warm.occ_ideal = data.warm_occ_ideal;
    finalData.temperature_settings.warm.un_occ_ideal = data.warm_unocc_ideal;
    finalData.temperature_settings.warm.preheat_time = data.preheat_occ_time;
    finalData.temperature_settings.warm.optimal_preheat_start = data.optimal_start_preheat_time === 0 ? false : true;

    finalData.fan_settings.device_manager_name = data.name;
    finalData.fan_settings.fan_mode = data.fan_mode;
    finalData.fan_settings.fresh_air = {
      mode: data.fresh_air,
      recirculation_minutes_on: data.recirculation_minutes_on,
      refresh_period: data.recirculation_refresh_period,
    };

    unitData.OccHours = finalData.occ_hours;
    unitData.heatCoolLimits = finalData.heat_cool;
    unitData.preHeatTime = finalData.temperature_settings.warm;
    unitData.preCoolTime = finalData.temperature_settings.cool;
    unitData.fanSettings = finalData.fan_settings;
    unitData.override_type = finalData.override_type;

    unitData.fiveTwentyFiveEngaged = finalData.five_twenty_five_engaged;
    unitData.tempLimit525 = finalData.limit_525;

    unitData.facilityPurge = finalData.facility_purge;

    return unitData;
  } catch (err) {
    logging.log(`[DLC] - Error: ${err.message}`);
    return -1;
  }
};

module.exports = singleUnitDetailsDB;
