#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const USAGE = `Usage: prepare-snapshot.mjs --repo <abs-dir> --dest <abs-dir> [--base <commit>]`;

const KEEP_ENV_FILES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
]);

const SKIP_SANITIZE_DIRS = new Set([".git", "node_modules"]);

function fail(message, showUsage = false) {
  console.error(`prepare-snapshot.mjs: ${message}`);
  if (showUsage) console.error(USAGE);
  process.exit(showUsage ? 2 : 1);
}

function sanitizeTree(rootDir) {
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (SKIP_SANITIZE_DIRS.has(entry.name)) continue;
        if (entry.name === ".terraform") {
          const tfState = path.join(fullPath, "terraform.tfstate");
          if (fs.existsSync(tfState)) {
            fs.rmSync(tfState, { force: true });
          }
          continue;
        }
        stack.push(fullPath);
        continue;
      }

      const name = entry.name;
      const isTfState =
        name === "terraform.tfstate" ||
        name.endsWith(".tfstate") ||
        name.includes(".tfstate.");
      const isSecretEnv =
        (name === ".env" || name.startsWith(".env.")) &&
        !KEEP_ENV_FILES.has(name);

      if (isTfState || isSecretEnv) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      repo: { type: "string" },
      dest: { type: "string" },
      base: { type: "string" },
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

if (!opts.repo || !opts.dest) {
  fail("--repo and --dest are required", true);
}

if (!path.isAbsolute(opts.repo) || !path.isAbsolute(opts.dest)) {
  fail("--repo and --dest must be absolute paths");
}

if (!fs.existsSync(opts.repo) || !fs.statSync(opts.repo).isDirectory()) {
  fail(`repo directory not found: ${opts.repo}`);
}

const repoReal = fs.realpathSync(opts.repo);
const destResolved = path.resolve(opts.dest);

if (
  destResolved === repoReal ||
  destResolved.startsWith(repoReal + path.sep) ||
  repoReal.startsWith(destResolved + path.sep)
) {
  fail(`--dest must not overlap with --repo: ${destResolved}`);
}

if (fs.existsSync(destResolved)) {
  fs.rmSync(destResolved, { recursive: true, force: true });
}

fs.mkdirSync(path.dirname(destResolved), { recursive: true });

// Prefer APFS Copy-on-Write clone (cp -cR) on macOS; fall back to cp -R, then fs.cpSync.
const cpBin = fs.existsSync("/bin/cp") ? "/bin/cp" : "cp";
let cpRes = spawnSync(cpBin, ["-cR", repoReal, destResolved], {
  encoding: "utf8",
  stdio: ["ignore", "ignore", "pipe"],
});
if (cpRes.status !== 0) {
  if (fs.existsSync(destResolved)) {
    fs.rmSync(destResolved, { recursive: true, force: true });
  }
  cpRes = spawnSync(cpBin, ["-R", repoReal, destResolved], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (cpRes.status !== 0) {
    try {
      if (fs.existsSync(destResolved)) {
        fs.rmSync(destResolved, { recursive: true, force: true });
      }
      fs.cpSync(repoReal, destResolved, {
        recursive: true,
        verbatimSymlinks: true,
      });
    } catch (err) {
      fail(`failed to copy repository: ${err.message}`);
    }
  }
}

// Sanitize .git inside snapshot.
const dotGitPath = path.join(destResolved, ".git");
let mode = "standalone-git";

if (fs.existsSync(dotGitPath)) {
  const stat = fs.lstatSync(dotGitPath);
  if (stat.isFile()) {
    // Source repo itself is a git worktree: remove external .git pointer and write diff file if --base given.
    fs.rmSync(dotGitPath, { force: true });
    mode = "no-git";
  } else if (stat.isDirectory()) {
    // Remove all git hooks so no hook can execute outside intent.
    const hooksDir = path.join(dotGitPath, "hooks");
    if (fs.existsSync(hooksDir)) {
      fs.rmSync(hooksDir, { recursive: true, force: true });
    }
    // Remove all git remotes so git push/fetch cannot reach remote repos.
    const gitBin = fs.existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";
    const remotesRes = spawnSync(gitBin, ["-C", destResolved, "remote"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (remotesRes.status === 0 && remotesRes.stdout.trim()) {
      for (const remote of remotesRes.stdout.trim().split(/\r?\n/)) {
        if (!remote.trim()) continue;
        spawnSync(gitBin, ["-C", destResolved, "remote", "remove", remote.trim()], {
          stdio: "ignore",
        });
      }
    }
  }
}

// Always write .interrogate.diff when --base is provided (useful especially in no-git mode).
if (opts.base) {
  const gitBin = fs.existsSync("/usr/bin/git") ? "/usr/bin/git" : "git";
  const diffRes = spawnSync(
    gitBin,
    ["-C", repoReal, "diff", `${opts.base}..HEAD`],
    {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (diffRes.status === 0) {
    fs.writeFileSync(path.join(destResolved, ".interrogate.diff"), diffRes.stdout, "utf8");
  }
}

sanitizeTree(destResolved);

console.log(JSON.stringify({ dest: destResolved, mode }));
