
var shpsys = require("../");
shpsys.enableLogging();
shpsys.runCommands(process.argv.slice(2), done);

function done(err) {
    if (err) {
        shpsys.printError(err);
        process.exit(1);
    } else {
        process.exit(0);
    }
}