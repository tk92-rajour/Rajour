// Dansk formatering (da-DK) af beløb, procenter, datoer og tidspunkter.

const krFormat = [0, 1, 2].map(
  (dec) => new Intl.NumberFormat('da-DK', { minimumFractionDigits: dec, maximumFractionDigits: dec }),
);

/** 1234.5 → "1.234,50 kr." (decimaler=2) / "1.235 kr." (decimaler=0). Minus som typografisk "−". */
export function kr(beloeb: number, decimaler: 0 | 2 = 0): string {
  return `${tal(beloeb, decimaler)} kr.`;
}

/**
 * Beløb til store KPI-tal, uden "kr." (vises som enhed):
 * under 1 mio. → "152.586"; derover → "1,42 mio."
 */
export function beloebStort(beloeb: number): string {
  return Math.abs(beloeb) >= 1_000_000 ? `${tal(beloeb / 1_000_000, 2)} mio.` : tal(beloeb, 0);
}

/** Tal med danske tusind- og decimaltegn. */
export function tal(n: number, decimaler: 0 | 1 | 2 = 0): string {
  const s = krFormat[decimaler].format(Math.abs(n));
  // Undgå "−0" når et lille negativt tal afrundes til 0.
  return n < 0 && Number(Math.abs(n).toFixed(decimaler)) !== 0 ? `−${s}` : s;
}

/** Kompakt beløb til grafakser: 1.250.000 → "1,3 mio.", 45.000 → "45 t." */
export function krKort(beloeb: number): string {
  const a = Math.abs(beloeb);
  if (a >= 1_000_000) return `${tal(beloeb / 1_000_000, 1)} mio.`;
  if (a >= 1_000) return `${tal(beloeb / 1_000, 0)} t.`;
  return tal(beloeb, 0);
}

/** 12.345 → "12,3 %" */
export function pct(n: number, decimaler: 0 | 1 = 1): string {
  return `${tal(n, decimaler)} %`;
}

/** Ændring med fortegn: "+12 %", "−3,5 %", "±0 %". */
export function aendring(n: number): string {
  const afrundet = Math.round(n * 10) / 10;
  if (afrundet === 0) return '±0 %';
  const dec = Math.abs(afrundet) >= 10 ? 0 : 1;
  return `${afrundet > 0 ? '+' : '−'}${tal(Math.abs(afrundet), dec)} %`;
}

/** Forskel i antal med fortegn: "+3", "−2", "±0". */
export function forskel(n: number): string {
  if (n === 0) return '±0';
  return `${n > 0 ? '+' : '−'}${tal(Math.abs(n))}`;
}

const datoFormat = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
const datoKortFormat = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' });
const ugedagFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'long' });

/** "7. okt. 2026" */
export function dato(d: Date | string): string {
  return datoFormat.format(new Date(d));
}

/** "7. okt." */
export function datoKort(d: Date | string): string {
  return datoKortFormat.format(new Date(d));
}

/** "onsdag" */
export function ugedag(d: Date | string): string {
  return ugedagFormat.format(new Date(d));
}

/** "14:05" */
export function klokken(d: Date | string): string {
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

/** "1 dag", "12,5 dage" */
export function dage(n: number): string {
  const dec = n % 1 === 0 || n >= 100 ? 0 : 1;
  const s = tal(n, dec);
  return `${s} ${s === '1' ? 'dag' : 'dage'}`;
}

/**
 * Læser et tal skrevet på dansk: "1.234,50" → 1234.5, "1234,5" → 1234.5, "-200" → −200.
 * Accepterer også "1234.50" (punktum som decimaltegn), når det ikke ligner tusindtalsseparator.
 * Tom streng → null. Ugyldigt → NaN.
 */
export function parseTal(input: string): number | null {
  let s = input.trim().replace(/\s|kr\.?$/gi, '').replace(/[−–]/g, '-');
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" / "1.234.567" = tusinder
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Lokal dato → 'YYYY-MM-DD'. */
export function isoDato(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Seneste hverdag før `nu` som 'YYYY-MM-DD' (mandag → fredag). Helligdage tages ikke i betragtning. */
export function forrigeHverdag(nu = new Date()): string {
  const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return isoDato(d);
}
