import { useEffect, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Læser en CSS-variabel fra roden (farver følger tema og tv-tilstand). */
export function cssVar(navn: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(navn).trim();
}

/** Rodens skriftstørrelse i px (tv-tilstand skalerer efter skærmhøjde). */
export function remPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Opretter grafen én gang og opdaterer den derefter uden animation,
 * så auto-opdatering ikke giver flimmer.
 */
export function useChart(byg: () => ChartConfiguration<'bar'>, deps: unknown[]) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cfg = byg();
    let chart = chartRef.current;
    // Canvas kan være genmonteret (fx efter en tom tilstand) — start forfra.
    if (chart && chart.canvas !== canvasRef.current) {
      chart.destroy();
      chart = chartRef.current = null;
    }
    if (!chart) {
      chartRef.current = new Chart(canvasRef.current, cfg);
      return;
    }
    chart.data = cfg.data;
    chart.options = cfg.options ?? {};
    chart.update('none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(
    () => () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    },
    [],
  );

  return canvasRef;
}
