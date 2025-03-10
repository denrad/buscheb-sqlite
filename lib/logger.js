const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'app.log');

function logMessage(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`, 'utf8');
}

module.exports = { logMessage };