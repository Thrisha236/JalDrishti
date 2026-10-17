// Interpretable pipeline risk score, shared by the seed validator and the frontend.
// Rules come from seed.risk_config; the result ranks inspection priority and is not a failure probability.

const PLASTICS = new Set(['pvc', 'hdpe']);

export function fullYearsBetween(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  const beforeAnniversary =
    b.getUTCMonth() < a.getUTCMonth() ||
    (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return years;
}

export function monthsBetween(fromIso, toIso) {
  return (new Date(toIso) - new Date(fromIso)) / (1000 * 60 * 60 * 24 * 30.4375);
}

function pointsFromBands(value, bands, minKey, maxKey) {
  const last = bands[bands.length - 1];
  for (const b of bands) {
    const isLast = b === last;
    if (value >= b[minKey] && (value < b[maxKey] || (isLast && value <= b[maxKey]))) return b.points;
  }
  return 0;
}

export function scorePipeline(seed, assetId, asOf = seed.meta.as_of) {
  const cfg = seed.risk_config.factors;
  const profile = seed.pipeline_profiles.find((p) => p.asset_id === assetId);
  if (!profile) return null;
  const factors = {};
  const details = {};
  const missing = [];

  // Age
  const age = fullYearsBetween(profile.install_date, asOf);
  let agePts = Math.min(1, Math.max(0, (age - cfg.age.start_years) / (cfg.age.full_years - cfg.age.start_years))) * cfg.age.max;
  if (profile.install_date_source === 'estimate') agePts *= cfg.age.estimate_multiplier;
  factors.age = Math.round(agePts);
  details.age = `${age} years (${profile.install_date_source})`;

  // Prior failures within the window
  const windowMonths = cfg.prior_failures.window_months;
  const recent = seed.repairs.filter((r) => {
    const m = monthsBetween(r.date, asOf);
    return r.asset_id === assetId && m <= windowMonths; // repairs after the assessment date also count
  });
  factors.prior_failures = cfg.prior_failures.points_by_count[recent.length >= 4 ? '4+' : String(recent.length)];
  details.prior_failures = `${recent.length} in ${windowMonths} months`;

  // Corrosion observation
  if (PLASTICS.has(profile.material)) {
    factors.corrosion_observation = 0;
    details.corrosion_observation = 'not applicable (plastic pipe)';
  } else {
    const latest = seed.inspections
      .filter((i) => i.asset_id === assetId && i.corrosion_grade != null)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) {
      factors.corrosion_observation = 0;
      details.corrosion_observation = 'no inspection on record';
      missing.push('corrosion inspection');
    } else {
      let pts = pointsFromBands(latest.corrosion_grade, cfg.corrosion_observation.bands, 'min', 'max');
      const stale = monthsBetween(latest.date, asOf) > cfg.corrosion_observation.stale_after_months;
      if (stale) pts *= cfg.corrosion_observation.stale_multiplier;
      factors.corrosion_observation = Math.round(pts);
      details.corrosion_observation = `${latest.corrosion_grade}/100, ${latest.method}, ${latest.date}${stale ? ' (stale)' : ''}`;
    }
  }

  // Pressure-per-flow trend
  if (profile.pressure_per_flow_drop_pct == null) {
    factors.pressure_per_flow_trend = 0;
    details.pressure_per_flow_trend = 'no sensor on this segment';
    missing.push('pressure/flow sensor');
  } else {
    factors.pressure_per_flow_trend = pointsFromBands(
      profile.pressure_per_flow_drop_pct, cfg.pressure_per_flow_trend.bands, 'min_drop_pct', 'max_drop_pct',
    );
    details.pressure_per_flow_trend = `${profile.pressure_per_flow_drop_pct}% below baseline (${profile.trend_source})`;
  }

  // Material
  const table = cfg.material_susceptibility.points_by_material;
  factors.material_susceptibility = table[profile.material] ?? table.unknown;
  details.material_susceptibility = `${profile.material.replace('_', ' ')} (${profile.material_source})`;

  const score = Object.values(factors).reduce((a, b) => a + b, 0);
  const bandInfo = seed.risk_config.bands.find((b) => score >= b.min && score <= b.max);
  const max = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v.max]));
  return { assetId, score, band: bandInfo.band, label: bandInfo.label, factors, max, details, missing };
}
