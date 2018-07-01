import fs = require("fs");
import util = require("util");
import { Agent } from "./agent";

function main() {
  // Simple sanity check. Configuration file must be present.
  if (process.argv.length != 3) {
    console.log("Usage: node " + process.argv[1] + " CONFIG_FILE.json ")
    return;
  }

  // Load configuration file.
  fs.readFile(process.argv[2], function (err, data) {
    if (err) {
      return console.error(err);
    }
    let agent = new Agent();
    agent.start();
  });
}

main();
