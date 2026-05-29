import { describe, it, expect } from 'vitest';
import { verdictForRateTask, verdictForComponent, overallVerdict } from './report-all.js';
import type { TaskReport } from '../types.js';

describe('verdictForRateTask', () => {
  it('NO-GO at <=50%', () => expect(verdictForRateTask(0.5)).toBe('NO-GO'));
  it('GO-with-caveats between 50 and 80', () => expect(verdictForRateTask(0.7)).toBe('GO-with-caveats'));
  it('GO at >=80%', () => expect(verdictForRateTask(0.8)).toBe('GO'));
});

function compReport(standalonePassed: number, ngModulePassed: number, rate = 1): TaskReport {
  return { task: 'component', total: 11, passed: standalonePassed + ngModulePassed, rate, cases: [], meta: { standalonePassed, ngModulePassed } };
}
describe('verdictForComponent', () => {
  it('GO when >=5 of each type pass', () => expect(verdictForComponent(compReport(6, 5))).toBe('GO'));
  it('GO-with-caveats when one type is short but rate still >50%', () =>
    expect(verdictForComponent(compReport(6, 4, 0.91))).toBe('GO-with-caveats'));
  it('GO-with-caveats when >=5 each but rate <80% (spec §5 rate clause)', () =>
    expect(verdictForComponent(compReport(5, 5, 0.7))).toBe('GO-with-caveats'));
  it('NO-GO when rate <=50%', () => expect(verdictForComponent(compReport(3, 2, 0.45))).toBe('NO-GO'));
  it('NO-GO when meta missing (cannot prove the per-type gate)', () =>
    expect(verdictForComponent({ task: 'component', total: 11, passed: 11, rate: 1, cases: [] })).toBe('NO-GO'));
});

describe('overallVerdict', () => {
  it('NO-GO if any task is NO-GO', () => {
    expect(overallVerdict(['GO', 'NO-GO', 'GO'])).toBe('NO-GO');
  });
  it('GO-with-caveats if any caveats and no NO-GO', () => {
    expect(overallVerdict(['GO', 'GO-with-caveats', 'GO'])).toBe('GO-with-caveats');
  });
  it('GO if all GO', () => expect(overallVerdict(['GO', 'GO', 'GO'])).toBe('GO'));
});
