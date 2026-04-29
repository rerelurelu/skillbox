# skillbox — Agent Conventions

This repository is a personal collection of [Agent Skills](https://agentskills.io/specification) installable via `gh skill`.

## Repository Layout

```
skillbox/
├── AGENTS.md                       # This file (repo conventions for agents)
├── README.md                       # Human-facing overview
├── best-practices/create-skill.md  # Anthropic's authoring guide (reference)
└── skills/
    └── <skill-name>/
        ├── SKILL.md                # Required entry point
        └── *.md                    # Optional reference files (one level deep)
```

## Skill Authoring Rules

When creating or editing a skill in this repo, follow these rules. For deeper guidance, invoke the `creating-skills` skill or read `best-practices/create-skill.md`.

### Required frontmatter

- `name` — lowercase letters/numbers/hyphens only, max 64 chars, gerund form preferred (e.g. `creating-skills`, `managing-databases`)
- `description` — **third person**, includes both what the skill does and when to use it. Max 1024 chars. Include trigger keywords for discovery.

### Recommended frontmatter

- `license: "GPL-3.0"` — match the repo license
- `user-invocable: true` — exposes the skill as a slash command in addition to auto-invocation
- `allowed-tools` — **space-delimited string**, NOT a YAML array (validator will reject arrays)

### Body

- Keep `SKILL.md` body under 500 lines. Split into sibling `*.md` files if longer.
- File references must be **one level deep** from `SKILL.md`.
- Use forward slashes in paths (cross-platform).
- Use consistent terminology throughout the skill.

## Validation

Always validate before committing:

```bash
gh skill publish --dry-run
```

This must pass with zero errors.

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| `allowed-tools` as YAML array | Convert to space-delimited string: `"Read Edit Write Bash"` |
| First-person description ("I help...") | Rewrite as third person ("Processes...") |
| Vague description without triggers | Add concrete keywords: "Use when the user mentions X, Y, Z" |
| Time-sensitive info ("after Aug 2025...") | Move to an "old patterns" section or remove |
| Nested file references (A → B → C) | Flatten so all references are one level from `SKILL.md` |

## Distribution

- New skills: add under `skills/<name>/SKILL.md`
- Update README skill table when adding a new skill
- Cut a release with `gh skill publish --tag vX.Y.Z` after merging
