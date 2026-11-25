#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const codexRulesDir =
  process.env.QSTACK_CODEX_RULES_DIR ||
  path.join(os.homedir(), ".codex", "rules");

const REQUIRED_CODEX_FORBIDDEN = [
  ["aws"],
  ["terraform", "apply"],
  ["terraform", "plan"],
  ["terraform", "destroy"],
  ["terraform", "import"],
  ["terraform", "state"],
  ["terraform", "refresh"],
  ["terraform", "force-unlock"],
  ["terraform", "taint"],
  ["terraform", "untaint"],
  ["terraform", "workspace"],
  ["terraform", "init"],
  ["just", "apply"],
  ["just", "plan"],
  ["just", "destroy"],
];

function stripStarlarkComments(source) {
  let out = "";
  let inQuote = null;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuote) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      out += ch;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      if (i < source.length) out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

// Extract balanced call bodies of prefix_rule(...) respecting quotes and nested parens.
function extractPrefixRuleBodies(source) {
  const bodies = [];
  const re = /\bprefix_rule\s*\(/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let depth = 1;
    let quote = null;
    let escaped = false;
    const start = i;

    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
      i++;
    }
    if (depth === 0) {
      bodies.push(source.slice(start, i - 1));
    }
  }
  return bodies;
}

// Extract balanced [...] list following pattern=
function extractPatternList(body) {
  const m = body.match(/\bpattern\s*=\s*\[/);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let quote = null;
  let escaped = false;
  const start = i;

  while (i < body.length && depth > 0) {
    const ch = body[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    }
    i++;
  }
  if (depth !== 0) return null;
  return body.slice(start, i - 1);
}

const errors = [];
let codexMissing = [];

if (!fs.existsSync(codexRulesDir) || !fs.statSync(codexRulesDir).isDirectory()) {
  errors.push(`Codex ルールディレクトリが見つかりません: ${codexRulesDir}`);
  codexMissing = [...REQUIRED_CODEX_FORBIDDEN];
} else {
  const ruleFiles = fs
    .readdirSync(codexRulesDir)
    .filter((f) => f.endsWith(".rules"))
    .map((f) => path.join(codexRulesDir, f));

  if (ruleFiles.length === 0) {
    errors.push(`Codex ルールファイル (*.rules) が見つかりません: ${codexRulesDir}`);
    codexMissing = [...REQUIRED_CODEX_FORBIDDEN];
  } else {
    const foundForbidden = [];
    for (const file of ruleFiles) {
      try {
        const cleaned = stripStarlarkComments(fs.readFileSync(file, "utf8"));
        for (const body of extractPrefixRuleBodies(cleaned)) {
          const decisionMatch = body.match(/\bdecision\s*=\s*["']([^"']+)["']/);
          if (!decisionMatch || decisionMatch[1] !== "forbidden") continue;

          const patternContent = extractPatternList(body);
          if (!patternContent) continue;

          const tokens = [...patternContent.matchAll(/["']([^"']+)["']/g)].map(
            (m) => m[1],
          );
          if (tokens.length > 0) {
            foundForbidden.push(tokens);
          }
        }
      } catch (err) {
        errors.push(`Codex ルールファイルの読み込みに失敗しました (${file}): ${err.message}`);
      }
    }

    for (const req of REQUIRED_CODEX_FORBIDDEN) {
      const covered = foundForbidden.some(
        (rule) =>
          rule.length <= req.length &&
          rule.every((token, idx) => req[idx] === token),
      );
      if (!covered) {
        codexMissing.push(req);
      }
    }
  }
}

if (errors.length === 0 && codexMissing.length === 0) {
  console.log("OK: guardrails configured");
  process.exit(0);
}

console.error("ガードレール設定が不足しています。");
for (const err of errors) {
  console.error(`- ${err}`);
}

if (codexMissing.length > 0) {
  console.error(`\n[${path.join(codexRulesDir, "default.rules")}] に追加してください:`);
  for (const tokens of codexMissing) {
    const pat = tokens.map((t) => `"${t}"`).join(", ");
    console.error(`prefix_rule(pattern=[${pat}], decision="forbidden")`);
  }
}

process.exit(1);
