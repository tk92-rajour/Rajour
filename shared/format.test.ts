import { describe, expect, it } from 'vitest';
import { aendring, beloebStort, dage, dato, forskel, klokken, kr, krKort, parseTal, pct } from './format.js';

describe('dansk formatering', () => {
  it('kroner', () => {
    expect(kr(1234.5, 2)).toBe('1.234,50 kr.');
    expect(kr(1234.5)).toBe('1.235 kr.');
    expect(kr(1234567)).toBe('1.234.567 kr.');
    expect(kr(-200, 2)).toBe('−200,00 kr.');
    expect(kr(-0.001, 2)).toBe('0,00 kr.');
    expect(kr(0)).toBe('0 kr.');
  });
  it('store KPI-beløb', () => {
    expect(beloebStort(152586.01)).toBe('152.586');
    expect(beloebStort(1424700)).toBe('1,42 mio.');
    expect(beloebStort(-2500)).toBe('−2.500');
  });
  it('kompakte beløb', () => {
    expect(krKort(1_250_000)).toBe('1,3 mio.');
    expect(krKort(45_000)).toBe('45 t.');
    expect(krKort(950)).toBe('950');
  });
  it('procent og ændring', () => {
    expect(pct(12.345)).toBe('12,3 %');
    expect(aendring(12.4)).toBe('+12 %');
    expect(aendring(-3.54)).toBe('−3,5 %');
    expect(aendring(0.01)).toBe('±0 %');
    expect(forskel(-2)).toBe('−2');
  });
  it('dato og tid', () => {
    expect(dato(new Date('2026-10-07T14:05:00'))).toBe('7. okt. 2026');
    expect(klokken(new Date('2026-10-07T09:05:00'))).toBe('09:05');
  });
  it('dage', () => {
    expect(dage(1)).toBe('1 dag');
    expect(dage(12.46)).toBe('12,5 dage');
    expect(dage(0)).toBe('0 dage');
  });
  it('læser danske tal fra indtastning', () => {
    expect(parseTal('1.234,50')).toBe(1234.5);
    expect(parseTal('1234,5')).toBe(1234.5);
    expect(parseTal(' 12 500 kr. ')).toBe(12500);
    expect(parseTal('1.234')).toBe(1234);
    expect(parseTal('1.234.567')).toBe(1234567);
    expect(parseTal('99.5')).toBe(99.5);
    expect(parseTal('-200')).toBe(-200);
    expect(parseTal('−1.500,25')).toBe(-1500.25);
    expect(parseTal('')).toBeNull();
    expect(parseTal('abc')).toBeNaN();
    expect(parseTal('1,2,3')).toBeNaN();
  });
});
