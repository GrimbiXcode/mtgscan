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

  const hasCollectionCode = collectionRegex ? collectionRegex.test(text) : false;
  const hasRarityCode = /\s[CURMBLST]\s/.test(text);
  const hasCardNumber = /\b\d{1,5}\b/.test(text);
  const hasLanguageCode = /\b(EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.test(text);

  if (hasCollectionCode) score += 50;
  if (hasRarityCode) score += 15;
  if (hasCardNumber) score += 30;
  if (hasLanguageCode) score += 10;
  if (text.length > 10) score += 5;

  return score;
}

// Parses OCR'd collector-number text like "FDN U 0125 DE" or "150A MKM EN"
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

  let numberSearchText = cleaned;
  const collectionMatch = collectionRegex ? collectionRegex.exec(cleaned) : null;
  if (collectionMatch) {
    cardInfo.setCode = collectionMatch.groups.collection;
    // Remove the matched set code before hunting for the collector number so
    // digits/letters belonging to the set code can never be mistaken for it.
    numberSearchText = cleaned.slice(0, collectionMatch.index) + cleaned.slice(collectionMatch.index + collectionMatch[0].length);
  }

  // Pick the longest digit run in the remaining text rather than the first
  // one: OCR noise (stray single digits from mana costs, borders, etc.)
  // tends to be short, while the actual collector number is usually the
  // longest run present. Only when a single short run exists at all does a
  // genuine 1-2 digit collector number get picked, which is the case this
  // is meant to support.
  const numberPattern = /(?<number>\d{1,5})(?<suffix>[A-Z])?(?:\s*(?<star>[★*]))?/g;
  let bestNumberMatch = null;
  let match;
  while ((match = numberPattern.exec(numberSearchText)) !== null) {
    if (!bestNumberMatch || match.groups.number.length > bestNumberMatch.groups.number.length) {
      bestNumberMatch = match;
    }
  }
  if (bestNumberMatch) {
    const { number, suffix, star } = bestNumberMatch.groups;
    cardInfo.collectorNumber = number + (suffix ? suffix.toLowerCase() : '') + (star ? '★' : '');
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
