---
name: deslop
description: "Removes AI-generated slop (unnecessary comments, excessive defensive checks, style inconsistencies) from uncommitted changes or a specified scope. Use after AI-assisted edits, before committing, or when the user asks to deslop, clean up AI code, or remove generated noise."
version: "1.0.0"
user-invocable: true
allowed-tools: "Read Edit Write Bash Grep Glob Task"
license: "GPL-3.0"
---

# Remove AI code slop

Remove all AI-generated slop introduced in the target scope. Launch a sub-agent to carry out this process.

**Target scope**:
- If `$ARGUMENTS` is specified, use that as the scope.
- Otherwise, target uncommitted changes in the working tree: the diff shown by `git diff HEAD` plus any untracked files listed by `git status --porcelain`.
- If there are no uncommitted changes and no `$ARGUMENTS`, report that and stop.

AI-generated slop includes:
- Extra comments that a human wouldn't add or is inconsistent with the rest of the file
- Extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths)
- Any other style that is inconsistent with the file

Report at the end with only a 1-3 sentence summary of what you changed.
