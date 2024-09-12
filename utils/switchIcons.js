/**
 * 
 * @param {number} status the relay status of the unit
 * @param {string} override_type the override type of the unit
 * @returns {number} the icon number
 * 
 * The code determines and returns the corresponding icon code based on the status and override type. 
 * The icon code represents the visual representation of the switch.
 */
const switchIcons = (status, override_type) => {

  if (override_type === 'UNO') {
    if (status === 9 || status === 11) {
      return 19;
    } else if (status === 17 || status === 21) {
      return 21;
    } else if (status === 1) {
      return 17;
    } else {
      return 1;
    }
  } else {
    if (status === 9 || status === 11) {
      return 146;
    } else if (status === 17 || status === 21) {
      return 148;
    } else if (status === 1) {
      return 144;
    } else {
      return 128;
    }
  }
}

module.exports = switchIcons;