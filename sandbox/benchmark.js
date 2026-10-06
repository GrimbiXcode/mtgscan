#!/usr/bin/env node
// Accuracy benchmark for the current collector-number recognition pipeline
// (detection -> foil detection -> binarization -> OCR -> parsing), run
// end-to-end in Node against the photos in sandbox/test-images/.
//
// Ground truth is read straight from each fixture's filename, which follows
// the convention "<rarity> <number> <set> <lang>[ note].jpeg", e.g.
// "U 172 NEO DE.jpeg".
//
// Usage: npm run benchmark

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';
import Tesseract from 'tesseract.js';

import { runDetectionVariants } from '../src/recognition/pipeline.js';
import { cleanOCRText, scoreCollectorNumberResult, parseCollectorNumber } from '../src/recognition/parsing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'test-images');
// Points Tesseract at the traineddata bundled by the @tesseract.js-data/eng
// devDependency instead of fetching it from jsdelivr on every run, so the
// benchmark works offline and isn't at the mercy of a CDN.
const LANG_PATH = path.join(__dirname, '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');

const FILENAME_PATTERN = /^([A-Z])\s+(\d+)\s+([A-Z0-9]+)\s+([A-Z]{2})(?:\s+.*)?\.(jpe?g|png)$/i;

function stripLeadingZeros(numberString) {
  const digitsOnly = numberString.replace(/[^0-9]/g, '');
  return digitsOnly.replace(/^0+(?=\d)/, '');
}

function buildCollectionRegexFromFixtures(filenames) {
  const codes = new Set();
  for (const name of filenames) {
    const match = FILENAME_PATTERN.exec(name);
    if (match) codes.add(match[3].toUpperCase());
  }
  return new RegExp(`(?<collection>${[...codes].join('|')})`);
}

async function fetchScryfallCollectionRegex() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.scryfall.com/sets?order=set&dir=asc&format=json', { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const codes = data.data.map(set => set.code.toUpperCase());
    return new RegExp(`(?<collection>${codes.join('|')})`);
  } catch (error) {
    return null;
  }
}

async function runOcr(canvas) {
  const buffer = canvas.toBuffer('image/png');
  const result = await Tesseract.recognize(buffer, 'eng', {
    langPath: LANG_PATH,
    cacheMethod: 'none',
    tessedit_pageseg_mode: '13',
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /*',
  });
  const rawText = result.data.text || '';
  return { rawText, cleanedText: cleanOCRText(rawText) };
}

function checkMatch(parsed, expectedSet, expectedNumber) {
  if (!parsed) return false;
  const setMatches = parsed.setCode === expectedSet.toUpperCase();
  const numberMatches = stripLeadingZeros(parsed.collectorNumber) === stripLeadingZeros(expectedNumber);
  return setMatches && numberMatches;
}

async function benchmarkFixture(filePath, filename, collectionRegex) {
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) {
    return { filename, skipped: true, reason: 'filename does not match "<rarity> <number> <set> <lang>[ note].ext"' };
  }
  const [, , expectedNumber, expectedSet] = match;

  const image = await loadImage(filePath);
  const sourceCanvas = createCanvas(image.width, image.height);
  sourceCanvas.getContext('2d').drawImage(image, 0, 0);

  const variants = runDetectionVariants(sourceCanvas, createCanvas);

  const attempts = [];
  let best = null;
  for (const variant of variants) {
    const ocrResult = await runOcr(variant.result.canvas);
    const rawScore = scoreCollectorNumberResult(ocrResult.rawText, collectionRegex);
    const cleanedScore = scoreCollectorNumberResult(ocrResult.cleanedText, collectionRegex);
    const usedRaw = rawScore > cleanedScore;
    const text = usedRaw ? ocrResult.rawText : ocrResult.cleanedText;
    const score = Math.max(rawScore, cleanedScore);
    attempts.push({ variant: variant.name, text, score });

    if (!best || score > best.score) best = attempts[attempts.length - 1];
    if (score >= 80) break; // mirrors the app's short-circuit threshold
  }

  const primaryAttempt = attempts[0]; // variants[0] is always 'primary'
  const primaryParsed = parseCollectorNumber(primaryAttempt.text, collectionRegex);
  const bestParsed = parseCollectorNumber(best.text, collectionRegex);

  return {
    filename,
    expected: { set: expectedSet.toUpperCase(), number: expectedNumber },
    primary: { attempt: primaryAttempt, parsed: primaryParsed, pass: checkMatch(primaryParsed, expectedSet, expectedNumber) },
    best: { attempt: best, parsed: bestParsed, pass: checkMatch(bestParsed, expectedSet, expectedNumber) },
    attempts,
  };
}

async function main() {
  const filenames = fs.readdirSync(FIXTURES_DIR).filter(f => /\.(jpe?g|png)$/i.test(f));
  if (filenames.length === 0) {
    console.error(`No fixture images found in ${FIXTURES_DIR}`);
    process.exit(1);
  }

  let collectionRegex = await fetchScryfallCollectionRegex();
  if (!collectionRegex) {
    console.warn('Could not fetch the live Scryfall set list (offline?) - falling back to a regex built from the fixture filenames only.\n');
    collectionRegex = buildCollectionRegexFromFixtures(filenames);
  }

  const results = [];
  for (const filename of filenames) {
    process.stdout.write(`Running ${filename}... `);
    const result = await benchmarkFixture(path.join(FIXTURES_DIR, filename), filename, collectionRegex);
    results.push(result);

    if (result.skipped) {
      console.log(`SKIP (${result.reason})`);
      continue;
    }

    const status = result.best.pass ? 'PASS' : 'FAIL';
    console.log(`${status}  best="${result.best.attempt.text}" (variant=${result.best.attempt.variant}, score=${result.best.attempt.score})  primary="${result.primary.attempt.text}" (score=${result.primary.attempt.score})`);
  }

  const scored = results.filter(r => !r.skipped);
  const primaryPassed = scored.filter(r => r.primary.pass).length;
  const bestPassed = scored.filter(r => r.best.pass).length;
  const pct = (n) => (scored.length ? Math.round((n / scored.length) * 100) : 0);

  console.log('');
  console.log(`Primary-only accuracy:   ${primaryPassed}/${scored.length} (${pct(primaryPassed)}%)`);
  console.log(`Best-of-variants accuracy: ${bestPassed}/${scored.length} (${pct(bestPassed)}%)`);

  if (bestPassed < scored.length) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
