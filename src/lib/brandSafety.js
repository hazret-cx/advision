/**
 * AdVision — Brand Safety Engine
 *
 * Evaluates publisher page content against brand-specific safety rules.
 * Aligned with GARM Brand Safety Floor & Suitability Framework v2.0.
 *
 * Check order:
 *  1. Universal Floor  (hard block, all brands)
 *  2. Brand BLOCK categories  (hard block, threshold: 3+ keyword matches)
 *  3. Brand WARN categories   (soft flag, threshold: 2+ keyword matches)
 *  4. Custom keywords         (soft flag, threshold: 1+ match)
 */

// ─── Universal Floor ─────────────────────────────────────────────────────────
// Hard block for every brand, no exceptions.

const UNIVERSAL_FLOOR = {
  csae: [
    'child exploitation', 'child abuse', 'csam', 'minor abuse', 'child pornography',
    'underage sexual', 'grooming', 'paedophilia', 'pedophilia',
  ],
  terrorism: [
    'isis', 'isil', 'al-qaeda', 'al qaeda', 'taliban recruit', 'jihadi', 'jihadist',
    'extremist manifesto', 'radicalisation', 'radicalization', 'white supremacist',
    'neo-nazi', 'domestic terrorism', 'mass shooting plan', 'attack planning',
  ],
  hate_speech: [
    'racial slur', 'hate crime', 'ethnic cleansing', 'genocide propaganda',
    'white power', 'antisemitic', 'islamophobic hate',
    'homophobic slur', 'transphobic attack', 'religious persecution',
  ],
  graphic_violence: [
    'snuff film', 'torture video', 'decapitation video', 'dismemberment',
    'graphic execution', 'beheading video', 'murder footage', 'death video',
    'live killing', 'massacre footage',
  ],
  illegal_activity: [
    'how to make explosives', 'drug synthesis guide', 'weapon modification',
    'human trafficking', 'smuggling route', 'dark web marketplace',
    'credit card fraud tutorial', 'hacking tutorial', 'ransomware download',
  ],
  adult_explicit: [
    'pornography site', 'explicit sex', 'sex tape', 'escort service explicit',
    'adult entertainment site', 'brothel',
  ],
};

// ─── Configurable Sensitive Categories ───────────────────────────────────────
// Applied per brand profile at BLOCK or WARN severity.

const CATEGORIES = {
  death_tragedy: [
    'died', 'death', 'fatality', 'fatalities', 'killed', 'obituary', 'funeral',
    'mourning', 'bereavement', 'grief', 'tragedy', 'tragic', 'suicide', 'suicidal',
    'self-harm', 'fatal', 'casualty', 'casualties', 'massacre', 'mass casualty',
    'death toll', 'body count', 'homicide', 'manslaughter', 'wrongful death',
    'memorial', 'vigil', 'died suddenly',
  ],
  armed_conflict: [
    'warfare', 'combat zone', 'airstrike', 'air strike', 'bombing raid', 'shelling',
    'troops killed', 'soldiers dead', 'military casualties', 'frontline',
    'ground offensive', 'invasion', 'ceasefire violation', 'civilian casualties',
    'war crime', 'conflict zone', 'siege', 'missile strike', 'drone strike',
  ],
  crime: [
    'murdered', 'killer', 'convicted', 'arrested', 'indicted', 'prison sentence',
    'robbery', 'assault', 'rape', 'sexual assault', 'domestic violence', 'stalking',
    'crime scene', 'felony', 'drug trafficking', 'gang violence', 'cartel',
    'organised crime', 'fraud conviction', 'money laundering', 'embezzlement',
  ],
  misinformation: [
    'conspiracy theory', 'fake news', 'hoax', 'debunked claim', 'misinformation',
    'anti-vax', 'antivax', 'vaccine causes', 'chemtrails', 'deep state plot',
    'plandemic', 'crisis actor', 'false flag',
  ],
  sensitive_social: [
    'abortion debate', 'pro-life rally', 'pro-choice rally', 'gun control debate',
    'gun rights protest', 'immigration ban', 'mass deportation',
    'police brutality', 'defund police', 'partisan attack',
  ],
  gambling: [
    'casino', 'sports betting', 'online poker', 'slot machine',
    'wager', 'jackpot win', 'horse racing bet',
    'fixed odds', 'spread betting', 'matched betting', 'crypto gambling',
  ],
  drugs_narcotics: [
    'cocaine', 'heroin', 'methamphetamine', 'meth', 'fentanyl', 'opioid abuse',
    'recreational drugs', 'drug dealer', 'psychedelics', 'ecstasy mdma',
    'crack cocaine', 'drug overdose', 'addiction crisis',
  ],
  children_family: [
    'parenting guide', 'parents with children', 'toddler', 'infant', 'newborn',
    'nursery school', 'kindergarten', 'primary school', 'elementary school',
    'childcare', 'babysitter', 'child development', 'raising children',
    'family with children', 'child safety', 'child health', 'paediatric',
    'pediatric', 'teenager', 'adolescent', 'youth', 'underage', 'school age',
    'pregnancy advice', 'maternity', 'breastfeeding',
  ],
  anti_tobacco: [
    'quit smoking', 'stop smoking', 'smoking kills', 'smoking ban',
    'tobacco deaths', 'cigarette dangers', 'nicotine addiction',
    'lung cancer smoking', 'passive smoking', 'secondhand smoke',
    'vaping dangers', 'e-cigarette health risk', 'tobacco control',
    'anti-tobacco', 'smoking cessation',
  ],
  drink_driving: [
    'drunk driving', 'drink driving', 'dui conviction', 'dwi arrest',
    'underage drinking', 'alcohol poisoning', 'binge drinking death',
    'alcohol abuse', 'alcoholism recovery', 'alcoholics anonymous', 'drink spiking',
  ],
  problem_gambling: [
    'problem gambling', 'gambling addiction', 'gambling harm',
    'gamble aware', 'gambling debt', 'gambling ruins life',
    'betting addiction', 'compulsive gambling', 'underage gambling',
  ],
  financial_fraud: [
    'bank scam', 'investment fraud', 'ponzi scheme', 'financial scam',
    'pension fraud', 'crypto scam', 'phishing bank', 'identity theft finance',
    'payday loan trap', 'debt spiral',
  ],
  health_misinformation: [
    'vaccine misinformation', 'fake cure', 'miracle cure unproven',
    'alternative medicine replaces', 'drug recall death', 'medication kills',
    'prescription fraud', 'pill mill', 'opioid overprescribed',
    'pharma corruption', 'medical negligence claim',
  ],
  mental_health: [
    'mental health crisis', 'depression breakdown', 'anxiety disorder',
    'bipolar episode', 'schizophrenia', 'psychosis', 'eating disorder',
    'anorexia', 'bulimia', 'ptsd', 'self harm', 'suicidal thoughts',
  ],
};

// ─── Brand Profiles ───────────────────────────────────────────────────────────

const BRAND_PROFILES = {
  pmi_tobacco: {
    label: 'PMI / Tobacco',
    blockCategories: ['death_tragedy', 'children_family', 'anti_tobacco', 'health_misinformation'],
    warnCategories: ['armed_conflict', 'crime', 'drugs_narcotics', 'mental_health'],
  },
  alcohol: {
    label: 'Alcohol',
    blockCategories: ['children_family', 'drink_driving'],
    warnCategories: ['death_tragedy', 'crime', 'mental_health'],
  },
  gambling: {
    label: 'Gambling / Betting',
    blockCategories: ['children_family', 'problem_gambling'],
    warnCategories: ['crime', 'financial_fraud'],
  },
  financial_services: {
    label: 'Financial Services',
    blockCategories: ['financial_fraud', 'misinformation'],
    warnCategories: ['crime', 'sensitive_social'],
  },
  healthcare_pharma: {
    label: 'Healthcare / Pharma',
    blockCategories: ['health_misinformation', 'drugs_narcotics'],
    warnCategories: ['death_tragedy', 'mental_health'],
  },
  childrens_products: {
    label: "Children's Products / Education",
    blockCategories: [
      'death_tragedy', 'armed_conflict', 'crime', 'misinformation',
      'sensitive_social', 'gambling', 'drugs_narcotics', 'children_family',
      'drink_driving', 'problem_gambling', 'financial_fraud',
      'health_misinformation', 'mental_health', 'anti_tobacco',
    ],
    warnCategories: [],
  },
  luxury: {
    label: 'Luxury / Premium',
    blockCategories: ['financial_fraud'],
    warnCategories: ['crime', 'sensitive_social'],
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a rules object from a named brand profile.
 *
 * @param {string} profileName - Key from BRAND_PROFILES
 * @param {string[]} customKeywords - Additional keywords to flag (warn)
 * @param {'warn'|'block'} action - What to do when a block-category violation fires
 * @returns {Object|null}
 */
function getProfileRules(profileName, customKeywords = [], action = 'warn') {
  const profile = BRAND_PROFILES[profileName];
  if (!profile) return null;

  return {
    enabled: true,
    profile: profileName,
    blockCategories: profile.blockCategories,
    warnCategories: profile.warnCategories,
    customKeywords,
    action,
  };
}

/**
 * Check publisher page text against brand safety rules.
 *
 * @param {string} pageText - Text extracted from the publisher page
 * @param {Object} rules - Rules object (from getProfileRules or manual config)
 * @returns {{ safe: boolean, action: 'safe'|'warn'|'block', violations: Array, summary: string }}
 */
function checkPageSafety(pageText, rules) {
  if (!rules?.enabled) {
    return { safe: true, action: 'safe', violations: [], summary: 'Brand safety not configured.' };
  }

  const text = pageText.toLowerCase();
  const violations = [];

  // 1. Universal Floor — always checked, always triggers block
  for (const [categoryKey, keywords] of Object.entries(UNIVERSAL_FLOOR)) {
    const matches = findMatches(text, keywords);
    if (matches.length > 0) {
      violations.push({
        category: categoryKey,
        severity: 'block',
        source: 'universal_floor',
        matchedKeywords: matches,
        matchCount: matches.length,
      });
    }
  }

  // 2. Brand BLOCK categories — threshold: 3+ matches to avoid incidental mentions
  for (const categoryKey of (rules.blockCategories || [])) {
    const keywords = CATEGORIES[categoryKey] || [];
    const matches = findMatches(text, keywords);
    if (matches.length >= 3) {
      violations.push({
        category: categoryKey,
        severity: 'block',
        source: 'brand_profile',
        matchedKeywords: matches,
        matchCount: matches.length,
      });
    }
  }

  // 3. Brand WARN categories — threshold: 2+ matches
  for (const categoryKey of (rules.warnCategories || [])) {
    const keywords = CATEGORIES[categoryKey] || [];
    const matches = findMatches(text, keywords);
    if (matches.length >= 2) {
      violations.push({
        category: categoryKey,
        severity: 'warn',
        source: 'brand_profile',
        matchedKeywords: matches,
        matchCount: matches.length,
      });
    }
  }

  // 4. Custom keywords — any single match triggers warn
  if (rules.customKeywords?.length > 0) {
    const customMatches = findMatches(text, rules.customKeywords);
    if (customMatches.length > 0) {
      violations.push({
        category: 'custom',
        severity: 'warn',
        source: 'custom',
        matchedKeywords: customMatches,
        matchCount: customMatches.length,
      });
    }
  }

  const hasFloorViolation = violations.some(v => v.source === 'universal_floor');
  const hasBrandBlockViolation = violations.some(v => v.severity === 'block' && v.source !== 'universal_floor');
  const hasWarnViolation = violations.some(v => v.severity === 'warn');

  let action = 'safe';
  if (hasFloorViolation) {
    // Universal Floor always hard-blocks — no override
    action = 'block';
  } else if (hasBrandBlockViolation) {
    // Brand profile block respects the campaign's configured action
    action = rules.action === 'block' ? 'block' : 'warn';
  } else if (hasWarnViolation) {
    action = 'warn';
  }

  return {
    safe: violations.length === 0,
    action,
    violations,
    summary: buildSummary(violations, action),
  };
}

/**
 * Find keyword matches using whole-word matching where possible.
 * Multi-word phrases fall back to substring matching.
 */
function findMatches(text, keywords) {
  const matched = [];
  for (const kw of keywords) {
    try {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use word boundaries for single words; substring for phrases
      const pattern = kw.includes(' ')
        ? escaped
        : `\\b${escaped}\\b`;
      if (new RegExp(pattern, 'i').test(text)) {
        matched.push(kw);
      }
    } catch {
      if (text.includes(kw.toLowerCase())) matched.push(kw);
    }
  }
  return matched;
}

function buildSummary(violations, action) {
  if (violations.length === 0) return 'No brand safety violations detected.';

  const blocks = violations.filter(v => v.severity === 'block');
  const warns = violations.filter(v => v.severity === 'warn');
  const parts = [];

  if (blocks.length > 0) {
    parts.push(`Block-level content: ${blocks.map(v => formatCategory(v.category)).join(', ')}.`);
  }
  if (warns.length > 0) {
    parts.push(`Flagged content: ${warns.map(v => formatCategory(v.category)).join(', ')}.`);
  }

  parts.push(action === 'block' ? 'Mockup blocked.' : 'Mockup generated with caution flag.');
  return parts.join(' ');
}

function formatCategory(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = {
  checkPageSafety,
  getProfileRules,
  BRAND_PROFILES,
  CATEGORIES,
  UNIVERSAL_FLOOR,
};
