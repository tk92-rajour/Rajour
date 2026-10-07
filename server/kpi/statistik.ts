import type { Sammenligning } from '../../shared/types.js';

export function sum(tal: number[]): number {
  // Afrund til hele øre for at undgå flydende-tal-støj (0,1 + 0,2).
  return Math.round(tal.reduce((a, b) => a + b, 0) * 100) / 100;
}

export function gennemsnit(tal: number[]): number | null {
  if (tal.length === 0) return null;
  return tal.reduce((a, b) => a + b, 0) / tal.length;
}

export function median(tal: number[]): number | null {
  if (tal.length === 0) return null;
  const s = [...tal].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sammenlign(nu: number, forrige: number): Sammenligning {
  // Procentændring er kun meningsfuld, når forrige er positiv.
  const aendringPct = forrige > 0 ? ((nu - forrige) / forrige) * 100 : null;
  return { nu, forrige, aendringPct };
}
