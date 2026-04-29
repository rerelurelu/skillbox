---
name: creating-skills
description: "Authors new Agent Skills following the agentskills.io specification, covering SKILL.md frontmatter requirements, naming conventions, progressive disclosure patterns, and validation. Use when the user asks to create, author, write, add, design, or scaffold a new skill, or to convert an existing slash command into a skill."
user-invocable: true
license: "GPL-3.0"
allowed-tools: "Read Write Edit Bash Grep Glob"
---

# Creating Agent Skills

Author new Agent Skills following the [agentskills.io](https://agentskills.io/specification) specification.

## Quick Reference

**Directory structure**:

```
skills/<skill-name>/
├── SKILL.md              # Required entry point
└── *.md                  # Optional reference files (one level deep only)
```

**Required frontmatter**:

```yaml
---
name: <gerund-form-name>          # lowercase, hyphens, max 64 chars
description: "<third-person>..."  # what + when, max 1024 chars, with trigger keywords
---
```

**Recommended frontmatter**:

```yaml
license: "GPL-3.0"
user-invocable: true              # also expose as slash command
allowed-tools: "Read Edit Bash"   # space-delimited STRING, not array
```

## Process

### Step 1: Read the full guide

Read [AUTHORING.md](AUTHORING.md) (bundled, sourced from Anthropic's official skill authoring docs). It covers progressive disclosure, anti-patterns, evaluation, and examples in depth.

### Step 2: Choose a name

Use **gerund form** (verb + -ing) for discoverability and consistency:

- Good: `processing-pdfs`, `analyzing-spreadsheets`, `creating-skills`
- Avoid: vague names (`helper`, `utils`), reserved words (`anthropic`, `claude`)

### Step 3: Write a discovery-friendly description

The description is what the agent uses to decide whether to load the skill. Be specific and include trigger keywords.

**Bad**: `description: "Helps with code"`

**Good**: `description: "Removes AI-generated slop (unnecessary comments, defensive checks, style inconsistencies) from uncommitted changes. Use after AI-assisted edits, before committing, or when the user asks to deslop or clean up generated noise."`

Always write in **third person**. The description is injected into the system prompt; first/second person causes discovery problems.

### Step 4: Author the body

- Keep SKILL.md body under 500 lines. Split longer content into sibling files.
- Match degrees of freedom to task fragility (specific scripts for fragile ops, high-level guidance for flexible ones).
- Reference files must be one level deep from SKILL.md (avoid A → B → C chains).

### Step 5: Validate

```bash
gh skill publish --dry-run
```

Must report zero errors. Common errors:

- `allowed-tools must be a string` — convert YAML array to space-delimited string
- `recommended field missing: license` — add `license: "GPL-3.0"`
- name/description validation — check 64/1024 char limits and allowed character sets

### Step 6: Update repo metadata

- Add the skill to README.md's skill table
- Add the skill to the install instructions section

### Step 7: (Optional) Publish

```bash
gh skill publish --tag vX.Y.Z
```

This creates a GitHub release with provenance metadata, enabling pinned installs and update tracking.

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| `allowed-tools` as YAML list | `gh skill publish --dry-run` errors | Convert to space-delimited string |
| First-person description | Skill doesn't auto-trigger reliably | Rewrite in third person |
| Description lacks triggers | Skill never auto-loads | Add "Use when..." with concrete keywords |
| SKILL.md over 500 lines | Slow loading, context bloat | Split into reference files |
| Nested references (one file links to another that links to another) | Agent reads incompletely (head -100) | Flatten so all refs are one level from SKILL.md |
| Time-sensitive info | Becomes wrong over time | Move to "old patterns" section or remove |
| Windows-style paths (`scripts\helper.py`) | Breaks on Unix | Use forward slashes always |

## Anti-patterns

- Adding "voodoo constants" without justification
- Punting errors to the agent rather than handling them in scripts
- Offering many alternative approaches when one default suffices
- Mixing terminology (`field` / `box` / `element` for the same concept)

See [AUTHORING.md](AUTHORING.md) §Anti-patterns for the full list.

## Reference

- [agentskills.io specification](https://agentskills.io/specification)
- [AUTHORING.md](AUTHORING.md) — full Anthropic authoring guide (bundled)
- Repository conventions: `../../AGENTS.md`
