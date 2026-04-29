---
name: clean-code
description: "Polishes code quality after implementation by running simplify and deslop, then auditing for dead code and stale comments. Use after completing a feature, before committing, or when the user asks to clean up uncommitted changes."
user-invocable: true
license: "GPL-3.0"
---

# Clean Code: Code Quality Polish

Run quality polishing steps in sequence after implementation is complete, before committing.

**Target scope**: files with uncommitted changes in the working tree (`git status` — modified, staged, and untracked). If `$ARGUMENTS` is specified, use that instead. If there are no uncommitted changes and no `$ARGUMENTS`, report that and stop.

## Steps

### Step 1: Simplify

Invoke the `simplify` skill via the Skill tool.
- Target: the target scope defined above.

### Step 2: Deslop

After Step 1 completes, invoke `deslop:deslop` via the Skill tool.
- Target: the target scope (including any edits made by Simplify, which will still be uncommitted).

### Step 3: Dead code and comment accuracy

After Step 2 completes, audit the same target scope. Do not skip even if Simplify and Deslop reported no changes.

Run dead-code removal first, then comment review — reviewing comments attached to about-to-be-deleted code is wasted effort.

**Dead code**

- Find and remove unused imports, unused exports, private helpers never referenced, unreachable branches, and code left behind after refactors.
- If something appears unused but must stay (e.g. public API, framework entry points, intentional fallbacks), leave it and note that in the completion report instead of deleting it.

**Stale or misleading comments**

- In touched files (after dead-code removal), read comments (block, line, JSDoc/TSDoc) against the actual code: behavior, parameters, return values, invariants, and edge cases.
- Update comments that are outdated after refactors, or remove them if they add no value.
- Remove comments that contradict the implementation or describe code paths that no longer exist.

Use project-appropriate checks (e.g. linters, typechecker, `grep` / symbol references) where they exist; otherwise verify by reading call sites and the diff.

## Completion Report

After all steps complete, report to the user in the following format:

```
仕上げ処理完了
Simplify: <change summary or 変更なし>
Deslop: <change summary in 1-3 sentences>
デッドコード: <removals or 検出なし>
コメント整合性: <fixes/removals or 問題なし>
```
