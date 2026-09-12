# skillbox

Personal Agent Skills for Claude Code, GitHub Copilot, and other AI coding agents.

## Overview

This repository contains a collection of [Agent Skills](https://agentskills.io/specification) that Relu (rerelurelu) uses across machines. Skills are installable via `gh skill` and auto-trigger based on context, or can be invoked explicitly as slash commands.

## Installation

Two ways in. They coexist: install whichever fits the agent you are using.

### Claude Code plugin

Installs every skill in one step. Plugin skills are namespaced, so they are invoked as `/relubox:<skill>`.

```
/plugin marketplace add rerelurelu/skillbox
/plugin install relubox@skillbox
```

Update with `/plugin marketplace update skillbox`.

Note that Copilot CLI does not read `~/.claude/plugins/`, so a plugin install does not make these skills available there. Use `gh skill` below for Copilot.

### gh skill

Per-skill installs, and the only route for agents other than Claude Code. Install all skills at user scope for Claude Code:

```bash
gh skill install rerelurelu/skillbox self-check --agent claude-code --scope user
gh skill install rerelurelu/skillbox codex-review --agent claude-code --scope user
gh skill install rerelurelu/skillbox lean-review --agent claude-code --scope user
gh skill install rerelurelu/skillbox final-cleanup --agent claude-code --scope user
gh skill install rerelurelu/skillbox deslop-comments --agent claude-code --scope user
gh skill install rerelurelu/skillbox memo --agent claude-code --scope user
gh skill install rerelurelu/skillbox recall --agent claude-code --scope user
gh skill install rerelurelu/skillbox retro --agent claude-code --scope user
gh skill install rerelurelu/skillbox delegating-via-herdr --agent claude-code --scope user
```

Replace `--agent claude-code` with `--agent github-copilot` (or any other supported agent) to install for that target instead.

`codex-review` needs the `codex` CLI.

## Skills

| Skill | Purpose |
|-------|---------|
| [self-check](skills/self-check/SKILL.md) | The author's own pass before review: requirements vs. diff, unintended changes, leftover TODO/debug code, then lint/typecheck/test. No subagents — it answers "did I finish my job", not "is this code correct" |
| [codex-review](skills/codex-review/SKILL.md) | Runs `codex review` for an independent read-only review — its own defect criteria plus one added aspect, conformance to the project's architecture rules — then the main agent checks each finding itself and decides accept / reject / defer. Fixes the accepted findings whose fix is uniquely determined, and reports the ones that need a decision with the options laid out (needs the `codex` CLI) |
| [deslop-comments](skills/deslop-comments/SKILL.md) | Removes AI-generated slop from Japanese code comments only (comment text and whitespace, nothing else) |
| [lean-review](skills/lean-review/SKILL.md) | Memorable adapter that runs the `ponytail-review` skill for a simplicity/YAGNI/over-engineering review of finished code, with no simplicity criteria of its own (requires `ponytail-review` to be installed separately) |
| [final-cleanup](skills/final-cleanup/SKILL.md) | Final polish after implementation, review, and lean-review are done: dead-code removal → comment/implementation consistency → `deslop-comments` → project verification (lint/typecheck/test) |
| [memo](skills/memo/SKILL.md) | Records tech knowledge, design decisions, domain knowledge, and coding tendencies to a personal knowledge base (`~/dev/knowledge`, Obsidian vault) |
| [recall](skills/recall/SKILL.md) | Searches the knowledge base and surfaces past knowledge relevant to the current work |
| [retro](skills/retro/SKILL.md) | Generates a retrospective report (strengths, tendencies, weaknesses) from the knowledge base |
| [delegating-via-herdr](skills/delegating-via-herdr/SKILL.md) | Delegates a task to another coding agent in a visible herdr pane, waiting for completion in the background |

## Updating

Update all installed skills to the latest version:

```bash
gh skill update --all
```

Pin to a specific version when installing:

```bash
gh skill install rerelurelu/skillbox codex-review --pin v3.0.0
```

## Local Development

Test a skill from a local checkout before publishing:

```bash
gh skill install /path/to/skillbox codex-review --from-local --agent claude-code --scope user
```

## Authoring New Skills

When authoring a new skill in this repo, follow the conventions documented in [`AGENTS.md`](AGENTS.md); the full Anthropic authoring guide is mirrored at [`best-practices/create-skill.md`](best-practices/create-skill.md).

## License

GNU General Public License v3.0
