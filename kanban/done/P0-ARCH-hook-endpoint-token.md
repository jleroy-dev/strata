# Hook endpoint token and uninstall

## Description

`POST /hook` is unauthenticated and its payloads carry `tool_input`: full shell commands and
the content of written files. Any local process that binds the port before strata receives
them, from every repo where the hook was ever installed. There is also no way to remove a hook,
and installing at a new port appends an entry rather than replacing the old one, so entries
accumulate and nothing reaps them.

## Acceptance Criteria

- [x] `strata hook install` writes a per-machine token into the hook URL and into a file the
      server reads at startup; the server rejects any post without it
- [x] Installing when a strata hook already exists replaces that entry instead of appending a
      second one
- [x] `strata hook uninstall [dir]` removes strata's entries and leaves every other hook alone
- [x] `/dev/*` no longer sets `access-control-allow-origin: *`; with `STRATA_DEV=1` a page in a
      browser cannot reach it
- [x] A stale hook pointing at a dead or foreign port is inert rather than leaking

## Technical Notes

- Verified live on a scratch repo: no token and a wrong token both give 401, the right one 204,
  `/health` counts the rejections, and the token file is 0600.
- `/dev/*` echoes the request origin only when it is loopback, so the dev panel on :4746 keeps
  working and a page on a public origin gets no CORS header at all. Residual, and dev-only:
  another page served from loopback could still reach `/dev/*` while `STRATA_DEV=1`.

- `Actions` called `renameSync`, `rmSync` and `writeFileSync` against the watched root, which is
  what made the wildcard CORS on `/dev/*` a drive-by file deletion rather than a theoretical one.
  Closed since, under law 8: the file actions take a `Scratch`, minted only by `seedScratch` and
  `cloneScratch`, so no dev action can name a watched root. The loopback residual above still
  stands, but it now reaches a throwaway clone and the signal actions, which write nothing.
- Design this token as machine-wide, not per repo: the mount table makes hook install a
  one-time act rather than a per-repo one.

## Definition of Done

- [x] Spec covers reject-without-token and install-is-idempotent
- [x] `npm run gate` green
