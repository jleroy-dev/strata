import { COUNTRY_SKIRT, DISTRICT_SKIRT, contains, skirted, type Rect } from '@strata/core';
import { describe, expect, it } from 'vitest';
import { SETTLE_DECAY, Settling, countryKey, districtKey, settleFactor } from './settle.js';

const rect = (x: number, z: number, w: number, h: number): Rect => ({ x, z, w, h });

describe('settleFactor', () => {
  it('leaves the same fraction of the distance after a second, whatever the frame rate', () => {
    const steps = (n: number): number => {
      let left = 1;
      for (let i = 0; i < n; i++) left *= 1 - settleFactor(1 / n);
      return left;
    };
    expect(steps(60)).toBeCloseTo(SETTLE_DECAY, 10);
    expect(steps(30)).toBeCloseTo(SETTLE_DECAY, 10);
    expect(steps(144)).toBeCloseTo(SETTLE_DECAY, 10);
  });
});

describe('Settling', () => {
  it('stands a plate where it is told when it snaps', () => {
    const s = new Settling();
    s.target('a', rect(2, 3, 4, 5), undefined, true);
    expect(s.rectOf('a')).toEqual(rect(2, 3, 4, 5));
  });

  it('births a plate with no size inside the one it stands on', () => {
    const s = new Settling();
    s.target('c', rect(0, 0, 10, 10), undefined, true);
    expect(s.target('d', rect(20, 4, 2, 2), 'c')).toBe('born');
    const born = s.rectOf('d');
    expect([born?.w, born?.h]).toEqual([0, 0]);
    expect(contains(rect(0, 0, 10, 10), born ?? rect(0, 0, 0, 0))).toBe(true);
  });

  it('reports what changed, so nothing dissolves for a plate that is only born', () => {
    const s = new Settling();
    expect(s.target('a', rect(0, 0, 4, 4))).toBe('born');
    expect(s.target('a', rect(0, 0, 4, 4))).toBe('held');
    expect(s.target('a', rect(1, 0, 4, 4))).toBe('moved');
  });

  it('arrives where it was going and then stops moving', () => {
    const s = new Settling();
    s.target('a', rect(0, 0, 4, 4), undefined, true);
    s.target('a', rect(10, 10, 8, 8));
    let frames = 0;
    while (s.moving && frames < 600) s.tick(1000 + (++frames * 1000) / 60);
    expect(s.rectOf('a')).toEqual(rect(10, 10, 8, 8));
    expect(frames / 60).toBeLessThan(3);
  });

  it('keeps a platform inside its plate every frame while both settle', () => {
    const s = new Settling();
    const country = countryKey('repo:api');
    const district = districtKey('repo:api', 'src');
    s.target(country, rect(0, 0, 10, 6), undefined, true);
    s.target(district, rect(0, 0, 4, 4), country, true);

    s.target(country, rect(0, 0, 10, 14));
    s.target(districtKey('repo:api', 'docs'), rect(0, 8, 6, 6), country);

    for (let i = 1; i <= 240; i++) {
      s.tick(1000 + (i * 1000) / 60);
      const plate = s.rectOf(country);
      expect(plate).toBeDefined();
      for (const key of [district, districtKey('repo:api', 'docs')]) {
        const platform = s.rectOf(key);
        expect(platform).toBeDefined();
        expect([
          key,
          contains(skirted(plate!, COUNTRY_SKIRT), skirted(platform!, DISTRICT_SKIRT)),
        ]).toEqual([key, true]);
      }
    }
  });

  it('carries a plate to another key rather than dropping and rebuilding it', () => {
    const s = new Settling();
    s.target('from', rect(1, 1, 2, 2), undefined, true);
    s.rename('from', 'to');
    expect(s.has('from')).toBe(false);
    expect(s.rectOf('to')).toEqual(rect(1, 1, 2, 2));
  });

  it('drops every plate a layout no longer holds', () => {
    const s = new Settling();
    s.target('a', rect(0, 0, 1, 1), undefined, true);
    s.target('b', rect(0, 0, 1, 1), undefined, true);
    s.keep(new Set(['a']));
    expect([s.has('a'), s.has('b'), s.count]).toEqual([true, false, 1]);
  });

  it('takes one step however long the tab was hidden', () => {
    const s = new Settling();
    s.target('a', rect(0, 0, 4, 4), undefined, true);
    s.target('a', rect(100, 0, 4, 4));
    s.tick(1000);
    s.tick(1000 + 60_000);
    expect(s.rectOf('a')?.x).toBeLessThan(100);
  });
});
