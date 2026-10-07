// Parsing and scoring of the raw OCR text into {setCode, collectorNumber,
// language}. Collector numbers are kept as strings (not parseInt'd) so
// letter suffixes ("150a") and the promo star ("4★") survive intact.

export function cleanOCRText(rawText) {
  if (!rawText) return '';

  let cleaned = rawText.trim().replace(/\s+/g, ' ');

  cleaned = cleaned.replace(/^([CUMNR])\1+/i, '$1');
  cleaned = cleaned.replace(/([CUMNR])\1+/gi, '$1');

  cleaned = cleaned.replace(/(\d)\1{3,}/g, '$1');

  cleaned = cleaned.replace(/[|\\]/g, '1');
  cleaned = cleaned.replace(/[O]/g, '0');
  cleaned = cleaned.replace(/[Il]/g, '1');
  cleaned = cleaned.replace(/[S]/g, '5');

  cleaned = cleaned.replace(/[^0-9A-Za-z\s/*]/g, '');

  cleaned = cleaned.trim().replace(/\s+/g, ' ');

  return cleaned.toUpperCase();
}

export function scoreCollectorNumberResult(text, collectionRegex) {
  if (!text) return 0;

  let score = 0;

  const setMatch = findSetCode(text.toUpperCase(), collectionRegex);
  const hasRarityCode = /\s[CURMBLST]\s/.test(text);
  const hasCardNumber = /\b\d{1,5}\b/.test(text);
  const hasLanguageCode = /\b(EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.test(text);

  // A bare substring hit (e.g. a set code hiding inside "WIZARDS OF THE
  // COAST") is weak evidence; a whole token in the printed position is not.
  if (setMatch) score += SET_MATCH_SCORES[setMatch.source];
  if (hasRarityCode) score += 15;
  if (hasCardNumber) score += 30;
  if (hasLanguageCode) score += 10;
  if (text.length > 10) score += 5;

  return score;
}

const LANGUAGE_CODES = new Set(['EN', 'DE', 'FR', 'ES', 'IT', 'PT', 'JP', 'KO', 'RU', 'ZH']);

// Characters Tesseract commonly swaps in the small bold collector-line font
// (e.g. "BLB" read as "BLE"). Only used to repair the single token that sits
// right before the language code - the set code's fixed position on the
// card - never to fuzzy-match arbitrary text.
const OCR_CONFUSIONS = {
  B: ['E', '8', 'G'],
  E: ['B', 'F'],
  F: ['E'],
  G: ['B', '6'],
  8: ['B'],
  6: ['G'],
  O: ['0', 'D'],
  Q: ['O'],
  D: ['O', '0'],
  0: ['O', 'D'],
  I: ['1', 'L'],
  L: ['1', 'I'],
  1: ['I', 'L'],
  S: ['5'],
  5: ['S'],
  Z: ['2'],
  2: ['Z'],
};

const SET_MATCH_SCORES = { layout: 50, repaired: 45, token: 40, substring: 20 };

const anchoredRegexCache = new WeakMap();

// The app builds collectionRegex as an unanchored alternation of every
// Scryfall set code, which happily matches inside artist names ("CASTANON"
// contains "STA"). Whole tokens are tested against an anchored copy instead.
function isSetCode(token, collectionRegex) {
  let anchored = anchoredRegexCache.get(collectionRegex);
  if (!anchored) {
    anchored = new RegExp(`^(?:${collectionRegex.source})$`);
    anchoredRegexCache.set(collectionRegex, anchored);
  }
  return anchored.test(token);
}

function confusionVariants(token, maxSubstitutions = 2) {
  let variants = [token];
  const seen = new Set(variants);
  for (let round = 0; round < maxSubstitutions; round++) {
    const next = [];
    for (const variant of variants) {
      for (let i = 0; i < variant.length; i++) {
        for (const replacement of OCR_CONFUSIONS[variant[i]] || []) {
          const candidate = variant.slice(0, i) + replacement + variant.slice(i + 1);
          if (!seen.has(candidate)) {
            seen.add(candidate);
            next.push(candidate);
          }
        }
      }
    }
    variants = next;
  }
  return [...seen].slice(1);
}

// Finds the set code in the OCR text, in decreasing order of trust:
// 1. a token that is exactly a set code and sits right before the language
//    code ("BLB • DE" - the printed layout),
// 2. that same position repaired via OCR_CONFUSIONS ("BLE" -> "BLB"),
// 3. any token that is exactly a set code,
// 4. the legacy unanchored substring match, for OCR text where the set code
//    got glued to a neighbour ("1FDN").
function findSetCode(text, collectionRegex) {
  if (!collectionRegex) return null;

  const tokens = [...text.matchAll(/[A-Z0-9]+/g)].map(m => ({ value: m[0], index: m.index }));
  const beforeLanguage = tokens.filter((token, i) => i + 1 < tokens.length && LANGUAGE_CODES.has(tokens[i + 1].value));

  for (const token of beforeLanguage) {
    if (isSetCode(token.value, collectionRegex)) return { code: token.value, index: token.index, length: token.value.length, source: 'layout' };
  }
  for (const token of beforeLanguage) {
    if (token.value.length < 3 || /^\d+$/.test(token.value)) continue;
    const repaired = confusionVariants(token.value).find(variant => isSetCode(variant, collectionRegex));
    if (repaired) return { code: repaired, index: token.index, length: token.value.length, source: 'repaired' };
  }
  for (const token of tokens) {
    if (!LANGUAGE_CODES.has(token.value) && isSetCode(token.value, collectionRegex)) {
      return { code: token.value, index: token.index, length: token.value.length, source: 'token' };
    }
  }

  const substringMatch = collectionRegex.exec(text);
  if (substringMatch) {
    return { code: substringMatch.groups.collection, index: substringMatch.index, length: substringMatch[0].length, source: 'substring' };
  }
  return null;
}

// Longest digit run wins: OCR noise (stray single digits from mana costs,
// borders, etc.) tends to be short, while the actual collector number is
// usually the longest run present. Only when a single short run exists at
// all does a genuine 1-2 digit collector number get picked. The promo star
// has to follow the digits on the same line, so the "•" separator (often
// read as "*") in "BLB • DE" can't turn "0064" into "0064★".
function findCollectorNumber(text) {
  const numberPattern = /(?<number>\d{1,5})(?<suffix>[A-Z])?(?:[ \t]*(?<star>[★*]))?/g;
  let best = null;
  let match;
  while ((match = numberPattern.exec(text)) !== null) {
    if (!best || match.groups.number.length > best.groups.number.length) {
      best = match;
    }
  }
  if (!best) return null;

  const { number, suffix, star } = best.groups;
  // Scryfall's collector numbers have no leading zeros ("0064" on the card
  // is "64" in the API, /cards/blb/0064 is a 404).
  const normalized = number.replace(/^0+(?=\d)/, '');
  return normalized + (suffix ? suffix.toLowerCase() : '') + (star ? '★' : '');
}

// Parses OCR'd collector-number text like "C 0125\nFDN • DE" or "150A MKM EN"
// into { setCode, collectorNumber, language }. collectorNumber accepts
// 1-5 digits plus an optional letter suffix ("150a") or promo star ("4★"),
// matched only immediately after the digits (not after a space) so it
// doesn't swallow unrelated trailing letters/codes.
export function parseCollectorNumber(collectorInfo, collectionRegex) {
  const cleaned = collectorInfo.trim().toUpperCase();

  const cardInfo = {
    collectorNumber: null,
    setCode: null,
    language: null,
  };

  const setMatch = findSetCode(cleaned, collectionRegex);
  let numberSearchTexts = [cleaned];
  if (setMatch) {
    cardInfo.setCode = setMatch.code;
    // The collector number is printed before the set code (same line on
    // older cards, the line above on newer ones), so look there first and
    // only fall back to the text after it. The set code itself is replaced
    // by a separator so its characters can't become part of the number.
    const before = cleaned.slice(0, setMatch.index);
    const after = cleaned.slice(setMatch.index + setMatch.length);
    numberSearchTexts = [before, `${before}|${after}`];
  }

  for (const text of numberSearchTexts) {
    cardInfo.collectorNumber = findCollectorNumber(text);
    if (cardInfo.collectorNumber) break;
  }

  const languageMatch = /\b(?<lang>EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.exec(cleaned);
  if (languageMatch) {
    cardInfo.language = languageMatch.groups.lang;
  }

  if (cardInfo.collectorNumber && cardInfo.setCode) {
    return cardInfo;
  }

  return null;
}

export function mapLanguageCode(ocrLanguageCode) {
  const languageMap = {
    EN: 'en',
    DE: 'de',
    FR: 'fr',
    ES: 'es',
    IT: 'it',
    PT: 'pt',
    JP: 'ja',
    KO: 'ko',
    RU: 'ru',
    ZH: 'zhs',
  };
  return languageMap[ocrLanguageCode] || 'en';
}

export function getLanguageDisplayName(languageCode) {
  const displayNames = {
    EN: 'English',
    DE: 'German',
    FR: 'French',
    ES: 'Spanish',
    IT: 'Italian',
    PT: 'Portuguese',
    JP: 'Japanese',
    KO: 'Korean',
    RU: 'Russian',
    ZH: 'Chinese',
  };
  return displayNames[languageCode] || 'English';
}
