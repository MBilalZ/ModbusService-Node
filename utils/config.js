// Description: This file contains the base url for the api and the endpoints

// short term readings endpoint to create new readings
const short_term_readings_create = '/short-term/create';

// short term readings endpoint to get latest readings
const short_term_readings_latest = '/short-term/get/latest?zone_id=';

// units readings endpoint to get latest readings of all units
const units_readings_latest = '/units/list';

// Outside temp endpoint to get latest outside temp
// const get_outside_temp = '/monitor/list';
const get_outside_temp = '/weather/list';

// Outside temp endpoint to get latest outside temp
const get_single_unit_readings = '/units/edit';

// Change mode of unit
const change_mode = '/monitor/mode/change';

// Save temp alerts api to save all temperatures alerts to db
const temp_alerts = '/alerts/store';

//get peak time hours from db
const peak_time_hours = '/peak_time/view';

//get previous mode
const get_previous_mode = '/monitor/mode/latest';

//set override type in db
const set_override_type = '/monitor/override/type/change';

// get last mode of particular unit
const get_last_mode_dlc = '/short-term/get_mode/latest';

// get las status of particular unit
const get_last_status_dlc = '/short-term/get_status/latest';

// get current & allowed power
const get_power_dlc = '/monitor/powers';

// getting logged in user details
const get_me = '/me';

// getting system data from db
const get_system_data = '/system_data/view';

// get last mode of particular unit
const get_last_heat_cool_mode_dlc = '/monitor/mode/heat_or_cool/latest';

// get latest fan status
const get_last_fan = '/short-term/get_fan_status/latest';

// get latest cool run
const get_last_cool_run = '/short-term/get_unit_status/latest';

// getting frequency of alert
// const get_alerts_frequency = '/alerts/count/get?freq_type=2';
const get_alerts_frequency = (freq, unit_number) => {
  return `/alerts/count/get?freq_type=${freq}&unit_number=${unit_number}`;
};

// getting last unit run time if 4h passed
const get_last_alerts = (unit_number, type) => {
  return `/alerts/type/since?unit_number=${unit_number}&freq_type=${type}`;
};

// get unit running time in minutes
// const get_unit_running_time = '/short-term/mode/since';
const get_unit_running_time = (id, status) => {
  return `/short-term/mode/since?unit_number=${id}&status=${status}`;
};

// get logs status
const get_logs_status = '/logs/status';

// get system baud rate
// const get_baud_rate = '/static-fields/baud-rate/get';
const get_static_fields = (key) => {
  return `/static-fields/key/get?key=${key}`;
};

// get humidity run time
const get_humidity_run_time = '/humidity/does-humid-exist';

// getting unit offline time from db
// const get_unit_offline_time = '/short-term/unit-offline/since';
const get_unit_offline_time = (id) => {
  return `/short-term/unit-offline/since?unit_number=${id}`;
};

// getting unit offline status form db
// const get_unit_offline_status = '/short-term-last-reading';
const get_unit_offline_status = (id) => {
  return `/short-term-last-reading?unit_number=${id}`;
};

const config = {
  short_term_readings_create,
  short_term_readings_latest,
  units_readings_latest,
  get_outside_temp,
  change_mode,
  get_single_unit_readings,
  temp_alerts,
  peak_time_hours,
  set_override_type,
  get_last_mode_dlc,
  get_last_status_dlc,
  get_power_dlc,
  get_previous_mode,
  get_me,
  get_system_data,
  get_alerts_frequency,
  get_last_heat_cool_mode_dlc,
  get_last_fan,
  get_last_cool_run,
  get_unit_running_time,
  get_last_alerts,
  get_logs_status,
  get_static_fields,
  get_humidity_run_time,
  get_unit_offline_time,
  get_unit_offline_status,
};

module.exports = config;
