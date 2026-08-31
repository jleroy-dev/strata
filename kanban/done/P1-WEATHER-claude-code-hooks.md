# Claude Code hooks feed

## Description

Claude Code http hooks post SessionStart / PreToolUse / PostToolUse / Stop /
SessionEnd to the server, which turns them into `agent.*` events. `Stop` is the end of a turn
(the agent waits for the user), not the end of the session; `SessionEnd` is. A reading lights the block, an edit pulses it,
each session in its own derived colour.

## Acceptance Criteria

- [x] `strata hook install` writes the hook entries into a project's `.claude/settings.local.json`
      (`--shared` targets `settings.json`)
- [x] Read, Edit, Write, MultiEdit and NotebookEdit map to reading / editing on the right block;
      a path outside the terrain keeps the verb without a block
- [x] Bash emits `agent.running` (no block); `Stop` emits `agent.waiting`; `SessionEnd` emits
      `agent.left`; idle after 20 s and gone after 30 min of silence are derived from the
      facts by `verbOf` in core, never sent
- [x] Sessions are told apart by colour: hues snapped to weather slots kept apart from each
      other and from country accents (DESIGN.md · Motion)
- [x] No transcript scraping; without the hook there is simply no weather, and the server
      reports whether the hook is installed so the panel can show the deaf state

## Technical Notes

- Subagents share their parent's `session_id` and fold into the same beacon
- `PermissionRequest` is not hooked; a permission prompt shows as the preceding `waiting` or
  the tool's own verb until it is answered

## Definition of Done

- [x] Emissive only: colour and height untouched (ENGINEERING_NOTES law 3)
- [x] `npm run gate` green
