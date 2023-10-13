#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const { generateZwo, parse, stats, formatStats, parseCliOptions } = require("../dist/index");

const opts = parseCliOptions();

const baseName = opts.file;
const inFile = `examples/${baseName}.txt`;
const outFile1 = `/Users/pearce/Documents/Zwift/Workouts/5460176/${baseName}.zwo`;
const outFile2 = `examples/${baseName}.zwo`;

const workout = parse(fs.readFileSync(inFile, "utf8"));

if (opts.stats) {
  console.log(formatStats(stats(workout)));
} else {
  const zwo = generateZwo(workout);
  fs.writeFileSync(outFile1, zwo);
  fs.writeFileSync(outFile2, zwo);
}
