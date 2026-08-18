# skillbox

Personal Agent Skills for Claude Code, GitHub Copilot, and other AI coding agents.

## Overview

This repository contains a collection of [Agent Skills](https://agentskills.io/specification) that Relu (rerelurelu) uses across machines. Skills are installable via `gh skill` and auto-trigger based on context, or can be invoked explicitly as slash commands.

## Installation

Two ways in. They coexist: install whichever fits the agent you are using.

### Claude Code plugin

Installs every skill except `cross-review-copilot` (that one only runs inside GitHub Copilot CLI) in one step. Plugin skills are namespaced, so they are invoked as `/relubox:<skill>`.

```
/plugin marketplace add rerelurelu/skillbox
/plugin install relubox@skillbox
```

Update with `/plugin marketplace update skillbox`.

Note that Copilot CLI does not read `~/.claude/plugins/`, so a plugin install does not make these skills available there. Use `gh skill` below for Copilot.

### gh skill

Per-skill installs, and the only route for agents other than Claude Code. Install all skills at user scope for Claude Code:

```bash
gh skill install rerelurelu/skillbox deslop --agent claude-code --scope user
gh skill install rerelurelu/skillbox cross-review --agent claude-code --scope user
gh skill install rerelurelu/skillbox clean-code --agent claude-code --scope user
gh skill install rerelurelu/skillbox decomposition --agent claude-code --scope user
gh skill install rerelurelu/skillbox delegating-implementation --agent claude-code --scope user
gh skill install rerelurelu/skillbox dig --agent claude-code --scope user
gh skill install rerelurelu/skillbox fix-ci --agent claude-code --scope user
gh skill install rerelurelu/skillbox creating-skills --agent claude-code --scope user
gh skill install rerelurelu/skillbox memo --agent claude-code --scope user
gh skill install rerelurelu/skillbox recall --agent claude-code --scope user
gh skill install rerelurelu/skillbox retro --agent claude-code --scope user
gh skill install rerelurelu/skillbox delegating-via-herdr --agent claude-code --scope user
```

Replace `--agent claude-code` with `--agent github-copilot` (or any other supported agent) to install for that target instead.

`cross-review` needs Claude Code 2.1.206+ and the `codex` CLI. For GitHub Copilot CLI install the Copilot-hosted variant instead:

```bash
gh skill install rerelurelu/skillbox cross-review-copilot --agent github-copilot --scope user
```

## Skills

| Skill | Purpose |
|-------|---------|
| [deslop](skills/deslop/SKILL.md) | Removes AI-generated slop from uncommitted changes |
| [cross-review](skills/cross-review/SKILL.md) | The main agent, acting as Technical Review Lead, runs Codex CLI itself and argues its findings against a tool-restricted, resumable Claude reviewer subagent, applying YAGNI to both the reviewed code and the reviewers' own fix proposals before weighing survivors against the implementation plan, fixing, and reporting. Reviews uncommitted changes or a pull request by number (needs Claude Code 2.1.206+ and the `codex` CLI) |
| [cross-review-copilot](skills/cross-review-copilot/SKILL.md) | The same review for GitHub Copilot CLI: the host session, acting as Technical Review Lead, runs Codex CLI and argues its findings against a Copilot subagent reviewer (needs the `codex` CLI) |
| [clean-code](skills/clean-code/SKILL.md) | Post-implementation polish: simplify → deslop → dead-code/comment audit |
| [decomposition](skills/decomposition/SKILL.md) | Decomposes complex tasks into atomic, executable todos |
| [delegating-implementation](skills/delegating-implementation/SKILL.md) | Hands a reviewed implementation plan to a sonnet subagent, keeping the main agent's context free of the read/edit/test loop, then runs a plan-compliance check on the result |
| [dig](skills/dig/SKILL.md) | Deep exploratory interview to surface hidden assumptions and risks in plans |
| [fix-ci](skills/fix-ci/SKILL.md) | Automatically diagnoses and fixes CI failures in the current PR |
| [creating-skills](skills/creating-skills/SKILL.md) | Authors new Agent Skills following the agentskills.io specification |
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
gh skill install rerelurelu/skillbox cross-review --pin v1.6.0
```

## Local Development

Test a skill from a local checkout before publishing:

```bash
gh skill install /path/to/skillbox cross-review --from-local --agent claude-code --scope user
```

## Authoring New Skills

When authoring a new skill in this repo, the [`creating-skills`](skills/creating-skills/SKILL.md) skill auto-triggers on prompts like "create a skill" or "add a new skill" and walks through the full process. Repository-level conventions are documented in [`AGENTS.md`](AGENTS.md), and the full Anthropic authoring guide is mirrored at [`best-practices/create-skill.md`](best-practices/create-skill.md).

## License

GNU General Public License v3.0
