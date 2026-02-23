/**
 * AdVision — Size Matching Engine
 *
 * Matches detected ad slots against uploaded creative assets by dimension.
 * Uses a 3-tier strategy: exact → aspect-ratio → fit-within.
 * Returns a match report with paired slots/creatives and unmatched items.
 */

const MATCH_TIER = {
  EXACT: 'exact',
  ASPECT_RATIO: 'aspect-ratio',
  FIT_WITHIN: 'fit-within',
};

/**
 * Find the best creative for a given slot using 3-tier matching.
 *
 * @param {Object} slot - {width, height, ...}
 * @param {Array} creatives - Available creatives
 * @param {Set} usedCreativeIds - IDs already assigned to earlier slots
 * @returns {{ creative, matchTier } | null}
 */
function findBestCreative(slot, creatives, usedCreativeIds) {
  const slotArea = slot.width * slot.height;

  // ── Tier 1: Exact match ────────────────────────────────────────────
  const exactCandidates = creatives.filter(
    c => c.width === slot.width && c.height === slot.height
  );
  if (exactCandidates.length > 0) {
    const unused = exactCandidates.find(c => !usedCreativeIds.has(c.id));
    return { creative: unused || exactCandidates[0], matchTier: MATCH_TIER.EXACT };
  }

  // ── Tier 2: Same aspect ratio (≤5% tolerance), creative fits within slot ──
  const slotRatio = slot.width / slot.height;
  const aspectCandidates = creatives.filter(c => {
    if (c.width > slot.width || c.height > slot.height) return false; // no upscaling
    const creativeRatio = c.width / c.height;
    const diff = Math.abs(creativeRatio - slotRatio) / slotRatio;
    return diff <= 0.05;
  });

  if (aspectCandidates.length > 0) {
    // Sort by largest area first; prefer unused
    aspectCandidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const unused = aspectCandidates.find(c => !usedCreativeIds.has(c.id));
    return { creative: unused || aspectCandidates[0], matchTier: MATCH_TIER.ASPECT_RATIO };
  }

  // ── Tier 3: Creative fits within slot, area ≥ 50% of slot area ────
  const fitCandidates = creatives.filter(c => {
    if (c.width > slot.width || c.height > slot.height) return false;
    const creativeArea = c.width * c.height;
    return creativeArea >= slotArea * 0.5;
  });

  if (fitCandidates.length > 0) {
    fitCandidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const unused = fitCandidates.find(c => !usedCreativeIds.has(c.id));
    return { creative: unused || fitCandidates[0], matchTier: MATCH_TIER.FIT_WITHIN };
  }

  return null;
}

/**
 * Match detected slots against available creatives.
 *
 * @param {Array} slots - Detected ad slots [{width, height, selector, ...}]
 * @param {Array} creatives - Available creatives [{id, width, height, filename, ...}]
 * @returns {Object} Match report
 */
function matchSlots(slots, creatives) {
  const matched = [];
  const unmatchedSlots = [];
  const usedCreativeIds = new Set();

  for (const slot of slots) {
    const sizeKey = `${slot.width}x${slot.height}`;
    const result = findBestCreative(slot, creatives, usedCreativeIds);

    if (result) {
      usedCreativeIds.add(result.creative.id);
      matched.push({
        slot,
        creative: result.creative,
        matchTier: result.matchTier,
        sizeKey,
      });
    } else {
      unmatchedSlots.push({ slot, sizeKey });
    }
  }

  // Find creatives that weren't matched to any slot
  const usedInMatchedCreativeIds = new Set(matched.map(m => m.creative.id));
  const unusedCreatives = creatives.filter(c => !usedInMatchedCreativeIds.has(c.id));

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

  if (matched.length > 0) {
    const tierCounts = matched.reduce((acc, m) => {
      acc[m.matchTier] = (acc[m.matchTier] || 0) + 1;
      return acc;
    }, {});
    const tierSummary = Object.entries(tierCounts)
      .map(([tier, count]) => `${count} ${tier}`)
      .join(', ');
    lines.push(`Match tiers: ${tierSummary}.`);
  }

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

module.exports = { matchSlots, MATCH_TIER };
