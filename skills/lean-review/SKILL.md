---
name: lean-review
description: |
  Reviews finished code for unnecessary implementation, over-abstraction, and YAGNI violations by delegating to the ponytail-review skill. Reports simplification candidates without editing code.
  Triggers on: "lean review", "simplify review", "over-engineering review", "不要コードを確認", "過剰実装", "YAGNI", "/lean-review".
  Use when: the user explicitly asks for a lean/simplicity review of code that implementation and cross-review are already done on.
user-invocable: true
argument-hint: "[scope]"
license: "GPL-3.0"
---

# Lean Review

Memorable adapter for the `ponytail-review` skill. Use once implementation and the usual correctness/security review (`cross-review`) are done and the code is expected to be final.

This skill has no simplicity criteria of its own — it does not judge YAGNI, dead code, over-abstraction, dependency necessity, or stdlib/native replacements. `ponytail-review` owns all of that, so its rules stay in sync automatically as that skill is updated.

## Steps

1. Invoke the `ponytail-review` skill.
   - `$ARGUMENTS` present: pass it through as the scope, unmodified.
   - `$ARGUMENTS` absent: invoke with no scope argument and let `ponytail-review` apply its own default.
2. Return `ponytail-review`'s findings to the user as-is.

Don't collect scope yourself (`git diff`, `git status`, `git ls-files`, etc.) — passing `$ARGUMENTS` straight through avoids a second, divergent scope implementation.

## Rules

- Don't assign or convert severity, and don't map findings onto categories from other review skills (e.g. cross-review's CRITICAL/HIGH/MEDIUM/LOW or "must fix / consider").
- Don't reformat, summarize, or re-word `ponytail-review`'s output.
- Don't edit or write code. Reporting the findings is the end of this skill; applying any of them happens in a later turn if the user asks.
- No findings is a normal, successful result — report it as such, not as a failure.
- If `ponytail-review` is not installed, say so and stop: "lean-review requires the ponytail-review skill, but it is not available." Don't perform the review yourself as a fallback.
- Don't check whether `cross-review` has already run or otherwise gate on prior review state — run whenever the user explicitly invokes this skill.
- Don't invoke or depend on `cross-review` in either direction; the two skills stay independent.
- Scope is code only. Don't extend this skill to implementation plans, architecture/design docs, or whole-repository audits.
