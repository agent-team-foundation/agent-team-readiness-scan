#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";
import { validateReport } from "./lib/validate.mjs";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: validate-report.mjs <atr-1.json>\n");
  process.exitCode = 1;
} else {
  try {
    const report = JSON.parse(await readFile(file, "utf8"));
    validateReport(report);
    process.stdout.write(`valid atr-1: ${file}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

