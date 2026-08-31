# Honest unknown state

## Description

The panel says `no agent · no session yet` when the server has simply never heard anything,
which is a claim about the repo made from a claim about the server's ignorance. An agent that
was already running when the server started stays invisible until its next tool call, and the
empty state gives no hint that this is what is happening.

## Acceptance Criteria

- [x] `hook.state` carries one `HookState` value, not a pair of booleans: `no-hook`,
      `installed-unheard`, `heard`
- [x] `installed-unheard` gets its own roster row: hooks are in, nothing has posted yet, an
      agent appears on its next action
- [x] `Session` carries `origin: 'announced' | 'inferred'`, set to `inferred` when the session
      is first seen from a tool event rather than `SessionStart`
- [x] An inferred session never reads as `waiting`, because `waiting` is a fact about the agent
      and we do not have it
- [ ] Moved to `P1-WEATHER-signal-vocabulary`: idle derived from `running` would mislabel every
      normal build, because `IDLE_MS` is 20 s and a QuartzX build runs 3 to 10 minutes. A timer
      cannot tell a long command from a dead session; `PostToolUse` can, and `GONE_MS` already
      reaps the dead one after 30 minutes

## Technical Notes

- The bug is the type, not the copy: two booleans encode a tri-state and `main.ts` only tested
  one of the four combinations. Fix the type and the copy follows.
- `heard` outranks the settings files when the server computes the state, because a post is
  proof and a settings file is a guess.
- `rosterStateOf` moved into `core/ui.ts` so the empty states are pinned by a spec rather than
  decided in a render loop.
- No new feed and no new dependency.

## Definition of Done

- [x] Spec pins each `HookState` to its row
- [x] `npm run gate` green
