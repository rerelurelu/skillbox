#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage: open-pane.mjs --tool <codex|agy> --dir <abs-dir> --model <model> \\
  [--effort <effort>] [--direction <right|down>] [--pane <pane-id>] \\
  [--online] [--dry-run]`;

const ENV_PREFIX = [
  "env",
  "-u", "AWS_PROFILE",
  "-u", "AWS_DEFAULT_PROFILE",
  "-u", "AWS_ACCESS_KEY_ID",
  "-u", "AWS_SECRET_ACCESS_KEY",
  "-u", "AWS_SESSION_TOKEN",
  "-u", "AWS_SECURITY_TOKEN",
  "-u", "AWS_ROLE_ARN",
  "-u", "AWS_WEB_IDENTITY_TOKEN_FILE",
  "-u", "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "-u", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONFIG_FILE=/dev/null",
  "AWS_SHARED_CREDENTIALS_FILE=/dev/null",
  "AWS_EC2_METADATA_DISABLED=true",
];

function fail(message, showUsage = false) {
  console.error(`open-pane.mjs: ${message}`);
  if (showUsage) {
    console.error(USAGE);
  }
  process.exit(showUsage ? 2 : 1);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      tool: { type: "string" },
      dir: { type: "string" },
      model: { type: "string" },
      effort: { type: "string" },
      direction: { type: "string" },
      pane: { type: "string" },
      online: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });
} catch (err) {
  fail(err.message, true);
}

const opts = parsed.values;

if (opts.help) {
  console.error(USAGE);
  process.exit(0);
}

if (!opts.tool || !opts.dir || !opts.model) {
  fail("--tool, --dir, and --model are required", true);
}

if (!path.isAbsolute(opts.dir)) {
  fail(`--dir must be an absolute path: ${opts.dir}`);
}

if (!fs.existsSync(opts.dir) || !fs.statSync(opts.dir).isDirectory()) {
  fail(`directory not found: ${opts.dir}`);
}

const absDir = fs.realpathSync(opts.dir);

if (opts.tool !== "codex" && opts.tool !== "agy") {
  fail("--tool must be codex or agy");
}

if (opts.tool === "codex" && !opts.effort) {
  fail("--effort is required for codex");
}

if (opts.tool === "agy" && opts.effort) {
  fail("--effort is not supported for agy (include effort in --model instead)");
}

if (!opts["dry-run"]) {
  if (!opts.direction || !opts.pane) {
    fail("--direction and --pane are required unless --dry-run is set", true);
  }
  if (opts.direction !== "right" && opts.direction !== "down") {
    fail("--direction must be right or down");
  }
}

const argvItems = [...ENV_PREFIX];

if (opts.tool === "codex") {
  const networkAccess = opts.online ? "true" : "false";

  // --no-daemon keeps Codex inside Herdr instead of running via an external daemon.
  argvItems.push(
    "codex",
    "--no-daemon",
    "-C", absDir,
    "-m", opts.model,
    "-c", `model_reasoning_effort=${opts.effort}`,
    "-c", `sandbox_workspace_write.network_access=${networkAccess}`,
    "-s", "workspace-write",
    "-a", "never",
  );
} else {
  const agyCmd = [
    "agy",
    "--model", opts.model,
    "--sandbox",
    "--settings", JSON.stringify({ allowNonWorkspaceAccess: false }),
  ];

  argvItems.push(
    "sh",
    "-c",
    'cd "$1" && shift && exec "$@"',
    "_",
    absDir,
    ...agyCmd,
  );
}

const argvJson = JSON.stringify(argvItems);

if (opts["dry-run"]) {
  console.log(argvJson);
  process.exit(0);
}

const splitRes = spawnSync(
  "herdr-app",
  [
    "do",
    "pane.split",
    "--direction",
    opts.direction,
    "--pane",
    opts.pane,
    "--argv",
    argvJson,
  ],
  { stdio: "inherit" },
);

if (splitRes.error) {
  fail(`failed to run herdr-app: ${splitRes.error.message}`);
}
process.exit(splitRes.status ?? 1);
