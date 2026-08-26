# First commit and remote

## Description

Put the scaffold on GitHub as a public repository.

## Acceptance Criteria

- [ ] `LICENSE` holds the MIT text `package.json` already claims
- [ ] One initial commit on `master`, staged by path
- [ ] `gh repo create strata --public --source=. --push`
- [ ] The gate workflow runs green on GitHub for that commit

## Technical Notes

- Commit through `/strata-commit`
- `.claude/settings.local.json` and `.playwright-mcp` are ignored; check `git status` shows
  nothing personal before pushing

## Definition of Done

- [ ] Remote exists and CI is green
- [ ] `README.md` states the repository URL
