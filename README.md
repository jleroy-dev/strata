# strata

An abstract, live 3D view of a codebase. The repo is the terrain: workspace projects are land
plates, folders are platforms, files are towers, imports are roads. The agents working on it are
the weather: a Claude Code session is a light that rests on what it reads and pulses on what it
edits. It sits in a side panel and is read in a glance.

Not a town. Volumes and light, seen from a drone at night. See `docs/DESIGN.md`.

## Run

```
npm install
npm run dev:server -- /path/to/some/repo   # ws://localhost:4747
npm run dev                                 # http://localhost:4746
```

## Check

```
npm run gate   # typecheck, lint, format, test
```

## Shape

`packages/core` pure logic and the event schema, `packages/server` the feeds, `packages/web`
the drawing, `packages/vscode` the panel (later). `docs/ENGINEERING_NOTES.md` has the laws.
