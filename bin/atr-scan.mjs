#!/usr/bin/env node

import { runCli } from "../.claude/skills/agent-team-readiness/scripts/scan.mjs";

await runCli(process.argv.slice(2));

