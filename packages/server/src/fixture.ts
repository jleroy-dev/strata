import { readFileSync } from 'node:fs';

export type Listing = [string, number][];

/** A small invented workspace: the scratch terrain, and the demo's when no dump is present. */
export const FIXTURE: Listing = [
  ['package.json', 400],
  ['README.md', 4200],
  ['.gitignore', 20],
  ['docs/DESIGN.md', 21000],
  ['docs/NOTES.md', 6400],
  ['docs/adr/0001-layout.md', 3200],
  ['docs/adr/0002-motion.md', 2800],
  ['docs/adr/0003-weather.md', 4100],
  ['apps/api/package.json', 300],
  ['apps/api/src/main.ts', 1200],
  ['apps/api/src/app/rooms.controller.ts', 3100],
  ['apps/api/src/app/rooms.service.ts', 5200],
  ['apps/api/src/app/rooms.service.spec.ts', 7600],
  ['apps/api/src/app/users.controller.ts', 2400],
  ['apps/api/src/db/migrate.ts', 2100],
  ['apps/api/src/db/seed.ts', 1500],
  ['apps/api/src/db/schema.ts', 4800],
  ['apps/web/package.json', 300],
  ['apps/web/src/main.ts', 500],
  ['apps/web/src/pages/home.page.ts', 3900],
  ['apps/web/src/pages/room.page.ts', 6100],
  ['apps/web/src/pages/login.page.ts', 2200],
  ['apps/web/src/state/store.ts', 3400],
  ['apps/web/src/state/actions.ts', 2600],
  ['apps/web/src/state/selectors.ts', 1900],
  ['libs/shared/ui/package.json', 300],
  ['libs/shared/ui/src/button.ts', 1900],
  ['libs/shared/ui/src/dialog.ts', 4300],
  ['libs/shared/ui/src/toast.ts', 1500],
  ['libs/shared/ui/src/forms/field.ts', 2700],
  ['libs/shared/ui/src/forms/select.ts', 3300],
  ['libs/shared/ui/src/forms/search.ts', 2100],
  ['libs/shared/util/package.json', 300],
  ['libs/shared/util/src/dates.ts', 2200],
  ['libs/shared/util/src/strings.ts', 1700],
  ['libs/shared/util/src/guards.ts', 900],
  ['libs/story/engine/package.json', 300],
  ['libs/story/engine/src/engine.ts', 14000],
  ['libs/story/engine/src/parser.ts', 6800],
  ['libs/story/engine/src/tokens.ts', 1200],
  ['libs/story/engine/src/nodes/scene.ts', 3600],
  ['libs/story/engine/src/nodes/choice.ts', 2900],
  ['tools/scripts/package.json', 300],
  ['tools/scripts/src/build.ts', 2500],
  ['tools/scripts/src/release.ts', 3100],
  ['tools/scripts/src/lint.ts', 1400],
];

/** The listing the product mockup was built on, when its dump is on this machine. */
export function mockupListing(): Listing | undefined {
  const dump = new URL('../../../docs/mockups/data/tellmeastory.local.js', import.meta.url);
  try {
    const text = readFileSync(dump, 'utf8');
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(json) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return undefined;
    return parsed.files.filter(
      (f): f is [string, number] =>
        Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'number',
    );
  } catch {
    return undefined;
  }
}

export const listing = (): Listing => mockupListing() ?? FIXTURE;
