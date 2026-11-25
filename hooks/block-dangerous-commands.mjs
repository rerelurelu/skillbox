#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ALLOWED_TERRAFORM_SUBCOMMANDS = new Set([
  "fmt",
  "validate",
  "test",
  "version",
]);

const BLOCKED_JUST_RECIPES = new Set([
  "apply",
  "plan",
  "destroy",
]);

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }) + "\n",
  );
  process.exit(0);
}

// Split a shell command into segments on unquoted separators (&&, ||, ;, |, newline).
function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "\n" || ch === ";" || ch === "|") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if (ch === "|" && command[i + 1] === "|") i++;
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      i++;
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

// Tokenize a single segment, stripping outer quotes.
function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

// Strip leading VAR=val assignments and wrapper commands (env, command, exec, sudo, noglob).
function stripLeadingWrappers(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) {
      i++;
      continue;
    }
    const base = path.basename(tok);
    if (base === "env") {
      i++;
      while (i < tokens.length) {
        if (tokens[i] === "-u" || tokens[i] === "-C" || tokens[i] === "-S") {
          i += 2;
        } else if (tokens[i].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
          i++;
        } else {
          break;
        }
      }
      continue;
    }
    if (base === "command" || base === "exec" || base === "sudo" || base === "noglob") {
      i++;
      while (i < tokens.length && tokens[i].startsWith("-")) i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

function checkSegment(segment) {
  const tokens = stripLeadingWrappers(tokenize(segment));
  if (tokens.length === 0) return null;

  const cmd = path.basename(tokens[0]);
  const args = tokens.slice(1);

  if (cmd === "aws") {
    return "Blocked by relubox guardrail: aws CLI must be run manually by the user.";
  }

  if (cmd === "terraform" || cmd === "tofu") {
    // Find first positional subcommand (skip global flags like -chdir=..., -help, -version).
    let sub = null;
    for (const arg of args) {
      if (arg === "-version" || arg === "--version" || arg === "-help" || arg === "--help") {
        return null;
      }
      if (arg.startsWith("-")) continue;
      sub = arg;
      break;
    }
    if (sub && !ALLOWED_TERRAFORM_SUBCOMMANDS.has(sub)) {
      return `Blocked by relubox guardrail: '${cmd} ${sub}' is not allowed (only fmt, validate, test, version are permitted).`;
    }
  }

  if (cmd === "just") {
    // Skip flags (including flags taking a value like -f/--justfile/-d/--working-directory).
    let skipNext = false;
    for (const arg of args) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (arg === "-f" || arg === "--justfile" || arg === "-d" || arg === "--working-directory") {
        skipNext = true;
        continue;
      }
      if (arg.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) {
        continue;
      }
      if (BLOCKED_JUST_RECIPES.has(arg)) {
        return `Blocked by relubox guardrail: 'just ${arg}' must be run manually by the user.`;
      }
      break;
    }
  }

  if (cmd === "git") {
    let skipNext = false;
    for (const arg of args) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      if (arg === "-C" || arg === "-c" || arg === "--git-dir" || arg === "--work-tree") {
        skipNext = true;
        continue;
      }
      if (arg.startsWith("-")) continue;
      if (arg === "push") {
        return "Blocked by relubox guardrail: 'git push' must be run manually by the user.";
      }
      break;
    }
  }

  return null;
}

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

if (!raw.trim()) process.exit(0);

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = payload?.tool_input?.command;
if (typeof command !== "string" || !command.trim()) {
  process.exit(0);
}

for (const seg of splitSegments(command)) {
  const reason = checkSegment(seg);
  if (reason) {
    deny(reason);
  }
}

process.exit(0);
