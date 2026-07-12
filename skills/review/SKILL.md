---
name: review
description: |
  Unified code review using Codex CLI (always) and optionally Cursor Agent CLI.
  Triggers on: "review", "code review", "review this", "/review"
  Use when: reviewing implementation plans, architectural designs, or code.
  Cross-references findings from multiple tools, debates disagreements, filters by severity, and applies fixes.
user-invocable: true
license: "GPL-3.0"
---

# Unified Review

Review code using Codex CLI (always) and optionally Cursor Agent CLI. Cross-reference findings, debate disagreements, filter by severity, and apply fixes.

## Commands

**Codex** (always):

```bash
codex exec --full-auto --sandbox read-only --cd <project_directory> "<request>"
```

**Cursor** (when enabled):

```bash
cursor agent --print --model composer-2 --trust --workspace <project_directory> --mode ask "<request>"
```

## Prompt Rules

Every request sent to Codex or Cursor **MUST** include both sentences verbatim:

1. "No questions or confirmations needed. Proactively output specific proposals, fixes, and code examples."
2. "Filter findings by: (1) Critical issues (bugs, security, design flaws), (2) Issues worth fixing that are easy to address. Omit minor nitpicks and style preferences."

## Workflow

### Phase 0: Delegate to a Background Subagent

External review tools take minutes to respond. Never run them inline in the main conversation — the user's session would block with no visible progress.

**If you are the main conversation agent**: do not execute Phases 1–6 yourself. Instead:

1. Launch a background subagent that inherits the conversation context (Claude Code: `Agent` tool with `subagent_type: "fork"`). Prompt it with: "You are the review subagent. Read <absolute path to this SKILL.md> and execute its workflow from Phase 1 onward. Scope: <scope from the user's request>. Report findings only — do not modify any files."
2. Tell the user in one line that the review is running in the background, then return control immediately. Continue other pending work; do not wait for the review.
3. When the subagent's completion notification arrives, relay its report to the user as-is (do not re-run the review), then handle fix application per Phase 6.

**If you are the review subagent**: skip this phase and execute Phases 1–6 directly. Never apply fixes yourself — produce the report only; the main agent owns file changes.

### Phase 1: Determine Scope

If `$ARGUMENTS` specifies files or a scope, use that. Otherwise default to changed files since the last commit:

```bash
git diff HEAD --name-only
```

If the diff is empty, inform the user and stop.

### Phase 2: Determine Review Type

Examine the scope and classify:

- **Plan** — implementation plans, task lists, TODO documents
- **Design** — architecture docs, design decisions
- **Code** — source code files (default)

### Phase 3: Execute Reviews

1. Read `.claude/settings.json` in the project root. If it contains `"cursorEnabled": true`, Cursor will also be used.
2. Compose the review prompt including both mandatory prompt rules.
3. Execute:
   - **Codex only** (default): single Bash call
   - **Codex + Cursor**: two independent Bash calls in parallel

### Phase 4: Scrutinize and Debate

Review every finding yourself.

**When you doubt or disagree with a finding**, start a discussion autonomously:

1. Quote the specific point from the tool's response
2. State your concern or counterargument concretely
3. Send a follow-up prompt to that tool, including: "Be frank and direct. Don't hold back — push back candidly." (plus both standard prompt rules)
4. Continue until convergence (no round limit)
5. Record the outcome

**When tools disagree with each other** (Codex + Cursor mode):

1. Present both positions
2. State your own analysis
3. Follow up with the tool whose position you find weaker
4. Resolve and record

### Phase 5: Classify and Filter

Assign severity to each surviving finding:

| Severity | Action | Criteria |
|----------|--------|----------|
| **CRITICAL** | Must fix | Bugs, security vulnerabilities, data loss, crashes |
| **HIGH** | Must fix | Design flaws, race conditions, significant logic errors |
| **MEDIUM** | Consider | Performance, maintainability, minor logic gaps |
| **LOW** | Skip | Style preferences, minor nitpicks, cosmetic issues |

Drop all LOW findings.

### Phase 6: Report and Fix

**Report** findings to the user:

```
## レビュー結果

### スコープ
<files reviewed>

### 使用ツール
Codex / Codex + Cursor

---

### CRITICAL
- [ ] <finding with file:line and explanation>

### HIGH
- [ ] <finding with file:line and explanation>

### MEDIUM（検討）
- <finding with brief explanation>

---

### クロスリファレンス（両ツール使用時のみ）
一致: N件 / Codexのみ: N件 / Cursorのみ: N件 / 意見相違（解決済）: N件

### 議論結果（議論発生時のみ）
**論点**: <topic>
**対象ツール**: <Codex or Cursor>
**結論**: <resolution and reasoning>

---

### 適用した修正
- <what was changed and why>
```

**Apply fixes**:
- CRITICAL and HIGH: apply immediately without asking
- MEDIUM: list for user decision, do not apply automatically
