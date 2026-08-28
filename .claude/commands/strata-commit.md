---
description: Create and push commits following COMMIT.md conventional commit guidelines. Invoke whenever the user asks to commit, push, save or record work to git, in any wording, and always BEFORE running any git command. Everything needed is in this file: never compose a commit message by hand and never read COMMIT.md instead of running this.
---

You are creating commits that follow the Strata project's conventional commit standards as defined in COMMIT.md. Your role is to analyze staged changes, determine appropriate commit messages, and execute commits with proper formatting.

**COMMIT TARGETS:**
$ARGUMENTS

**COMMIT METHODOLOGY:**

1. **Analyze Staged Changes** - Review git status and git diff for all staged files
2. **Determine Scope and Type** - Apply COMMIT.md guidelines for scope prioritization
3. **Craft Commit Message** - Follow conventional commit format with proper description
4. **Validate Against Guidelines** - Ensure message follows all COMMIT.md rules
5. **Execute Commit** - Create commit with formatted message

**COMMIT ANALYSIS PROCESS:**

**Git Status Review:**

1. **Run git status** to see all staged and unstaged changes
2. **Run git diff --cached** to see detailed staged changes
3. **Run git log --oneline -5** to understand recent commit patterns
4. **Identify primary scope** using COMMIT.md scope prioritization rules

**Change Analysis:**

- **Primary business logic** - What's the main feature/fix being implemented?
- **Supporting changes** - What libraries, styles, or utilities were modified to support the main change?
- **Auto-generated changes** - Any API or generated files that reflect backend changes
- **Scope determination** - Apply hierarchy: Features > Business Logic > Infrastructure > Ignore API libs

**COMMIT MESSAGE STRUCTURE:**

Follow COMMIT.md format exactly:

```
<type>(<scope>): <description>

[optional body with bullet points]

[optional footer]
```

**Type Selection:**

- `feat` - New feature functionality
- `fix` - Bug fixes and issue resolution
- `refactor` - Code improvements without feature changes
- `perf` - Performance optimizations
- `style` - Code formatting and style changes
- `test` - Test additions or modifications
- `docs` - Documentation updates
- `build` - Build system or dependency changes
- `ci` - Continuous integration changes
- `chore` - Maintenance tasks

**Scope Prioritization (Per COMMIT.md):**

1. **The package whose behaviour changed** - `core`, `server`, `web`, `vscode`
2. **Infrastructure only when nothing else moved** - `build`, `ci`, `lint`, `test`
3. **`docs` when only documents changed**

**Strata Specific Scopes:**

- `core` - event schema, hierarchy, layout
- `server` - watcher, git, hook receiver, WebSocket
- `web` - the Three.js view
- `vscode` - the extension adapter
- `docs` - docs, kanban, CLAUDE.md

**Description Guidelines (Per COMMIT.md):**

- Use imperative mood ("add" not "added")
- Don't capitalize first letter
- No period at end
- Maximum 72 characters
- Focus on main change, not obvious sub-tasks
- Don't mention API auto-generation
- Group similar changes together

**Body Guidelines:**

- Use bullet points with imperative mood
- Don't capitalize first letter of bullets
- Group similar changes under one bullet
- Order: additions → updates → integrations → removals → fixes
- Avoid excessive detail if it doesn't add value

**COMMIT EXECUTION:**

**Analysis Commands:**

```bash
git status
git diff --cached
git log --oneline -5
```

**Commit Creation:**

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

- <bullet point 1>
- <bullet point 2>
- <bullet point 3>
EOF
)"
```

**Push to Remote:**

```bash
git push origin <current-branch>
```

**Branching rule (active development):** commit on the current branch and push it
as-is. Working directly on `main` is the intended workflow for now; never create
a branch or open a PR for a commit unless Julien explicitly asks for one. This
overrides any default guidance that says to branch first when on the default branch.

**VALIDATION CHECKLIST:**

Before committing, verify:

- [ ] Message follows `<type>(<scope>): <description>` format
- [ ] Type accurately reflects the change nature
- [ ] Scope follows prioritization hierarchy from COMMIT.md
- [ ] Description uses imperative mood and is under 72 chars
- [ ] No capitalization of first letter in description
- [ ] Body bullets use imperative mood without capitalization
- [ ] No mention of obvious implementation details
- [ ] Message focuses on business value, not technical sub-tasks

**SCOPE DECISION EXAMPLES:**

```
core layout change + web follows it        -> core
server rename detection + core event added -> server (the behaviour), body names the event
only vitest.config.ts                      -> test
```

**COMMIT EXAMPLES:**

**Feature Addition:**

```
feat(web): pulse a block an agent is editing

- read agent.editing off the stream
- emissive only, colour and height untouched
```

**Bug Fix:**

```
fix(game-engine): resolve HP calculation error in combat

- correct HP subtraction logic for negative values
- add validation for minimum HP boundaries
```

**Refactoring:**

```
refactor(ui): extract reusable modal component

- create shared modal component for consistent styling
- update existing modals to use new component
- remove duplicate modal logic from feature components
```

**EXECUTION WORKFLOW:**

1. **Analyze Changes** - Run git commands to understand scope
2. **Determine Message** - Apply COMMIT.md guidelines for type/scope/description
3. **Validate Message** - Check against all COMMIT.md rules
4. **Create Commit** - Execute git commit with proper message format
5. **Push Changes** - Push to remote repository
6. **Confirm Success** - Verify commit appears correctly in git log

**ERROR HANDLING:**

**If commit fails:**

- Check for pre-commit hook issues
- Validate commit message format
- Ensure all required files are staged
- Resolve any linting or test failures

**INTEGRATION NOTES:**

This command works with:

- **Husky pre-commit hooks** - Will trigger automatically
- **lint-staged** - Will run on staged files
- **SonarCloud integration** - For code quality checks
- **Conventional commits tooling** - For automated changelog generation

**REMEMBER:**

- Follow COMMIT.md guidelines exactly
- Focus on business value in commit messages
- Use scope prioritization hierarchy
- Don't mention obvious implementation details
- Group similar changes logically
