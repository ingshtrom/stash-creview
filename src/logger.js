var winston = require('winston'),
    config = require('./config');
var consoleConfig, fileConfig;

// MODULE API
module.exports.logger = configure();

// MODULE IMPLEMENTATIONS
function configure () {
    // add our custom transports for all loggers
    consoleConfig = {
        level: config.consoleLogLevel,
        colorize: true,
        handleExceptions: false,
        timestamp: true
    };
    fileConfig = {
        filename: config.defaultLogFile,
        level: config.fileLogLevel,
        maxsize: 102400,
        handleExceptions: true,
        timestamp: true
    };
    winston.exitOnError = true;

    return new (winston.Logger)({
        transports: [
            new (winston.transports.Console)(consoleConfig),
            new (winston.transports.File)(fileConfig)
        ]
    });
}