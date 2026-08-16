---
name: team-review
description: |
  Runs a review team of Claude Code teammates over one scope: Codex CLI, the built-in code-review skill, and self-review when installed. A facilitator teammate makes the reviewers argue their findings against each other, and the main agent then filters the surviving findings against the conversation context, applies fixes when the user authorized edits, and reports what changed. Requires Claude Code with agent teams enabled; on GitHub Copilot CLI use team-review-copilot instead.
  Triggers on: "review", "code review", "review this", "/team-review"
  Use when: reviewing code, implementation plans, or architectural designs.
version: "3.0.0"
user-invocable: true
argument-hint: "[scope] | --facilitator --briefing <path> --report <path>"
license: "GPL-3.0"
---

# Team Review

Three reviewers examine one scope independently and argue their findings against each other. A facilitator runs that argument but never touches the reviewed files. The main agent — the only participant that holds the conversation context — decides what to act on and makes every edit.

## Roles

Every participant except the main agent is a teammate: a separate Claude Code session with its own context window, spawned by the main agent.

| Role | Model | Responsibility | Writes |
|------|-------|----------------|--------|
| **main agent** (team leader) | the user's setting | Scope, briefing, spawning the team, filtering against conversation context, applying fixes, reporting | reviewed files |
| `facilitator` | `sonnet` | Groups the findings, runs the debate, triages, writes the report | **review directory only** |
| `codex-reviewer` | `sonnet` | Runs Codex CLI and carries debate messages to and from it | nothing |
| `cc-reviewer` | `opus` | Runs the built-in `code-review` skill at level `high` | nothing |
| `self-reviewer` | `opus` | Runs the `self-review` skill; absent when that skill is not installed | nothing |

The facilitator proposes; the main agent decides. **No participant except the main agent modifies a reviewed file.**

`codex-reviewer` runs on `sonnet` because it does not judge the code: it runs a command, reads the output file, and relays counterarguments back into Codex. The findings come from Codex's own model. `cc-reviewer` and `self-reviewer` produce their findings themselves, so they run on `opus`.

Use bare aliases (`opus`, `sonnet`), never a pinned name like `claude-sonnet-5`: aliases resolve to the newest model in that family, so these lines need no editing when models change.

## Preconditions

Agent teams is an experimental feature and is off by default. Check it before writing any file or spawning anything:

```bash
test "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" = 1
```

If this fails, report that this skill needs agent teams enabled — `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }` in `~/.claude/settings.json`, then restart the session — and stop. Do not fall back to plain subagents: they cannot message each other, so there is no debate.

## The review directory

Everything this skill produces goes in one directory, resolved like this:

```bash
review_dir="$(git rev-parse --path-format=absolute --git-path team-review)"
mkdir -p "$review_dir"
```

Use `--git-path`. Do not build the path from `--show-toplevel`: in a linked worktree or submodule, `<toplevel>/.git` is a file, not a directory.

## Worktree safety

The default review scope is uncommitted work. Anything that "cleans up" the tree destroys the thing under review.

**No participant may run any command that changes HEAD, the index, or any path in the reviewed working tree**, in any phase. This covers Git commands, shell file operations, formatters, generators, and build steps — not only the examples below.

Examples, not an exhaustive list:

```
git stash (any form)   git clean (except -n / --dry-run)
git reset (any form)   git switch
git checkout           git restore
gh pr checkout         rm / mv / overwriting cp
```

The one exception is Phase 8 step 4, where the main agent applies fixes the user authorized. The Roles table and Phase 8 already bound that; nothing else here overrides it.

Reviewers never read this file. Their copy of this rule is the prompt in Phase 4; change both together.

Read modified, staged, and untracked files, review them, and leave them where they are. Do not move them to `/tmp` or any holding directory either.

Write everything this review produces to `$review_dir`. Do not build a clean tree — no phase needs one. If a branch change is genuinely needed, stop and ask for that exact operation.

Read pull requests with `gh pr view` and `gh pr diff`.

## Invocation modes

This skill runs as two different participants, told apart by the arguments.

**Leader mode** (no `--facilitator`): execute Phases 1-4, then Phase 8. This is the normal entry point — `/team-review`, or any request to review something.

**Facilitator mode** (`--facilitator --briefing <path> --report <path>`): execute Phases 5-7 only. Read the briefing from the given path and write the report to the given path.

Resolve every `references/…` path against the skill's base directory, which the harness states on invocation (`Base directory for this skill: …`). Never against the current working directory.

## Phase 1: Determine Scope (leader)

Use the scope the user gave. If none was given, default to everything uncommitted — **including untracked files**:

```bash
{ git diff HEAD --name-only; git ls-files --others --exclude-standard; } | sort -u
```

`git diff HEAD` alone omits untracked files, so a newly added file is silently excluded from its own review. If both commands produce no paths, report that the scope is empty and stop.

## Phase 2: Determine Review Type (leader)

Classify the scope:

- **Plan** — implementation plans, task lists, TODO documents
- **Design** — architecture docs, design decisions
- **Code** — source code files (default)

Read `references/<type>.md` (plan.md / design.md / code.md) for this type's criteria and severity table. Name the type in the briefing so the facilitator reads the same file.

**Domain criteria.** Detect the domains the scope touches, from file paths and extensions:

- **fe** — `.tsx`/`.jsx`/`.vue`/`.svelte`, `components/`, `styles/`, `.css`/`.scss`
- **be** — `server/`, `api/`, `controllers/`, `models/`, `.sql`, ORM/migration files
- **infra** — `Dockerfile`, `docker-compose*`, `*.tf`, k8s manifests, `.github/workflows/`

Read `references/domains/<domain>.md` for each detected domain and name them in the briefing. These criteria are additive to the type criteria. Multiple domains may apply to one scope.

## Phase 3: Briefing (leader)

The reviewers have no conversation context. Give them enough to avoid wasted effort, and nothing that would tell them what to conclude.

**Include — facts:**

- What the change does, in a few sentences
- Scope boundaries: which paths are under review and which are not
- Anything deliberately unimplemented, stubbed, or left as a TODO, and why
- Review type and detected domains, with the `references/` files that apply
- Dependency and version summary
- Location of convention or decision docs (`docs/adr/`, `CONTRIBUTING.md`, `CLAUDE.md`)

**Exclude — conclusions:**

- "This design decision is sound"
- "This approach was already agreed with the user"
- "This is the project's established pattern"

Brief them on constraints, not on verdicts. A reviewer told that something is settled stops examining it.

**Dependency versions** (Code and Design scopes). Summarize version info from manifests or lockfiles present in the repo (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `build.gradle.kts`, `pom.xml`, `gradle/libs.versions.toml`). This is what lets a reviewer judge whether an API is deprecated for the versions actually in use.

**Version fact-check with deepwiki** (Code and Design scopes, when the deepwiki MCP is available). Read `references/deepwiki.md` and follow it: identify the exact versions of the language, runtime, framework, and the libraries the changed files import; resolve each to its GitHub repo; ask what that **specific version** recommends and what it deprecated. Cap this at 5 targets. Add the answers to the briefing as quoted facts with their source.

Reviewers cannot report a problem in a version released after their training data, and they do not know that they cannot. This step is what covers that gap. Skip it when the MCP is unavailable, and say so in the briefing so the report can record the skip.

**Check for `self-review`** in both scopes, and record which check was used:

```bash
test -f .claude/skills/self-review/SKILL.md || test -f ~/.claude/skills/self-review/SKILL.md
```

Checking only the user scope reports "not installed" for a project-scoped or plugin-provided skill, and the report then claims a reviewer was unavailable when it was not.

Write the briefing to `$review_dir/briefing-<UTC timestamp>.md`.

## Phase 4: Spawn the Team (leader)

Decide the report path here, not later — the facilitator writes to exactly this name:

```bash
report_path="$review_dir/report-$(date -u +%Y%m%dT%H%M%SZ)-$$.md"
```

Spawn all four teammates with the `Agent` tool, one call per teammate, in a single response so they start together. Teammates cannot spawn teammates, so the reviewers must be started here rather than by the facilitator.

Each call passes `name` and `model` exactly as the Roles table gives them. **A teammate does not inherit the leader's `/model`** — without `model` it takes whatever `/config` has as the default teammate model, which is not what this skill assumes.

**Skip `self-reviewer` entirely when `self-review` is not installed.** Two reviewers is a valid team; do not substitute anything in its place.

### Reviewer prompts

Every reviewer prompt — the Codex request, the `code-review` invocation, and the `self-review` invocation alike — carries the briefing path, the applicable `references/` files, and these lines verbatim. A reviewer never reads this SKILL.md, so a rule that stays here does not reach it.

```
Report findings only. Do not modify, create, or delete any file.
Do not change the checkout: no git stash, clean, reset, switch, checkout,
restore, and no gh pr checkout. Inspect a PR with gh pr view / gh pr diff.
Send your findings to the teammate named "facilitator" using SendMessage.
Do not message the team leader.
Write findings longer than 20 lines to <review_dir>/findings-<your name>.md
and send the facilitator a summary plus that path.
Stay available for follow-up questions until the facilitator says the review
is finished.
```

The checkout line is the one that does the work. "Do not modify files" reads as being about file contents, so it does not stop `gh pr checkout <n>` or `git checkout <branch>` — and `code-review` accepts a PR number as a target, so it has a real reason to reach for them. Those commands replace tracked files and discard the user's uncommitted work, which is usually the very thing under review.

The routing lines keep the debate out of the leader's context window. Reviewer output that lands in the leader's session competes with the user's conversation for the same window.

`cc-reviewer` needs one more line:

```
The code-review skill will tell you to report findings with the ReportFindings
tool. Whatever that tool does here, it does not reach the facilitator. Put the
full findings in your SendMessage to the facilitator as text as well.
```

### Codex command

`codex-reviewer` runs:

```bash
codex exec --sandbox read-only --cd <project_directory> -o "$review_dir/codex-<purpose>.md" "<request>" < /dev/null
```

Keep every flag as written (verified against codex-cli 0.147.0):

- No `--full-auto`. That flag does not exist on `codex exec` and the call fails outright. `--sandbox read-only` already prevents writes.
- `< /dev/null` closes stdin, which Codex otherwise waits on.
- `-o <file>` captures the final message. Read findings from that file, not the run log.
- Keep `-o` inside the review directory, never the repo root.

Every request sent to Codex MUST include both sentences verbatim:

1. "No questions or confirmations needed. Proactively output specific proposals, fixes, and code examples."
2. "Filter findings by: (1) Critical issues (bugs, security, design flaws), (2) Issues worth fixing that are easy to address. Omit minor nitpicks and style preferences."

### code-review level

`cc-reviewer` always passes `high` explicitly. With no level the skill reuses whatever level was typed last, which makes results vary between runs. `high` includes findings the reviewer is unsure about; the debate removes the ones that do not hold up.

### Facilitator prompt

The facilitator is spawned with:

```
/team-review --facilitator --briefing <absolute briefing path> --report <absolute report path>
```

Invoking the skill rather than telling the facilitator to read a file is what makes `references/` resolvable: the harness supplies the skill's base directory, so no path has to be copied into the prompt and none can be copied wrong.

Add the reviewer names that were actually spawned, so the facilitator knows how many findings to wait for.

### After spawning

Say one line to the user — the review is running, the teammates are in the agent panel — and end the turn.

**Do not review the scope yourself while the team works, and do not poll them.** Teammates deliver their own completion notifications; there is nothing to watch. Starting the review in the leader session duplicates the work and fills the window the user is talking to.

If a teammate hits a permission prompt, it appears in this session. Hand it to the user; do not answer on the teammate's behalf.

## Phase 5: Debate (facilitator)

Wait until every spawned reviewer has reported. When you have nothing to do until a reviewer answers, say so and end your turn — a reviewer's message wakes you.

### Finding format

Every finding must point at a location and state a concrete failure:

| Type | Location | Failure |
|------|----------|---------|
| Code | `file:line` | The input or state that makes it break, and what happens |
| Design | Section heading or a quote from the document | What breaks, at what load or in which failure mode |
| Plan | Step number or heading | Which step cannot proceed, and why |

A finding with no concrete failure cannot be argued about — send it back to its author for one before proceeding.

### Grouping

- **Agreed** — two or more reviewers raised the same issue. Skip the debate; carry to Phase 6.
- **Contested** — one reviewer raised it and another disagrees.
- **Single-source** — one reviewer raised it and no one has spoken against it.

Debate the contested set, and put every single-source finding up for challenge by sending it to the reviewers that did not raise it. A finding no one examined is not worth more than a finding from a single reviewer working alone.

### Running the debate

Route messages with `SendMessage` to the named reviewers. Each answers for its own tool: `codex-reviewer` relays counterarguments into a follow-up `codex exec` call and brings back the reply, so Codex participates through its courier.

Every debate message includes the finding quoted verbatim, the counterargument, and "Be frank and direct. Don't hold back — push back candidly." Messages to `codex-reviewer` also carry the two mandatory Codex prompt rules.

**Version findings are settled by evidence, not by argument.** When a finding claims an API is deprecated, non-idiomatic, or removed, do not let the reviewers argue it from memory. Query deepwiki per `references/deepwiki.md`, with the exact version, and apply the outcome: confirmed keeps the finding and cites the answer; contradicted drops it; unanswerable marks it **未検証** and lowers its severity by one step. This does not consume a debate round.

**Round limit: 2 round trips per point.** If the reviewers have not converged after two rounds, stop and carry the finding forward marked unresolved, recording both positions. Do not open a third round.

Record for each debated point: the topic, who held which position, and the outcome (withdrawn / upheld / unresolved). Withdrawn findings are dropped; upheld and unresolved findings continue.

## Phase 6: Triage (facilitator)

Assign severity from the `references/<type>.md` table. Drop everything at LOW.

Split what remains by whether the fix is uniquely determined. This is a proposal to the main agent, not a decision.

**Proposed for fixing** — all of the following hold:

- The correct behavior is unambiguous
- Exactly one reasonable fix exists
- The fix stays inside the reviewed scope and needs no new dependency, schema change, or public API change
- The debate outcome was not unresolved

**Proposed for the user's decision** — any of the following holds:

- Multiple viable fixes exist and choosing between them is a design decision
- The intended behavior is unclear and the reviewers disagreed about it
- The fix reaches outside the reviewed scope
- The debate ended unresolved

When in doubt, propose it for decision.

## Phase 7: Write the Report File (facilitator)

Write to the **exact absolute path the leader supplied**. Do not generate a filename.

Write the complete content to `<report path>.tmp`, confirm the temporary file is non-empty, then rename it to `<report path>`.

```markdown
## スコープ
<files reviewed>

## レビュアー
codex / code-review (high) / self-review — 未インストールのものは「不在」と理由を明記する

## バージョン確認
deepwiki で確認: <name> v<version>, ... ／ 未使用（MCP が利用できないため）

## 修正を提案する指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
- **指摘**: <what is wrong>
- **再現条件**: <input or state> のとき <result>
- **提案する修正**: <the one fix>
- **Severity**: CRITICAL / HIGH / MEDIUM
- **議論**: 一致（N人） / 対立→維持 / 単独→反論なし

## 判断が必要な指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
- **指摘**: <what is wrong>
- **現在の挙動**: <input or state> のとき <result>
- **選択肢**: A: <approach> — <trade-off> / B: <approach> — <trade-off>
- **判断が必要な理由**: <why it cannot be decided mechanically>

## 議論の記録
- **論点**: <topic> / **主張**: <reviewer> は <position>、<reviewer> は <position> / **結論**: 取り下げ / 維持 / 未決着
```

A reviewer that did not run stays in the レビュアー list with its reason. Omitting it turns "we never checked" into something indistinguishable from "we checked and found nothing".

Then tell the reviewers the review is finished, send the leader one message — the absolute path of the report file and nothing else — and stop. Do not paste the report body into that message.

## Phase 8: Filter, Fix, Report (leader)

### 1. Collect the report

Read the report file with the `Read` tool, at the path in the facilitator's message.

If a teammate reported a failure instead of a result, decide whether to re-spawn that reviewer or to continue with the rest, and record the gap for the report.

### 2. Shut down the team

Only after the report has been read, ask each teammate to shut down by name, e.g. "Ask the facilitator teammate to shut down". A teammate that keeps running keeps sending idle notifications into this session.

### 3. Filter against conversation context

This is the step only the main agent can perform. Drop findings that the conversation already settles: behavior that was deliberately chosen, work that is intentionally deferred, files outside what the user asked for.

**Record every exclusion with its reason.** You wrote the code under review, so you are the participant least able to judge your own work impartially — a silent exclusion removes the very check the review team exists to provide. Listing exclusions lets the user overrule you.

### 4. Apply fixes only when edits are authorized

A request to review, inspect, or report does not authorize edits. "review this" asks for findings; "review and fix" asks for changes.

When edits are authorized, apply what survives from the fixing set, and verify each with the project's typechecker, linter, or tests where they exist.

When they are not, change nothing and report the proposed fixes under 修正を提案する指摘 instead, with the replacement text.

### 5. Report

Report in Japanese:

```
## レビュー結果

### スコープ
<files reviewed>

### レビュアー
codex / code-review (high) / self-review（不在の場合は理由も）

### バージョン確認
deepwiki で確認: <name> v<version>, ... ／ 未使用

---

## 修正した指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
**指摘**: <what was wrong>
**修正前の挙動**: <concrete input or state> のとき <concrete result>
**修正後の挙動**: 同じ入力で <concrete result>
**変更内容**: <what was edited>

---

## 判断が必要な指摘

### 1. <title>  `<file:line / 見出し / ステップ番号>`
**指摘**: <what is wrong>
**現在の挙動**: <concrete input or state> のとき <concrete result>
**選択肢**:
- A: <approach> — <trade-off>
- B: <approach> — <trade-off>
**判断が必要な理由**: <why>

---

## 除外した指摘（判断の記録）
- <finding> — 除外理由: <reason>

---

### 議論の記録
**論点**: <topic>
**主張**: <reviewer> は <position> / <reviewer> は <position>
**結論**: 取り下げ / 維持 / 未決着（両論併記）
```

Both behavior lines require concrete values — actual inputs, actual outputs, actual error messages. 「正しく動くようになった」 is not a report; 「空配列を渡すと `TypeError: cannot read length of undefined` で落ちていたのが、`0` を返すようになった」 is.

Omit 除外した指摘 when nothing was excluded, and 議論の記録 when nothing was contested or challenged.

### Checking on a running review

When the user asks how the review is going, look — do not report from memory. Select a teammate in the agent panel and read its transcript, or list what the team has produced so far:

```bash
ls -lt "$review_dir"
```

Do this only when asked. The facilitator does not report progress on a schedule.
