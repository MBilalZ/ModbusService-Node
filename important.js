let obj = {
  deg_or_cel: 1, // MODBUS_TEMP_SELECT (0: C, 1: F) //done
  remote_sensor: 0, // analog input 1, use if selected in unit setup
  current_temp: 0, // remote sensor or internal thermistor //done
  set_temp: 0, // set point of temperature //done
  relay_status: 0, // used to calculate the status //done
  cool_heat_mode: 0, // mode of the thermostat //done
  supply_temp: 0, // analog input 2 //done
  humidity: 0.5, //send humidity value in decimal, analog input 3 //done
  humidity_set_point: 0.5, //coming from db, used only in short term
  max_status: 0, // no idea about this, used only in short term
  power: 0, // coming from db, used only in short term
  sensor_type: 0, // MODBUS_TEMP_SELECT (0: internal, 1: external) used in unit data //
  manual_mode: 0, // MODBUS_OUTPUT_MANU_ENABLE (0: auto, 31: manual) used in unit data and dlc operation
  mode_num: 0, // coming from db
  device_manager_id: '/dev/ttyUSB0', // the port of the device
  cool_occ_time: 0, // coming from db
  cool_peak_time: 0, // coming from db
  warm_occ_time: 0, // coming from db
  temperature_data: Object, // coming from db
  int_cal_fact: 0, // coming from db, checked if value is changed
  rmt_cal_fact: 0, // coming from db, checked if value is changed
  min_setpoint: 0, // coming from db, checked if value is changed
  max_setpoint: 0, // coming from db, checked if value is changed
  icons_manual: 0, // setting the icons to be manually set
  unit_type: 0, // setting relays types
  icon: 0, // field for tracking the current icon

  // adding for get settings features
  modbus_address: 0,
  product_model: 0,
  hardware_rev: 0,
  pic_version: 0,
  internal_thermistor: 0,
  analog_input1: 0,
  day_heat_setpoint: 0,
  day_cool_setpoint: 0,
  night_heat_setpoint: 0,
  night_cool_setpoint: 0,
  day_heat_deadband: 0,
  day_cool_deadband: 0,
  night_heat_deadband: 0,
  night_cool_deadband: 0,
  control_relay: 0,
};

// TODO: set relay to manual mode, manual mode register 254
