export type Family = 'apps' | 'libs' | 'docs' | 'plumbing';

export const FAMILIES: readonly Family[] = ['apps', 'libs', 'docs', 'plumbing'];

/** Variants within a family's hue band; touching plates are assigned different ones. */
export const VARIANTS_PER_FAMILY = 6;

const BY_TOP: Readonly<Record<string, Family>> = {
  apps: 'apps',
  libs: 'libs',
  packages: 'libs',
  docs: 'docs',
  kanban: 'docs',
};

/** The family of a country, read off its top-level folder and never configured. */
export function familyOf(country: string): Family {
  const top = country.split('/')[0] ?? '';
  return BY_TOP[top] ?? 'plumbing';
}

export function familyRank(family: Family): number {
  return FAMILIES.indexOf(family);
}
