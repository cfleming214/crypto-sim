// Lightweight technical indicators shared between the candle chart and the
// trade screen stats grid.

export function computeMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    return values.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
  });
}

export function computeRSI(values: number[], period = 14): (number | null)[] {
  return values.map((_, i) => {
    if (i < period) return null;
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - values[j - 1];
      if (d > 0) gains += d;
      else losses -= d;
    }
    const rs = losses === 0 ? Infinity : gains / losses;
    return 100 - 100 / (1 + rs);
  });
}

// Convenience: latest non-null RSI value from a price series, or null if
// the series is too short.
export function latestRSI(values: number[], period = 14): number | null {
  const series = computeRSI(values, period);
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}
