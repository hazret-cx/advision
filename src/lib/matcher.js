/**
 * AdVision — Size Matching Engine
 *
 * Matches detected ad slots against uploaded creative assets by dimension.
 * Returns a match report with paired slots/creatives and unmatched items.
 */

/**
 * Match detected slots against available creatives.
 *
 * @param {Array} slots - Detected ad slots [{width, height, selector, ...}]
 * @param {Array} creatives - Available creatives [{id, width, height, filename, ...}]
 * @returns {Object} Match report
 */
function matchSlots(slots, creatives) {
  // Index creatives by size for O(1) lookup
  const creativeBySizeMap = new Map();
  for (const creative of creatives) {
    const key = `${creative.width}x${creative.height}`;
    if (!creativeBySizeMap.has(key)) {
      creativeBySizeMap.set(key, []);
    }
    creativeBySizeMap.get(key).push(creative);
  }

  const matched = [];
  const unmatchedSlots = [];
  const usedCreativeIds = new Set();

  for (const slot of slots) {
    const sizeKey = `${slot.width}x${slot.height}`;
    const candidates = creativeBySizeMap.get(sizeKey);

    if (candidates && candidates.length > 0) {
      // Pick the first unused creative of this size, or reuse if all used
      let creative = candidates.find(c => !usedCreativeIds.has(c.id));
      if (!creative) {
        creative = candidates[0]; // reuse if all already used
      }

      usedCreativeIds.add(creative.id);
      matched.push({
        slot,
        creative,
        sizeKey,
      });
    } else {
      unmatchedSlots.push({
        slot,
        sizeKey,
      });
    }
  }

  // Find creatives that weren't matched to any slot
  const matchedSizes = new Set(matched.map(m => m.sizeKey));
  const unusedCreatives = creatives.filter(c => {
    const key = `${c.width}x${c.height}`;
    return !matchedSizes.has(key);
  });

  // Deduplicate unused by size
  const unusedBySize = [];
  const seenSizes = new Set();
  for (const c of unusedCreatives) {
    const key = `${c.width}x${c.height}`;
    if (!seenSizes.has(key)) {
      seenSizes.add(key);
      unusedBySize.push({ sizeKey: key, creative: c });
    }
  }

  return {
    totalSlotsDetected: slots.length,
    totalMatched: matched.length,
    totalUnmatchedSlots: unmatchedSlots.length,
    totalUnusedCreatives: unusedBySize.length,
    matched,
    unmatchedSlots,
    unusedCreatives: unusedBySize,
    summary: buildSummary(slots, matched, unmatchedSlots, unusedBySize),
  };
}

function buildSummary(slots, matched, unmatchedSlots, unusedCreatives) {
  const lines = [];
  lines.push(`Detected ${slots.length} ad slot(s) on the page.`);
  lines.push(`Matched ${matched.length} slot(s) with available creatives.`);

  if (unmatchedSlots.length > 0) {
    const sizes = [...new Set(unmatchedSlots.map(u => u.sizeKey))];
    lines.push(`${unmatchedSlots.length} slot(s) unmatched — missing sizes: ${sizes.join(', ')}.`);
  }

  if (unusedCreatives.length > 0) {
    const sizes = unusedCreatives.map(u => u.sizeKey);
    lines.push(`${unusedCreatives.length} creative size(s) not found on page: ${sizes.join(', ')}.`);
  }

  return lines.join('\n');
}

module.exports = { matchSlots };
