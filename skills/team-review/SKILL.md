---
name: team-review
description: |
  Runs a review team over the same scope: Codex CLI, the built-in code-review skill, and self-review when installed. The reviewers argue their findings against each other in a facilitated debate, and the main agent then filters the surviving findings against the conversation context, applies fixes when the user authorized edits, and reports what changed.
  Triggers on: "review", "code review", "review this", "/team-review"
  Use when: reviewing code, implementation plans, or architectural designs.
version: "2.0.0"
user-invocable: true
argument-hint: "[scope] | --coordinator --briefing <path> --report <path>"
license: "GPL-3.0"
---

# Team Review

Three reviewers examine one scope independently and debate each other's findings. A coordinator facilitates the debate but never touches the reviewed files. The main agent — the only participant that holds the conversation context — decides what to act on and makes every edit.

## Roles

| Role | Where it runs | Responsibility | Writes |
|------|---------------|----------------|--------|
| **main agent** | the user's session | Briefing, launching the coordinator, receiving the report, filtering against conversation context, applying fixes, reporting | reviewed files |
| **coordinator** | a herdr pane, or a fresh subagent when herdr is unavailable | Assembles the team, facilitates the debate, triages, writes the report | **review directory only** |
| `codex-reviewer` | subagent under the coordinator | Runs Codex CLI and carries debate messages to and from it | nothing |
| `cc-reviewer` | subagent under the coordinator | Runs the built-in `code-review` skill at level `high` | nothing |
| `self-reviewer` | subagent under the coordinator | Runs the `self-review` skill; absent when that skill is not installed | nothing |

The coordinator proposes; the main agent decides. **No participant except the main agent modifies a reviewed file.** The coordinator writes only inside the review directory (below), which is outside the working tree.

## The review directory

Everything this skill produces goes in one directory, resolved like this:

```bash
review_dir="$(git rev-parse --path-format=absolute --git-path team-review)"
mkdir -p "$review_dir"
```

Do not build the path as `$(git rev-parse --show-toplevel)/.git/team-review`. In a linked worktree (`git worktree add`) or a submodule, `<toplevel>/.git` is a **file** containing `gitdir: …`, not a directory, and `mkdir -p` fails with `Not a directory`. `--git-path` resolves the real per-worktree git directory.

Because it lives under the git directory, nothing here is ever committed and no ignore rule is needed.

## Invocation modes

This skill runs as two different participants, told apart by the arguments.

**Main agent mode** (no `--coordinator`): execute Phase 0 onward. This is the normal entry point — `/team-review`, or any request to review something.

**Coordinator mode** (`--coordinator --briefing <path> --report <path>`): **skip Phases 0 and 0.5** and start at Phase 1. Read the briefing from the given path and write the report to the given path.

Without this flag a coordinator launched by Phase 0.5 would run Phase 0.5 itself, split another pane below its own, launch another coordinator, and recurse until the tab is unusable.

Coordinator mode also fixes where `references/` lives. When the skill is invoked through the Skill tool, the harness states its base directory (`Base directory for this skill: …`); resolve every `references/…` path against that directory. Do not resolve them against the current working directory — a coordinator's cwd is the repository under review, so `references/code.md` would resolve to `<repo root>/references/code.md` and fail, leaving it with no severity table and no domain criteria.

## Phase 0: Briefing (main agent)

The reviewers have no conversation context. Give them enough to avoid wasted effort, and nothing that would tell them what to conclude.

**Include — facts:**

- What the change does, in a few sentences
- Scope boundaries: which paths are under review and which are not
- Anything deliberately unimplemented, stubbed, or left as a TODO, and why. Without this, every reviewer independently reports the same missing error handling.
- Dependency and version summary (see Phase 3)
- Location of convention or decision docs (`docs/adr/`, `CONTRIBUTING.md`, `CLAUDE.md`)

**Exclude — conclusions:**

- "This design decision is sound"
- "This approach was already agreed with the user"
- "This is the project's established pattern"

A reviewer told that something is settled stops examining it, and settled things are where bugs hide. Reviewers are useful here precisely because they cannot be talked into the intended design. Brief them on constraints, not on verdicts.

Write the briefing to `$review_dir/briefing-<UTC timestamp>.md`. Timestamp it: two reviews started in the same repo would otherwise overwrite each other's briefing, and the second coordinator would review the first one's scope.

## Phase 0.5: Launch the Coordinator (main agent)

The team takes minutes to respond. Never run Phases 1-6 inline.

**Decide the report path here, not in Phase 6.** The main agent waits on this file, so the coordinator cannot be the one to invent its name.

```bash
report_path="$review_dir/report-$(date -u +%Y%m%dT%H%M%SZ)-$$.md"
```

### Under herdr (`test "${HERDR_ENV:-}" = 1`)

```bash
herdr pane split --pane "$HERDR_PANE_ID" --direction down --no-focus --cwd <repo root>
```

**Always split `down`.** The coordinator pane belongs directly below the main agent's pane so the user always knows where to look. Do not vary the direction by pane shape. Always pass `--no-focus`. Read `result.pane.pane_id` from the JSON response; never construct the ID yourself.

```bash
herdr pane rename <pane_id> "team-review"
for i in 1 2 3 4 5; do
  herdr agent start team-review --kind claude --pane <pane_id> && break
  sleep 2
done
herdr agent wait <pane_id> --until idle --timeout 60000
```

**Retry `agent start`.** Immediately after `pane split` the pane's shell has not reached its prompt yet and `agent start` fails with `agent_not_found`. It succeeds on the second attempt.

Then submit the instruction:

```bash
herdr agent prompt <pane_id> '<instruction>' --wait --until working --timeout 10000
```

The instruction invokes this same skill in coordinator mode:

```
/team-review --coordinator --briefing <absolute briefing path> --report <absolute report path>
```

Invoking the skill rather than telling the coordinator to read a file is what makes `references/` resolvable: the harness supplies the skill's base directory, so no path has to be copied into the prompt and none can be copied wrong.

**Fallback when the skill is not installed in the coordinator's environment** (a different machine, or a scope that does not carry it): fall back to prose, and then the paths must be spelled out — the absolute path of this SKILL.md, the statement that `references/` sits beside it, the briefing path, and the report path.

Either way, append: "Do not end your turn until that report file exists."

Keep the instruction short. The briefing goes in a file, never in this argument: it travels through a shell, and quotes, backticks, or `$` in it are mangled or executed on the way.

**If `agent prompt --wait --until working` times out, do not blindly resend.** The timeout also fires when the transition simply was not observed in time, and a resend then launches a second review team over the same scope. Read the pane first:

```bash
herdr pane read <pane_id> --source visible --lines 30
```

Resend only if the instruction text is absent from the pane.

### Without herdr

Launch the coordinator as a background subagent — a **fresh** one (`general-purpose`), not `subagent_type: "fork"`. A fork inherits this conversation's full transcript, which hands the coordinator exactly what Phase 0 exists to withhold: it would read the main agent's earlier "we already decided this" statements and triage accordingly, and Phase 7's impartiality safeguard would be bypassed. Give it the same coordinator-mode arguments (briefing path and report path). Everything from Phase 1 onward is identical; only Phase 7's pane cleanup is skipped.

### Waiting

Wait in the background (Bash `run_in_background`) and return control to the user with one line: the review is running in the pane below, and the conversation stays usable.

**Wait on the report file, and pace the loop.** Two traps compound here: `agent_status` reaches `done` transiently while the coordinator is between subagents, and `herdr agent wait` returns *immediately* (measured at 0.006s) when the agent is already in a matching state. Without a sleep on the non-matching path, all iterations burn in under a second and the loop falls through while the review is still running.

```bash
deadline=$((SECONDS + 2700))
while (( SECONDS < deadline )); do
  herdr agent wait <pane_id> --until idle --until done --until blocked --timeout 60000 >/dev/null 2>&1
  [ -s "$report_path" ] && { echo "done"; exit 0; }
  [ "$(herdr agent get <pane_id> | ...agent_status...)" = blocked ] && { echo "blocked"; exit 2; }
  sleep 5
done
echo "timed out waiting for report: $report_path" >&2
exit 1
```

Test with `-s`, not `-f`: a zero-byte file is not a finished report. Exit non-zero on timeout so the main agent can tell a stall from a success.

**If you were invoked with `--coordinator`**: skip this phase and execute Phases 1-6.

## Phase 1: Determine Scope

Use the scope from the briefing. If none was given, default to everything uncommitted — **including untracked files**:

```bash
{ git diff HEAD --name-only; git ls-files --others --exclude-standard; } | sort -u
```

`git diff HEAD` alone omits untracked files, so a newly added file is silently excluded from its own review. If both commands produce no paths, report that the scope is empty and stop.

## Phase 2: Determine Review Type

Classify the scope:

- **Plan** — implementation plans, task lists, TODO documents
- **Design** — architecture docs, design decisions
- **Code** — source code files (default)

Read `references/<type>.md` (plan.md / design.md / code.md) for this type's criteria and severity table. Phases 3 and 5 both use it. Resolve it against the skill base directory (see Invocation modes), not your cwd.

## Phase 3: Assemble the Team

Complete the briefing with what only the repository can supply.

**1. Dependency versions** (Code and Design scopes). Summarize version info from manifests or lockfiles present in the repo (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `build.gradle.kts`, `pom.xml`, `gradle/libs.versions.toml`). This is what lets a reviewer judge whether an API is deprecated for the versions actually in use.

**2. Version fact-check with deepwiki** (Code and Design scopes, when the deepwiki MCP is available). Read `references/deepwiki.md` and follow it: identify the exact versions of the language, runtime, framework, and the libraries the changed files import; resolve each to its GitHub repo; ask what that **specific version** recommends and what it deprecated. Cap this step at 5 targets. Add the answers to the briefing as quoted facts with their source.

Reviewers cannot report a problem in a version released after their training data, and they do not know that they cannot. This step is what covers that gap. Skip it when the MCP is unavailable, and record the skip for the Phase 6 report.

**3. Domain criteria.** Detect the domains the scope touches, from file paths and extensions:

- **fe** — `.tsx`/`.jsx`/`.vue`/`.svelte`, `components/`, `styles/`, `.css`/`.scss`
- **be** — `server/`, `api/`, `controllers/`, `models/`, `.sql`, ORM/migration files
- **infra** — `Dockerfile`, `docker-compose*`, `*.tf`, k8s manifests, `.github/workflows/`

Read `references/domains/<domain>.md` for each detected domain. These criteria are additive to the type criteria from Phase 2. Multiple domains may apply to one scope.

**4. Check for `self-review`** in both scopes, and record which check was used:

```bash
test -f .claude/skills/self-review/SKILL.md || test -f ~/.claude/skills/self-review/SKILL.md
```

Checking only the user scope reports "not installed" for a project-scoped or plugin-provided skill, and the Phase 6 report then claims a reviewer was unavailable when it was not.

**5. Launch the reviewers in parallel** with the `Agent` tool, each with a `name` so it can be reached during the debate:

- `name: "codex-reviewer"` — runs Codex with the briefing, returns findings.
- `name: "cc-reviewer"` — invokes the `code-review` skill via the Skill tool at level `high`, returns findings.
- `name: "self-reviewer"` — invokes the `self-review` skill, returns findings. **Skip entirely when it is not installed.** Two reviewers is a valid team; do not substitute anything in its place.

Tell every reviewer: report findings only, modify no files, stay available for follow-up.

**Do not end your turn until the report file exists.** Launching the reviewers and then finishing the turn leaves the pane `idle` with nothing to resume it; the review stalls silently and the main agent waits for a report that will never be written. Wait on the reviewers' completion signals — do not insert fixed-length `sleep` calls, which add dead time without adding information.

### Codex command

```bash
codex exec --sandbox read-only --cd <project_directory> -o "$review_dir/codex-<purpose>.md" "<request>" < /dev/null
```

Verified against codex-cli 0.147.0. Four details matter:

- **There is no `--full-auto` flag on `codex exec`.** Passing it fails immediately with `tip: to pass '--full-auto' as a value, use '-- --full-auto'` and the reviewer returns nothing. `--sandbox read-only` alone already prevents writes.
- `< /dev/null` closes stdin. Without it Codex waits for instructions on an open stdin.
- `-o <file>` writes only the agent's final message to that file. Read the findings from there instead of parsing the run log, which also carries token counts and hook output.
- Point `-o` inside the review directory. Written to the repo root it becomes an untracked file inside the tree under review.

Every request sent to Codex MUST include both sentences verbatim:

1. "No questions or confirmations needed. Proactively output specific proposals, fixes, and code examples."
2. "Filter findings by: (1) Critical issues (bugs, security, design flaws), (2) Issues worth fixing that are easy to address. Omit minor nitpicks and style preferences."

### code-review level

Always pass `high` explicitly. With no level the skill reuses whatever level was typed last, which makes results vary between runs. `high` includes findings the reviewer is unsure about; Phase 4 removes the ones that do not hold up.

### Finding format

Every finding must point at a location and state a concrete failure:

| Type | Location | Failure |
|------|----------|---------|
| Code | `file:line` | The input or state that makes it break, and what happens |
| Design | Section heading or a quote from the document | What breaks, at what load or in which failure mode |
| Plan | Step number or heading | Which step cannot proceed, and why |

A finding with no concrete failure cannot be argued about in Phase 4 — send it back to its author for one before proceeding.

## Phase 4: Debate

Group the findings:

- **Agreed** — two or more reviewers raised the same issue. Skip the debate; carry to Phase 5.
- **Contested** — one reviewer raised it and another disagrees.
- **Single-source** — one reviewer raised it and no one has spoken against it.

Debate the contested set, and put every single-source finding up for challenge by sending it to the reviewers that did not raise it. A finding no one examined is not worth more than a finding from a single reviewer working alone.

Route messages with `SendMessage` to the named reviewers. Each answers for its own tool: `codex-reviewer` relays counterarguments into a follow-up `codex exec` call and brings back the reply, so Codex participates through its courier.

Every debate message includes the finding quoted verbatim, the counterargument, and "Be frank and direct. Don't hold back — push back candidly." Messages to `codex-reviewer` also carry the two mandatory prompt rules.

**Version findings are settled by evidence, not by argument.** When a finding claims an API is deprecated, non-idiomatic, or removed, do not let the reviewers argue it from memory. Query deepwiki per `references/deepwiki.md`, with the exact version, and apply the outcome: confirmed keeps the finding and cites the answer; contradicted drops it; unanswerable marks it **未検証** and lowers its severity by one step. This does not consume a debate round.

**Round limit: 2 round trips per point.** If the reviewers have not converged after two rounds, stop and carry the finding forward marked unresolved, recording both positions. Do not open a third round.

Record for each debated point: the topic, who held which position, and the outcome (withdrawn / upheld / unresolved). Withdrawn findings are dropped; upheld and unresolved findings continue.

## Phase 5: Triage

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

## Phase 6: Write the Report File

Write to the **exact absolute path the main agent supplied**. Do not generate a filename — the main agent is already waiting on the one it chose.

Write the complete content to `<report path>.tmp`, confirm the temporary file is non-empty, then rename it to `<report path>`. A reader polling for the final name then never sees a half-written file.

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

Print only the absolute path of the report file, then stop. Do not print the report body.

## Phase 7: Filter, Fix, Report (main agent)

Everything from here runs in the main session.

### 1. Collect the report

Read the report file with the `Read` tool. Do not reconstruct it from pane output: Claude Code collapses subagent output in the pane, so the findings are not recoverable from the terminal.

Under herdr, confirm the pane's final state first with `herdr agent get <pane_id>`:

- **`blocked`** — the coordinator is waiting on an approval prompt. Read it with `herdr pane read <pane_id> --source visible --lines 40`, **do not answer on its behalf**, and ask the user. Do not close the pane.
- **`idle` / `done`** — proceed.

### 2. Close the pane

Close only after the report file exists and has been read.

```bash
herdr pane close <pane_id>
```

Never close a pane this skill did not open. Never run `herdr server stop`.

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

When the user asks how the review is going, look — do not report from memory:

```bash
herdr agent get <pane_id>                              # 状態
herdr pane read <pane_id> --source visible --lines 20  # 今やっていること
ls -lt "$review_dir"                                    # 生成物
```

Do this only when asked. The coordinator does not report progress on a schedule.
