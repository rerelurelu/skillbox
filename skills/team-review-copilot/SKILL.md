---
name: team-review-copilot
description: |
  Runs a review team inside GitHub Copilot CLI over one scope: two Codex CLI reviewers with different lenses and one Copilot subagent reviewer. The host session makes the reviewers argue their findings against each other, triages what survives, applies fixes when the user authorized edits, and reports what changed. Requires the codex CLI on PATH; on Claude Code use team-review instead.
  Triggers on: "review", "code review", "review this", "/team-review-copilot"
  Use when: reviewing code, implementation plans, or architectural designs from Copilot CLI.
version: "1.0.0"
user-invocable: true
allowed-tools: "shell"
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Team Review (Copilot CLI)

Three reviewers examine one scope independently and argue their findings against each other. The host session — the only participant that holds the conversation context — runs that argument, decides what to act on, and makes every edit.

## Roles

| Role | Where it runs | Responsibility | Writes |
|------|---------------|----------------|--------|
| **host** | the user's Copilot CLI session | Scope, briefing, dispatching reviewers, running the debate, triage, applying fixes, reporting | reviewed files |
| `codex-correctness` | subagent → `codex exec` | Bugs, boundary values, error paths, untrusted input | nothing |
| `codex-design` | subagent → `codex exec` | Design flaws, impact of the change, maintainability, version fit | nothing |
| `copilot-reviewer` | subagent | Reviews the scope directly against `references/` criteria | nothing |

Two reviewers run on Codex and one on Copilot's own model. That split is the point: a finding that only one model family can see is still found, and a finding both families reach independently is worth more than either alone.

Each `codex exec` call is a fresh process with an empty context, so two calls with different lenses are two independent reviewers, not one reviewer asked twice.

**No participant except the host modifies a reviewed file.**

## Preconditions

```bash
command -v codex
```

If `codex` is absent, say so and ask the user whether to continue with `copilot-reviewer` alone. A single-family review loses the cross-check this skill is built around, so it is the user's call, not a silent fallback.

The deepwiki MCP is optional. When it is configured, Phase 3 uses it; when it is not, Phase 3 records the skip.

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

The one exception is Phase 8 step 2, where the host applies fixes the user authorized.

Subagents never read this file. Their copy of this rule is the prompt in Phase 4; change both together.

Read modified, staged, and untracked files, review them, and leave them where they are. Do not move them to `/tmp` or any holding directory either.

Write everything this review produces to `$review_dir`. Do not build a clean tree — no phase needs one. If a branch change is genuinely needed, stop and ask for that exact operation.

Read pull requests with `gh pr view` and `gh pr diff`.

## Phase 1: Determine Scope

Use the scope the user gave. If none was given, default to everything uncommitted — **including untracked files**:

```bash
{ git diff HEAD --name-only; git ls-files --others --exclude-standard; } | sort -u
```

`git diff HEAD` alone omits untracked files, so a newly added file is silently excluded from its own review. If both commands produce no paths, report that the scope is empty and stop.

## Phase 2: Determine Review Type

Classify the scope:

- **Plan** — implementation plans, task lists, TODO documents
- **Design** — architecture docs, design decisions
- **Code** — source code files (default)

Read `references/<type>.md` (plan.md / design.md / code.md) for this type's criteria and severity table. Phases 4 and 6 both use it.

**Domain criteria.** Detect the domains the scope touches, from file paths and extensions:

- **fe** — `.tsx`/`.jsx`/`.vue`/`.svelte`, `components/`, `styles/`, `.css`/`.scss`
- **be** — `server/`, `api/`, `controllers/`, `models/`, `.sql`, ORM/migration files
- **infra** — `Dockerfile`, `docker-compose*`, `*.tf`, k8s manifests, `.github/workflows/`

Read `references/domains/<domain>.md` for each detected domain. These criteria are additive to the type criteria. Multiple domains may apply to one scope.

## Phase 3: Briefing

The reviewers have no conversation context. Give them enough to avoid wasted effort, and nothing that would tell them what to conclude.

**Include — facts:**

- What the change does, in a few sentences
- Scope boundaries: which paths are under review and which are not
- Anything deliberately unimplemented, stubbed, or left as a TODO, and why
- Review type and detected domains, with the criteria that apply
- Dependency and version summary
- Location of convention or decision docs (`docs/adr/`, `CONTRIBUTING.md`, `AGENTS.md`)

**Exclude — conclusions:**

- "This design decision is sound"
- "This approach was already agreed with the user"
- "This is the project's established pattern"

Brief them on constraints, not on verdicts. A reviewer told that something is settled stops examining it.

**Dependency versions** (Code and Design scopes). Summarize version info from manifests or lockfiles present in the repo (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `build.gradle.kts`, `pom.xml`, `gradle/libs.versions.toml`). This is what lets a reviewer judge whether an API is deprecated for the versions actually in use.

**Version fact-check with deepwiki** (Code and Design scopes, when the deepwiki MCP is available). Read `references/deepwiki.md` and follow it: identify the exact versions of the language, runtime, framework, and the libraries the changed files import; resolve each to its GitHub repo; ask what that **specific version** recommends and what it deprecated. Cap this at 5 targets. Add the answers to the briefing as quoted facts with their source.

Reviewers cannot report a problem in a version released after their training data, and they do not know that they cannot. This step is what covers that gap. Skip it when the MCP is unavailable, and record the skip for the Phase 7 report.

Write the briefing to `$review_dir/briefing-<UTC timestamp>.md`. Every reviewer reads it from that path — do not paste it into a prompt, where quotes, backticks, and `$` are mangled or executed on the way through the shell.

## Phase 4: Dispatch the Reviewers

Dispatch all three as subagents in one go so they run in parallel. `/fleet` dispatches them as background subagents; without it, delegate to three custom agents in the same turn.

Each subagent prompt carries the briefing path, the `references/` files that apply, its own lens, and these lines verbatim. A subagent never reads this SKILL.md, so a rule that stays here does not reach it.

```
Report findings only. Do not modify, create, or delete any file.
Do not change the checkout: no git stash, clean, reset, switch, checkout,
restore, and no gh pr checkout. Inspect a PR with gh pr view / gh pr diff.
Write your findings to <review_dir>/findings-<your name>.md and return a
summary plus that path.
```

The checkout line is the one that does the work. "Do not modify files" reads as being about file contents, so it does not stop `gh pr checkout <n>` or `git checkout <branch>`. Those commands replace tracked files and discard the user's uncommitted work, which is usually the very thing under review.

Findings go to a file because a subagent's context is discarded when it finishes. What is not written down cannot be quoted in Phase 5.

### Lenses

| Reviewer | Lens |
|----------|------|
| `codex-correctness` | Boundary values and error paths, concurrency, state and lifecycle, untrusted input reaching queries/shell/HTML/file paths |
| `codex-design` | Design flaws, impact of the change on callers, maintainability, deprecated or non-idiomatic APIs for the versions in the briefing |
| `copilot-reviewer` | The full `references/<type>.md` criteria, plus the domain criteria |

The lenses overlap on purpose at the edges. Two reviewers reaching the same finding from different directions is the signal Phase 5 relies on.

### Codex command

Both Codex reviewers run:

```bash
codex exec --sandbox read-only --cd <project_directory> -o "$review_dir/codex-<lens>.md" "<request>" < /dev/null
```

Keep every flag as written (verified against codex-cli 0.147.0):

- No `--full-auto`. That flag does not exist on `codex exec` and the call fails outright. `--sandbox read-only` already prevents writes.
- `< /dev/null` closes stdin, which Codex otherwise waits on.
- `-o <file>` captures the final message. Read findings from that file, not the run log.
- Keep `-o` inside the review directory, never the repo root.

Every request sent to Codex MUST include both sentences verbatim:

1. "No questions or confirmations needed. Proactively output specific proposals, fixes, and code examples."
2. "Filter findings by: (1) Critical issues (bugs, security, design flaws), (2) Issues worth fixing that are easy to address. Omit minor nitpicks and style preferences."

### Finding format

Every finding must point at a location and state a concrete failure:

| Type | Location | Failure |
|------|----------|---------|
| Code | `file:line` | The input or state that makes it break, and what happens |
| Design | Section heading or a quote from the document | What breaks, at what load or in which failure mode |
| Plan | Step number or heading | Which step cannot proceed, and why |

A finding with no concrete failure cannot be argued about in Phase 5 — dispatch its author again for one before proceeding.

## Phase 5: Debate

Group the findings:

- **Agreed** — two or more reviewers raised the same issue. Skip the debate; carry to Phase 6.
- **Contested** — one reviewer raised it and another disagrees.
- **Single-source** — one reviewer raised it and no one has spoken against it.

Debate the contested set, and put every single-source finding up for challenge with the reviewers that did not raise it. A finding no one examined is not worth more than a finding from a single reviewer working alone.

### How a round works here

Subagents do not survive their task and cannot message each other, so a round is a fresh dispatch, not a reply:

- **Codex reviewer** — a new `codex exec` call whose request contains the finding quoted verbatim, the counterargument, and the path of that reviewer's own earlier findings file.
- **Copilot reviewer** — a new subagent with the same three things in its prompt.

Every debate request ends with "Be frank and direct. Don't hold back — push back candidly." Codex requests also carry the two mandatory sentences above.

Batch the points for one reviewer into a single dispatch. One dispatch per finding spends a full process startup on each line.

**Version findings are settled by evidence, not by argument.** When a finding claims an API is deprecated, non-idiomatic, or removed, do not let the reviewers argue it from memory. Query deepwiki per `references/deepwiki.md`, with the exact version, and apply the outcome: confirmed keeps the finding and cites the answer; contradicted drops it; unanswerable marks it **未検証** and lowers its severity by one step. This does not consume a debate round.

**Round limit: 2 round trips per point.** If the reviewers have not converged after two rounds, stop and carry the finding forward marked unresolved, recording both positions. Do not open a third round.

Record for each debated point: the topic, who held which position, and the outcome (withdrawn / upheld / unresolved). Withdrawn findings are dropped; upheld and unresolved findings continue.

### Running the debate yourself

You are both the facilitator and the author of the code under review. That is the weak point of this arrangement, and it has one rule: **carry every finding into the debate as its author wrote it.** Do not soften a finding, merge two findings into a milder one, or drop one before it has been challenged. Dropping happens in Phase 6 by severity, or in Phase 8 with a recorded reason — never silently here.

## Phase 6: Triage

Assign severity from the `references/<type>.md` table. Drop everything at LOW.

Split what remains by whether the fix is uniquely determined.

**To fix** — all of the following hold:

- The correct behavior is unambiguous
- Exactly one reasonable fix exists
- The fix stays inside the reviewed scope and needs no new dependency, schema change, or public API change
- The debate outcome was not unresolved

**For the user's decision** — any of the following holds:

- Multiple viable fixes exist and choosing between them is a design decision
- The intended behavior is unclear and the reviewers disagreed about it
- The fix reaches outside the reviewed scope
- The debate ended unresolved

When in doubt, put it up for decision.

## Phase 7: Write the Report File

Write the surviving findings to `$review_dir/report-<UTC timestamp>.md`, so the review has a record that outlives this session:

```markdown
## スコープ
<files reviewed>

## レビュアー
codex-correctness / codex-design / copilot-reviewer — 走らなかったものは「不在」と理由を明記する

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

## Phase 8: Filter, Fix, Report

### 1. Filter against conversation context

Drop findings that the conversation already settles: behavior that was deliberately chosen, work that is intentionally deferred, files outside what the user asked for.

**Record every exclusion with its reason.** You wrote the code under review, so you are the participant least able to judge your own work impartially — a silent exclusion removes the very check this skill exists to provide. Listing exclusions lets the user overrule you.

### 2. Apply fixes only when edits are authorized

A request to review, inspect, or report does not authorize edits. "review this" asks for findings; "review and fix" asks for changes.

When edits are authorized, apply what survives from the fixing set, and verify each with the project's typechecker, linter, or tests where they exist.

When they are not, change nothing and report the proposed fixes under 修正を提案する指摘 instead, with the replacement text.

### 3. Report

Report in Japanese:

```
## レビュー結果

### スコープ
<files reviewed>

### レビュアー
codex-correctness / codex-design / copilot-reviewer（不在の場合は理由も）

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

Print the path of the report file at the end, so the full record can be reopened later.
