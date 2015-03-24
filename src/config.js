module.exports.consoleLogLevel = 'info';
module.exports.fileLogLevel = 'silly';
module.exports.defaultLogFile = getUserHome() + '/creview.log';

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}