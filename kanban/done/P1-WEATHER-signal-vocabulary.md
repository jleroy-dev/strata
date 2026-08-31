# Wider signal vocabulary

## Description

Four hook events are wired of roughly thirty available, and only `PreToolUse` fires mid-turn.
During a long tool call, a long think, or a wait on the user, nothing arrives, so an agent can
be invisible for a whole turn. Three more events carry genuinely new domain meaning rather than
mirroring the vendor's taxonomy.

## Acceptance Criteria

- [x] `AgentSignal` gains `blocked` (a human decision is wanted) and `prompt` (the user spoke to
      the agent), and a tool-end kind so `running` can end
- [x] `Notification` with `permission_prompt`, `agent_needs_input` maps to `blocked`; a new
      `agent.blocked` fact and roster verb exist
- [x] `UserPromptSubmit` maps to `prompt`, so a parked agent appears the moment it is spoken to
- [x] `PostToolUse` ends `running` rather than leaving it to the idle timer, which is the only
      honest way to tell a ten-minute build from a session that died mid-Bash
- [x] `UserPromptSubmit`, `PostToolUse` and the tool events proved against Claude Code 2.1.246
      with a capture server and three real sessions
- [ ] `Notification` unproven: it did not fire in any headless run, including one where a Write
      was refused. It needs an interactive session to confirm, so the `blocked` copy is not
      settled yet even though the plumbing is in

## Technical Notes

- Three signals, two verbs: `prompt` and tool-end both mean the agent is alive and working on
  something the panel cannot name, which is `thinking`. It is not optional: after a Bash ends the
  agent is neither `running` nor `waiting`, so tool-end has nowhere else to land.
- `PostToolUse` is matched to `Bash` alone. Bash is the only tool with no knowable length, and a
  wider matcher posts the contents of every file read back to the server. `PostToolBatch` was
  rejected for the same reason: one post per batch, but carrying every tool response.
- Neither new verb adds motion, so read (vertical), edit (radial) and run (rotation) keep their
  three exclusive axes. `blocked` takes the waiting posture; the mark that separates it is the
  open visual decision.
- Found and fixed while probing: Claude Code reports `cwd` already resolved, so a root reached
  through a symlink matched nothing and every signal was silently discarded. Verified end to end
  on `/tmp` (a symlink on macOS): before, everything dropped; now `unmapped: 0`.
- Found and not fixed: `PreToolUse` fires before the permission decision, so a refused edit still
  lights a block. Its own card.

- Subagent events (`SubagentStart` / `SubagentStop`) are deliberately out of scope: they change
  the beacon from one-per-session to a hierarchy, which is a DESIGN question, not plumbing.
- The adapter boundary is what makes this cheap; keep the mapping in
  `server/adapters/claude-code.ts` and out of `core`.

## Definition of Done

- [x] `blocked` is drawn per DESIGN.md, emissive only: the waiting posture plus a static
      reticle ring at a fixed screen size, additive like every other beacon part, no rotation and
      no pulse of its own
- [x] `npm run gate` green
