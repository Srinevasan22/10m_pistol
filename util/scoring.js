import { PISTOL_10M_CONFIG } from "./scoringConfig.js";

export const DECIMAL_SCORING_MODE = "decimal";
const DECIMAL_PRECISION = 10;
export const MAX_DECIMAL_SCORE = 10.9;

const clamp = (value, min, max) => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

export const roundToSingleDecimal = (value) =>
  Math.round(value * DECIMAL_PRECISION) / DECIMAL_PRECISION;

export const normalizeScoringMode = (mode) =>
  mode === DECIMAL_SCORING_MODE ? DECIMAL_SCORING_MODE : "classic";

export const computeShotScore = ({
  x = 0,
  y = 0,
  config = PISTOL_10M_CONFIG,
  mode = DECIMAL_SCORING_MODE,
} = {}) => {
  const safeX = typeof x === "number" ? x : Number(x) || 0;
  const safeY = typeof y === "number" ? y : Number(y) || 0;
  const scoringMode = normalizeScoringMode(mode);

  const rings = Array.isArray(config?.rings) ? config.rings : [];
  const outerRadius =
    typeof config?.outerRadius === "number" && config.outerRadius > 0
      ? config.outerRadius
      : 1;

  // Coordinates coming from the scanner are normalized to [-1, 1] where 1
  // represents the outer scoring ring. Manual inputs may already be in
  // millimetres, so we only scale very small values that clearly fall inside
  // the normalized range.
  const maxAbsCoordinate = Math.max(Math.abs(safeX), Math.abs(safeY));
  const shouldTreatAsNormalized = maxAbsCoordinate <= 1.5;

  const scaledX = shouldTreatAsNormalized ? safeX * outerRadius : safeX;
  const scaledY = shouldTreatAsNormalized ? safeY * outerRadius : safeY;

  const distance = Math.sqrt(scaledX * scaledX + scaledY * scaledY);

  const matchedRing = rings.find((ring) => {
    if (!ring || typeof ring.outerRadius !== "number") {
      return false;
    }

    return distance <= ring.outerRadius;
  });

  if (!matchedRing) {
    return {
      ringScore: 0,
      decimalScore: scoringMode === DECIMAL_SCORING_MODE ? 0 : 0,
      isInnerTen: false,
    };
  }

  const ringScore = matchedRing.ring ?? 0;
  let decimalScore = ringScore;

  if (scoringMode === DECIMAL_SCORING_MODE) {
    const innerRadius =
      typeof matchedRing.innerRadius === "number"
        ? matchedRing.innerRadius
        : 0;
    const ringSpan = matchedRing.outerRadius - innerRadius;
    const ratio =
      ringSpan > 0 ? (matchedRing.outerRadius - distance) / ringSpan : 1;
    const normalizedRatio = clamp(ratio, 0, 1);
    const decimalValue = matchedRing.ring + normalizedRatio * 0.9;
    decimalScore = roundToSingleDecimal(
      clamp(decimalValue, matchedRing.ring, MAX_DECIMAL_SCORE),
    );
  }

  if (scoringMode === "classic") {
    decimalScore = ringScore;
  }

  const innerTenRadius =
    typeof config?.innerTenRadius === "number" ? config.innerTenRadius : 0;

  const isInnerTen =
    ringScore === 10 && distance <= innerTenRadius ? true : false;

  return {
    ringScore,
    decimalScore,
    isInnerTen,
  };
};
