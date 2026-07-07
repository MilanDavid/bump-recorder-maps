// Pure helpers (no I/O) for the community dashboard. Data is fetched by the
// page and passed in, so these are unit-testable.

// Inclusive month-string range [from, to]. Sums the additive monthly buckets.
export function sumWindow(monthly, from, to) {
  const acc = { km_added: 0, potholes_added: 0, new_contributors: 0, new_km2: 0 };
  for (const m of monthly) {
    if (m.month >= from && m.month <= to) {
      acc.km_added += m.km_added;
      acc.potholes_added += m.potholes_added;
      acc.new_contributors += m.new_contributors;
      acc.new_km2 += m.new_km2;
    }
  }
  return acc;
}

// Running total of one additive field, in month order.
export function cumulativeSeries(monthly, field) {
  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
  let run = 0;
  return sorted.map((m) => ({ month: m.month, y: (run += m[field]) }));
}

// SVG polyline path for a series of {y} points across [w,h] (auto-scaled).
export function sparkPath(points, w, h, pad = 6) {
  if (!points.length) return '';
  const max = Math.max(1, ...points.map((p) => p.y));
  const dx = points.length > 1 ? (w - 2 * pad) / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = pad + i * dx;
      const y = h - pad - (p.y / max) * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Thousands separators; keep one decimal for non-integers.
export function fmt(n) {
  return Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : String(Math.round(n * 10) / 10);
}

// The list of month strings (YYYY-MM-01) present, ascending — for the scrubber.
export function monthsOf(monthly) {
  return [...monthly].map((m) => m.month).sort();
}
