export const normalizeTargetMetadata = (payload = {}) => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const normalized = { ...payload };

  const aliasGroups = {
    targetIndex: ["targetIndex", "target_index"],
    targetNumber: [
      "targetNumber",
      "target_number",
      "targetNo",
      "target_no",
    ],
    targetShotIndex: ["targetShotIndex", "target_shot_index"],
    targetShotNumber: [
      "targetShotNumber",
      "target_shot_number",
      "targetShotNo",
      "target_shot_no",
    ],
  };

  for (const [canonical, aliases] of Object.entries(aliasGroups)) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(payload, alias)) {
        normalized[canonical] = payload[alias];
        if (alias !== canonical) {
          delete normalized[alias];
        }
        break;
      }
    }
  }

  return normalized;
};
