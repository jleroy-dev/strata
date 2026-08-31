# Repo-qualified block ids and the mount table

## Description

`BlockId` is documented as a repo-relative path and the server is single-root, which makes more
than one repo impossible and makes two servers collide on one port. The change is small now and
grows monotonically more expensive: sixteen files already reference `BlockId`, and almost all of
them treat it as opaque or take its basename.

## Acceptance Criteria

- [x] `BlockId` is a repo-qualified POSIX path, branded along with `RepoId` and `RepoPath` so the
      boundary between them is checked rather than remembered
- [x] The server holds one mount table from repo id to absolute root; `core` and `web` never see
      a root
- [x] Every site that resolves an id back to disk goes through the table: terrain and roads file
      reads, `filePath()` in the Claude Code adapter, and the editor link in `web`
- [x] `placeBlocks` takes the repo and keeps working in bare paths, qualifying on output, so a
      file above every marker gets the repo as its country instead of an empty string that would
      collide across repos
- [x] `familyOf` keeps reading family from the top-level folder inside the repo, not from the
      repo name
- [x] The table has exactly one entry and nothing visible changes

## Technical Notes

- The separator is `:`, chosen on data: zero occurrences across roughly 44,000 tracked paths in
  the sixty repos under `~/QuartzX`. Splitting on the first one means a colon inside a path is
  harmless, and `repoId` refuses one in a repo id.
- Branding turned the silent failure mode into a compile error. It also kept the work honest:
  the compiler found every one of the twenty-one source sites and about a hundred spec sites.
- The fixture regeneration was verified rather than eyeballed: stripping every `repo:` prefix
  from the new snapshot reproduces the old one exactly, same eighty blocks, so no layout
  regression is hiding inside a 30 KB diff.
- Verified live against a real agent session: `agent.reading id=repo:src/greet.ts [in layout]`,
  `unmapped: 0`.

- Prefix-safe by inspection: the parsing sites are almost all `lastIndexOf('/')`, which is
  basename or dirname. The ones that care about the front of the string are `familyOf`, the
  editor link, and the adapter.
- Do this before more code accretes on repo-relative paths, not when multirepo starts.

## Definition of Done

- [x] Layout fixture regenerated and the spec pins qualified ids
- [x] `npm run gate` green
