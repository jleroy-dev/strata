# Commit Message Guidelines

This document outlines the commit message standards for the Strata project, based on the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Commit Message Format

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types

| Type       | Description                                               | Example                                               |
| ---------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `feat`     | A new feature                                             | `feat(user-profile): add avatar upload functionality` |
| `fix`      | A bug fix                                                 | `fix(file-manager): resolve upload permissions issue` |
| `refactor` | Code change that neither fixes a bug nor adds a feature   | `refactor(auth): simplify token validation logic`     |
| `perf`     | Performance improvement                                   | `perf(dashboard): optimize chart rendering`           |
| `style`    | Code style changes (formatting, missing semicolons, etc.) | `style: enforce consistent type imports`              |
| `test`     | Adding or modifying tests                                 | `test(ui): add validators unit tests`                 |
| `docs`     | Documentation changes                                     | `docs(api): update swagger documentation`             |
| `build`    | Build system or dependency changes                        | `build: update three to 0.186`                        |
| `ci`       | Continuous integration changes                            | `ci: add sonarcloud quality gate`                     |
| `chore`    | Maintenance tasks                                         | `chore: update dependencies`                          |

## Scopes

Scopes are the packages, plus the usual infrastructure names:

- `core` - event schema, hierarchy and layout (`packages/core`)
- `server` - watcher, git, hook receiver, WebSocket (`packages/server`)
- `web` - the Three.js view (`packages/web`)
- `vscode` - the extension adapter (`packages/vscode`)
- `docs` - `docs/`, `kanban/`, `CLAUDE.md`
- `build` - workspace, TypeScript, Vite configuration
- `ci` - GitHub Actions
- `lint` - ESLint and Prettier
- `test` - Vitest configuration and shared fixtures

## Description Guidelines

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize the first letter of the description in the commit title (e.g., `feat(settings): add theme toggle`)
- Don't capitalize the first letter of list items
- No period at the end
- Maximum 72 characters
- Be concise but descriptive: summarize what was done and why
- Avoid excessive detail or over-explaining
- If the reason doesn't add meaningful context, leave it out: it may not be necessary to mention at all
- **Don't mention tasks that are implicitly done**: Avoid stating obvious implementation details that are inherently part of the main task
- **Focus on the main scope**: When changes span packages, use the one carrying the change (for example `core` over `web` when a layout law moves and the view only follows it)

### Scope Prioritization

1. The package whose behaviour changed (`core`, `server`, `web`, `vscode`)
2. Infrastructure (`build`, `ci`, `lint`, `test`) only when nothing else moved
3. `docs` when only documents changed

```text
feat(core): pack districts as squarified treemaps
fix(server): tell a rename from a remove and an add
feat(web): pulse a block an agent is editing
docs: record the weather feed
```

### Avoiding Redundant Details

When implementing a feature, don't explicitly mention every sub-task that's obviously required. Focus on the main change and its purpose.

**Good Examples:**

````text
feat(web): add the caption card

The selected block is the only bridge back to the editor.

- show path, size and the last events
- open the file in VS Code on click

**Bad Examples:**

```text
feat(web): add the caption card

The selected block is the only bridge back to the editor.

- show path, size and the last events
- open the file in VS Code on click

**Explanation:** When adding a button, it's implicit that you'll add translations, styling, icons, and other standard UI elements. When adding functionality, it's implicit that you'll implement the necessary UI components, API calls, and error handling. Additionally, similar changes like multiple validation rules should be grouped together rather than listed individually.

## Body (Optional)

- Separate from description with a blank line
- **Preferred approach**: Use only bullet points listing key implementation details that aren't obvious from the title
- **Alternative approach**: Add a context paragraph only when summarizing large/complex changes or providing essential business context
- **Bullet points**: Use imperative mood, don't capitalize first letter
- **Group similar changes**: When multiple changes in a file are similar, regroup them under one bullet point rather than listing each separately
- **Avoid excessive specificity**: Don't be overly detailed if it doesn't add value to the reader (e.g., avoid "add margin-bottom removal class", use "improve spacing" instead)
- **Group API property changes**: When changes reflect new API properties or backend data structure updates, group them as one logical change rather than listing each property separately
- **Bullet point ordering**: Group by action type when possible:
  1. **Additions** (`add`, `implement`, `create`) - new functionality/components
  2. **Updates/Changes** (`update`, `modify`, `change`, `improve`) - existing functionality
  3. **Integrations** (`integrate`, `connect`, `configure`) - connecting systems
  4. **Removals** (`remove`, `delete`, `deprecate`) - cleanup/removal
  5. **Fixes** (`fix`, `resolve`, `correct`) - bug fixes and corrections
- Reference issues and pull requests when relevant

## Footer (Optional)

- Reference breaking changes
- Close issues
- Add co-authors

### Breaking Changes

```text
feat(api)!: remove deprecated endpoints

Remove legacy authentication endpoints in favor of OAuth 2.0

BREAKING CHANGE: `/api/v1/auth/login` endpoint has been removed
````

### Issue References

```text
fix(data-room): resolve upload timeout

Fixes #1234
Closes #5678
```

## Examples

### Simple Changes (Preferred)

Most commits should use only bullet points without a context paragraph:

```text
feat(dashboard): add data export button

- add CSV and Excel export options
- implement file size validation for large datasets
- integrate with existing download service

fix(auth): resolve token refresh timing issue

- add retry mechanism for failed refresh attempts
- update refresh logic to trigger 5 minutes before expiration

refactor(ui): extract reusable date picker component

- create reusable date picker component
- add customizable date format options
- update existing forms to use new component
- remove duplicate date picker logic from forms

feat(user-management): enhance user profile functionality

- add profile picture upload feature
- implement user preference settings
- update user dashboard layout
- integrate with notification service
- remove deprecated user status fields
- fix profile validation edge cases

feat(dashboard): add interactive chart filtering

- implement new chart component with filtering capabilities
- update existing UI button styles to support chart actions
- integrate with data service for real-time updates

feat(user-profile): improve status display in search results

- update profile display to show status information instead of type descriptions
- remove unused description computation logic
- improve table spacing consistency
```

### Complex Changes (With Context)

Use a context paragraph only for large changes or when business context is essential:

### Feature Addition

```text
feat(reporting): add summary report generation

Management requires standardized reports for business reviews and
performance analysis during quarterly assessments.

- add ReportService for generating summaries
- implement PDF export functionality
- add unit tests for report generation

Closes #456
```

### Bug Fix

```text
fix(query-builder): prevent form submission on help button click

User reports indicated confusion when help button triggers form
submission instead of showing help content.

- add type="button" to help icon button to prevent unwanted form submission

Fixes #789
```

### Breaking Change

```text
feat(api)!: migrate to new authentication system

Security audit identified vulnerabilities in custom authentication.
Enterprise customers require SSO support for compliance.

- replace custom JWT implementation with Auth0
- add SAML and OIDC support for enterprise SSO
- implement role-based access control improvements

BREAKING CHANGE: All authentication endpoints have changed.
See migration guide for details.
```

### Performance Improvement

```text
perf(dashboard): optimize chart data processing

Users experience 5+ second load times with large datasets affecting
productivity during peak analysis periods.

- add virtual scrolling for data tables
- implement lazy loading for chart data
- cache frequently accessed calculations
```

## Validation

Before committing, ensure:

- [ ] Message follows the conventional format
- [ ] Type is appropriate for the change
- [ ] Scope matches the affected area
- [ ] Description is clear and concise
- [ ] Breaking changes are properly documented
- [ ] Tests pass and lint checks succeed

## Integration with Tools

This project uses:

- **Husky** for pre-commit hooks
- **lint-staged** for staged file linting
- **Conventional Commits** for automated changelog generation
- **SonarCloud** for code quality analysis

Following these guidelines ensures:

- Consistent commit history
- Automated version bumping
- Clear release notes
- Better collaboration and code review
