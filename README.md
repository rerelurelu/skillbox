# skillbox

Personal Agent Skills for Claude Code.

## Overview

This repository contains a collection of [Agent Skills](https://agentskills.io/specification) that Relu (rerelurelu) uses across machines. Skills are distributed as a Claude Code plugin and auto-trigger based on context, or can be invoked explicitly as slash commands.

## Installation

Installs every skill in one step. Plugin skills are namespaced, so they are invoked as `/relubox:<skill>`.

```
/plugin marketplace add rerelurelu/skillbox
/plugin install relubox@skillbox
```

The plugin has no `version` field, so every pushed commit is an update. Pull it with `/plugin marketplace update skillbox`, or turn on auto-update for this marketplace under **Marketplaces** in `/plugin`.

## Skills

| Skill | Purpose |
|-------|---------|
| [qstack](skills/qstack/SKILL.md) | `/qstack` only. Takes a new feature or a feature change from alignment to report without stopping: alignment → design (arena when large or contested) → implementation by Codex in a Herdr pane → comment review → verification → adversarial review by three models → fix rounds → squashed commits and report. Needs the Herdr app, `codex`, and `agy` |
| [arena](skills/arena/SKILL.md) | Three agents (Opus 5.5, GPT-6.2 Astra, Gemini 4 Neon) solve the same design or code task in separate worktrees; a Gemini judge and the parent score them against a rubric, pick a base, and graft the best parts. Called by `qstack`, or `/arena` |
| [interrogate](skills/interrogate/SKILL.md) | Adversarial review by three agents that keeps only findings proven by a run; the parent reruns every finding and records dropped ones per agent. Applies nothing. Called by `qstack`, or `/interrogate` |
| [no-comments](skills/no-comments/SKILL.md) | Runs the `comment-reviewer` subagent over a diff and lists comments to delete and code to reshape so the comment becomes unnecessary. Called by `qstack`, or `/no-comments` |
| [herdr-panes](skills/herdr-panes/SKILL.md) | How to run Codex and Antigravity in Herdr panes: layout, startup prompts, resetting a conversation, sending, waiting, reading results, cleanup. Read by `qstack`, `arena`, and `interrogate` |
| [no-overbuild](skills/no-overbuild/SKILL.md) | Seventeen checkable over-engineering criteria plus what never counts. The implementer follows them while writing; design and arena rubrics use them |
| [self-check](skills/self-check/SKILL.md) | The author's own pass before review: requirements vs. diff, unintended changes, leftover TODO/debug code, then lint/typecheck/test. No subagents — it answers "did I finish my job", not "is this code correct" |
| [deslop-comments](skills/deslop-comments/SKILL.md) | Removes AI-generated slop from Japanese code comments only (comment text and whitespace, nothing else) |
| [lean-review](skills/lean-review/SKILL.md) | Memorable adapter that runs the `ponytail-review` skill for a simplicity/YAGNI/over-engineering review of finished code, with no simplicity criteria of its own (requires `ponytail-review` to be installed separately) |
| [final-cleanup](skills/final-cleanup/SKILL.md) | Final polish after implementation, review, and lean-review are done: dead-code removal → comment/implementation consistency → `deslop-comments` → project verification (lint/typecheck/test) |
| [writing-style-jp](skills/writing-style-jp/SKILL.md) | Rules for Japanese technical prose that a reader outside the field can follow: concrete replacements for abstract wording, a list of words to avoid, extra rules for design docs and ADRs, and a pre-send checklist |

## Authoring New Skills

When authoring a new skill in this repo, follow the conventions documented in [`AGENTS.md`](AGENTS.md); the full Anthropic authoring guide is mirrored at [`best-practices/create-skill.md`](best-practices/create-skill.md).

## License

GNU General Public License v3.0
