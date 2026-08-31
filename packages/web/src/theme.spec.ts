import { SHORE } from '@strata/core';
import { describe, expect, it } from 'vitest';
import { CAP_HEIGHT, COAST, GROUND, PLATFORM_LIFT } from './theme.js';

/**
 * A plate is tessellated until its chord sits within this of the ground, so any two layers
 * closer than twice that can meet where their tessellations disagree.
 */
const SAG = 0.02;

describe('the ground stack', () => {
  it('runs water, continent, country, district, bottom to top', () => {
    const order = [GROUND.water, GROUND.continent.top, GROUND.country.top, GROUND.district.top];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('clears every layer of the one under it by more than a chord can sag', () => {
    const gaps = [
      GROUND.continent.top - GROUND.water,
      GROUND.country.top - GROUND.continent.top,
      GROUND.district.top - GROUND.country.top,
    ];
    for (const gap of gaps) expect(gap).toBeGreaterThan(4 * SAG);
  });

  it('keeps a patch off the continent it lies on and under the country plate that replaces it', () => {
    expect(GROUND.patch).toBeGreaterThan(2 * SAG);
    expect(GROUND.patch).toBeLessThan(GROUND.country.top);
  });

  it('skirts each plate below the layer it stands on, so no gap shows from the side', () => {
    expect(GROUND.country.bottom).toBeLessThan(GROUND.continent.top);
    expect(GROUND.district.bottom).toBeLessThan(GROUND.country.top);
  });

  it('gives every plate real thickness rather than a sheet', () => {
    expect(GROUND.continent.top - GROUND.continent.bottom).toBeGreaterThan(0.2);
    expect(GROUND.country.top - GROUND.country.bottom).toBeGreaterThan(0.2);
    expect(GROUND.district.top - GROUND.district.bottom).toBeGreaterThan(0.2);
  });

  it('carries the land deep enough that the water cuts its wall, not its floor', () => {
    expect(GROUND.continent.bottom).toBeLessThan(GROUND.water);
    expect(GROUND.continent.bottom).toBeLessThan(GROUND.country.bottom);
  });

  it('lays each shade on the layer it darkens and under the plate that casts it', () => {
    expect(GROUND.shade.land).toBeGreaterThan(GROUND.continent.top + 2 * SAG);
    expect(GROUND.shade.land).toBeLessThan(GROUND.country.top);
    expect(GROUND.shade.country).toBeGreaterThan(GROUND.country.top + 2 * SAG);
    expect(GROUND.shade.country).toBeLessThan(GROUND.district.top);
  });

  it('paints the coast as a band of the shore, never the whole of it', () => {
    expect(COAST).toBeGreaterThan(0);
    expect(COAST).toBeLessThan(SHORE);
  });

  it('stands a tower on the district plate rather than inside it', () => {
    expect(PLATFORM_LIFT).toBe(GROUND.district.top);
    expect(CAP_HEIGHT).toBeGreaterThan(0);
  });
});
