const TARGET_NUMBER_KEYS = [
  "targetNumber",
  "target_number",
  "targetNo",
  "target_no",
  "number",
];

const TARGET_INDEX_KEYS = ["targetIndex", "target_index", "index"];

const TARGET_IDENTIFIER_KEYS = ["_id", "id", "targetId", "target_id"];

const parseInteger = (value) => {
  if (value === undefined || value === null) {
    return Number.NaN;
  }

  if (typeof value === "boolean") {
    return Number.NaN;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return Number.NaN;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : Number.NaN;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value : Number.NaN;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : Number.NaN;
  }

  return Number.NaN;
};

export const resolveTargetNumber = (input) => {
  if (input === undefined || input === null) {
    return { number: null, provided: false };
  }

  if (typeof input === "number" || typeof input === "string" || typeof input === "bigint") {
    const parsed = parseInteger(input);
    return { number: parsed, provided: true };
  }

  if (typeof input === "boolean") {
    return { number: Number.NaN, provided: true };
  }

  if (typeof input === "object") {
    for (const key of TARGET_NUMBER_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const parsed = parseInteger(input[key]);
        return { number: parsed, provided: true };
      }
    }

    for (const key of TARGET_INDEX_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const parsed = parseInteger(input[key]);
        if (Number.isNaN(parsed)) {
          return { number: Number.NaN, provided: true };
        }

        return { number: parsed + 1, provided: true };
      }
    }

    return { number: null, provided: false };
  }

  return { number: Number.NaN, provided: false };
};

export { TARGET_NUMBER_KEYS, TARGET_INDEX_KEYS, TARGET_IDENTIFIER_KEYS };
