# Claude Code hooks feed

## Description

A hook script for Claude Code posts SessionStart / PreToolUse / PostToolUse / Stop /
SessionEnd to the server, which turns them into `agent.*` events. `Stop` is the end of a turn
(the agent waits for the user), not the end of the session; `SessionEnd` is. A reading lights the block, an edit pulses it,
each session in its own derived colour.

## Acceptance Criteria

- [ ] `strata hook install` writes the hook entries into a project's `.claude/settings.json`
- [ ] Read, Edit, Write and Bash-with-a-path map to reading / editing on the right block
- [ ] Bash emits `agent.running` (no block); `Stop` emits `agent.waiting`; 20 s without an
      event emits `agent.idle`; `SessionEnd` or a long silence emits `agent.left`
- [ ] Sessions are told apart by colour: hues snapped to weather slots kept apart from each
      other and from country accents (DESIGN.md · Motion)
- [ ] No transcript scraping; without the hook there is simply no weather, and the server
      reports whether the hook is installed so the panel can show the deaf state

## Definition of Done

- [ ] Emissive only: colour and height untouched (ENGINEERING_NOTES law 3)
- [ ] `npm run gate` green
