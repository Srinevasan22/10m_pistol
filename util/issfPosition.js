// ISSF 10m Air Pistol target geometry in millimetres
// 10-ring diameter = 11.5mm, each lower ring +16mm diameter
const RING_DIAMETERS_MM = {
  10: 11.5,
  9: 27.5,
  8: 43.5,
  7: 59.5,
  6: 75.5,
  5: 91.5,
  4: 107.5,
  3: 123.5,
  2: 139.5,
  1: 155.5,
};

const OUTER_RADIUS_MM = RING_DIAMETERS_MM[1] / 2;

// Normalized outer radius (0..1) for each score ring
const NORMALIZED_RING_RADII = Object.fromEntries(
  Object.entries(RING_DIAMETERS_MM).map(([score, diameter]) => {
    const radiusMm = diameter / 2;
    return [Number(score), radiusMm / OUTER_RADIUS_MM];
  }),
);

/**
 * Return { min, max } for a given score using normalized radii (0 = center, 1 = edge of 1-ring).
 */
export const getRadiusRangeForScore = (rawScore) => {
  const score = Math.floor(typeof rawScore === "number" ? rawScore : Number(rawScore));

  if (!Number.isFinite(score)) {
    return { min: NORMALIZED_RING_RADII[1], max: 1.2 };
  }

  if (score <= 0) {
    return { min: NORMALIZED_RING_RADII[1], max: 1.2 };
  }

  const outer = NORMALIZED_RING_RADII[score];

  if (!outer) {
    return { min: NORMALIZED_RING_RADII[1], max: 1.2 };
  }

  if (score === 10) {
    return { min: 0, max: outer };
  }

  const innerScore = score + 1;
  const inner = NORMALIZED_RING_RADII[innerScore];

  return { min: inner, max: outer };
};

/**
 * Generate a random (x, y) on the target for a score.
 * - Center of target = (0, 0)
 * - Outer 1-ring radius = 1.0
 * - 10-ring covers all values from 10.0 to 10.9 (we don’t know the decimal)
 */
export const getRandomPositionForScore = (score) => {
  const { min, max } = getRadiusRangeForScore(score);

  const minSq = min * min;
  const maxSq = max * max;
  const r = Math.sqrt(minSq + Math.random() * (maxSq - minSq));

  const theta = Math.random() * 2 * Math.PI;

  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);

  return { x, y };
};

export const NORMALIZED_RING_RADII_MAP = NORMALIZED_RING_RADII;
