// Card region detection: locating the card's bottom/left edges and the
// collector-number text line within a photo, using adaptive (Otsu) and
// gradient-based edge signals instead of a single fixed black-pixel
// threshold, so borderless/extended-art cards and non-ideal lighting are
// tolerated instead of only cards with a solid black border.

import { defaultCreateCanvas } from './canvasUtil.js';

export const DEFAULT_QUADRANT_FRACTION = { x: 0.6, y: 0.6 };

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

// Standard Otsu's method: finds the threshold that maximizes between-class
// variance for a set of grayscale samples.
export function otsuThreshold(grayValues) {
  if (grayValues.length === 0) return 128;

  const histogram = new Array(256).fill(0);
  for (const value of grayValues) {
    histogram[Math.max(0, Math.min(255, Math.round(value)))]++;
  }

  const total = grayValues.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumB += t * histogram[t];
    const meanBackground = sumB / weightBackground;
    const meanForeground = (sum - sumB) / weightForeground;

    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  return threshold;
}

// Combines an Otsu-threshold-based edge candidate with a gradient-energy
// based candidate. Agreement raises confidence. On disagreement the Otsu
// candidate is preferred by default (it matches the common bordered-card
// case), while the gradient candidate - which doesn't depend on the border
// being black - is retried separately as a borderless-card fallback variant
// (see pipeline.js's 'edge-disagreement' variant). No candidates at all
// falls back to a fixed guess instead of failing outright.
function combineEdgeCandidates(otsuCandidate, gradientCandidate, fallbackValue, edgeChoice, tolerance = 15) {
  if (edgeChoice === 'otsu' && otsuCandidate !== null) {
    return { edge: otsuCandidate, confidence: 'forced-otsu', chosenMethod: 'otsu', otsuCandidate, gradientCandidate };
  }
  if (edgeChoice === 'gradient' && gradientCandidate !== null) {
    return { edge: gradientCandidate, confidence: 'forced-gradient', chosenMethod: 'gradient', otsuCandidate, gradientCandidate };
  }

  if (otsuCandidate !== null && gradientCandidate !== null) {
    if (Math.abs(otsuCandidate - gradientCandidate) <= tolerance) {
      return { edge: otsuCandidate, confidence: 'high', chosenMethod: 'otsu', otsuCandidate, gradientCandidate };
    }
    return { edge: otsuCandidate, confidence: 'low', chosenMethod: 'otsu', otsuCandidate, gradientCandidate };
  }
  if (otsuCandidate !== null) {
    return { edge: otsuCandidate, confidence: 'low', chosenMethod: 'otsu', otsuCandidate, gradientCandidate };
  }
  if (gradientCandidate !== null) {
    return { edge: gradientCandidate, confidence: 'low', chosenMethod: 'gradient', otsuCandidate, gradientCandidate };
  }
  return { edge: fallbackValue, confidence: 'none', chosenMethod: 'none', otsuCandidate, gradientCandidate };
}

function smoothProfile(values) {
  return values.map((_, i) => {
    const a = values[i - 1] ?? values[i];
    const b = values[i];
    const c = values[i + 1] ?? values[i];
    return (a + b + c) / 3;
  });
}

// Step 2: find the card's bottom edge by scanning rows bottom-up along the
// right portion of the (already quadrant-cropped) image.
export function findBottomCardEdge(canvas, { edgeChoice = 'auto' } = {}) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;

  const sampleWidth = Math.max(3, Math.floor(width * 0.15));
  const xStart = Math.max(0, width - sampleWidth);

  const bandGrayValues = [];
  const rowAverage = new Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = xStart; x < width; x++) {
      const gray = grayAt(data, width, x, y);
      bandGrayValues.push(gray);
      sum += gray;
      count++;
    }
    rowAverage[y] = count > 0 ? sum / count : 0;
  }

  const threshold = otsuThreshold(bandGrayValues);

  let otsuCandidate = null;
  for (let y = height - 1; y >= 0; y--) {
    let darkCount = 0;
    let total = 0;
    for (let x = xStart; x < width; x++) {
      total++;
      if (grayAt(data, width, x, y) < threshold) darkCount++;
    }
    if (total > 0 && darkCount / total > 0.6) {
      otsuCandidate = y;
      break;
    }
  }

  const energy = new Array(height).fill(0);
  for (let y = 1; y < height; y++) {
    energy[y] = Math.abs(rowAverage[y] - rowAverage[y - 1]);
  }
  const smoothed = smoothProfile(energy);

  let gradientCandidate = null;
  let maxEnergy = -1;
  for (let y = 1; y < height - 1; y++) {
    if (smoothed[y] > maxEnergy) {
      maxEnergy = smoothed[y];
      gradientCandidate = y;
    }
  }

  return combineEdgeCandidates(otsuCandidate, gradientCandidate, height - 1, edgeChoice);
}

// Step 3: find the card's left edge by scanning columns left-to-right along
// the bottom portion of the (bottom-edge-cropped) image.
export function findLeftCardEdge(canvas, { edgeChoice = 'auto' } = {}) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;

  const sampleHeight = Math.max(3, Math.floor(height * 0.1));
  const yStart = Math.max(0, height - sampleHeight);

  const bandGrayValues = [];
  const colAverage = new Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = yStart; y < height; y++) {
      const gray = grayAt(data, width, x, y);
      bandGrayValues.push(gray);
      sum += gray;
      count++;
    }
    colAverage[x] = count > 0 ? sum / count : 0;
  }

  const threshold = otsuThreshold(bandGrayValues);

  let otsuCandidate = null;
  for (let x = 0; x < width; x++) {
    let darkCount = 0;
    let total = 0;
    for (let y = yStart; y < height; y++) {
      total++;
      if (grayAt(data, width, x, y) < threshold) darkCount++;
    }
    if (total > 0 && darkCount / total > 0.6) {
      otsuCandidate = x;
      break;
    }
  }

  const energy = new Array(width).fill(0);
  for (let x = 1; x < width; x++) {
    energy[x] = Math.abs(colAverage[x] - colAverage[x - 1]);
  }
  const smoothed = smoothProfile(energy);

  let gradientCandidate = null;
  let maxEnergy = -1;
  for (let x = 1; x < width - 1; x++) {
    if (smoothed[x] > maxEnergy) {
      maxEnergy = smoothed[x];
      gradientCandidate = x;
    }
  }

  return combineEdgeCandidates(otsuCandidate, gradientCandidate, 0, edgeChoice);
}

export function cropToLowerLeftQuadrant(canvas, fraction = DEFAULT_QUADRANT_FRACTION, createCanvas = defaultCreateCanvas) {
  const quadrantWidth = Math.floor(canvas.width * fraction.x);
  const quadrantHeight = Math.floor(canvas.height * fraction.y);
  const startX = 0;
  const startY = canvas.height - quadrantHeight;

  const quadrantCanvas = createCanvas(quadrantWidth, quadrantHeight);
  const ctx = quadrantCanvas.getContext('2d');
  ctx.drawImage(canvas, startX, startY, quadrantWidth, quadrantHeight, 0, 0, quadrantWidth, quadrantHeight);

  return quadrantCanvas;
}

export function cropToBottomEdge(canvas, bottomEdge, createCanvas = defaultCreateCanvas) {
  const croppedHeight = bottomEdge + 1;
  const croppedCanvas = createCanvas(canvas.width, croppedHeight);
  const ctx = croppedCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0, canvas.width, croppedHeight, 0, 0, canvas.width, croppedHeight);
  return croppedCanvas;
}

export function cropToLeftEdge(canvas, leftEdge, createCanvas = defaultCreateCanvas) {
  const croppedWidth = canvas.width - leftEdge;
  const croppedCanvas = createCanvas(croppedWidth, canvas.height);
  const ctx = croppedCanvas.getContext('2d');
  ctx.drawImage(canvas, leftEdge, 0, croppedWidth, canvas.height, 0, 0, croppedWidth, canvas.height);
  return croppedCanvas;
}

// Step 4: locate the collector-number text line within the card-corner crop.
export function findTextLineBounds(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;

  const brightnessProfile = analyzeBrightnessProfile(data, width, height);
  const edgeDensityProfile = analyzeEdgeDensityProfile(data, width, height);
  const textPatterns = detectTextPatterns(data, width, height);

  const textBounds = combineTextDetectionMethods(brightnessProfile, edgeDensityProfile, textPatterns, height);
  if (textBounds) {
    return { ...textBounds, usedEnhanced: true };
  }

  const fallbackTextBounds = fallbackTextDetection(height);
  return { ...fallbackTextBounds, usedEnhanced: false };
}

function analyzeBrightnessProfile(data, width, height) {
  const brightnessProfile = [];
  const sampleWidth = Math.floor(width * 0.8);

  for (let y = height - 1; y >= 0; y--) {
    let totalBrightness = 0;
    let pixelCount = 0;
    for (let x = 0; x < sampleWidth; x++) {
      totalBrightness += grayAt(data, width, x, y);
      pixelCount++;
    }
    brightnessProfile.push({ y, brightness: pixelCount > 0 ? totalBrightness / pixelCount : 0 });
  }

  return brightnessProfile;
}

function analyzeEdgeDensityProfile(data, width, height) {
  const edgeDensityProfile = [];
  const sobelThreshold = 50;

  for (let y = 1; y < height - 1; y++) {
    let edgeCount = 0;
    let totalPixels = 0;
    for (let x = 1; x < width - 1; x++) {
      const gx = getSobelX(data, x, y, width);
      const gy = getSobelY(data, x, y, width);
      const edgeStrength = Math.sqrt(gx * gx + gy * gy);
      if (edgeStrength > sobelThreshold) edgeCount++;
      totalPixels++;
    }
    edgeDensityProfile.push({ y, edgeDensity: totalPixels > 0 ? edgeCount / totalPixels : 0 });
  }

  return edgeDensityProfile;
}

export function getSobelX(data, x, y, width) {
  const getPixel = (px, py) => grayAt(data, width, px, py);
  return (
    -1 * getPixel(x - 1, y - 1) + 1 * getPixel(x + 1, y - 1) +
    -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) +
    -1 * getPixel(x - 1, y + 1) + 1 * getPixel(x + 1, y + 1)
  );
}

export function getSobelY(data, x, y, width) {
  const getPixel = (px, py) => grayAt(data, width, px, py);
  return (
    -1 * getPixel(x - 1, y - 1) + -2 * getPixel(x, y - 1) + -1 * getPixel(x + 1, y - 1) +
    1 * getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + 1 * getPixel(x + 1, y + 1)
  );
}

function detectTextPatterns(data, width, height) {
  const textPatterns = [];
  const blockSize = 8;

  for (let y = height - blockSize; y >= 0; y -= blockSize) {
    let textLikelihood = 0;
    let blockCount = 0;
    for (let x = 0; x < width - blockSize; x += blockSize) {
      textLikelihood += analyzeBlock(data, x, y, blockSize, width, height).textLikelihood;
      blockCount++;
    }
    textPatterns.push({ y, textLikelihood: blockCount > 0 ? textLikelihood / blockCount : 0 });
  }

  return textPatterns;
}

function analyzeBlock(data, startX, startY, blockSize, width, height) {
  let brightPixels = 0;
  let darkPixels = 0;
  let totalVariance = 0;
  let pixelCount = 0;

  for (let y = startY; y < startY + blockSize; y++) {
    for (let x = startX; x < startX + blockSize; x++) {
      const gray = grayAt(data, width, x, y);
      if (gray > 128) brightPixels++;
      else darkPixels++;

      const neighbors = getNeighborValues(data, x, y, width, height);
      totalVariance += calculateVariance(neighbors);
      pixelCount++;
    }
  }

  const contrastRatio = Math.min(brightPixels, darkPixels) / Math.max(brightPixels, darkPixels);
  const avgVariance = pixelCount > 0 ? totalVariance / pixelCount : 0;

  let textLikelihood = 0;
  if (contrastRatio > 0.2 && contrastRatio < 0.8) textLikelihood += 0.5;
  if (avgVariance > 200 && avgVariance < 2000) textLikelihood += 0.5;

  return { textLikelihood };
}

function getNeighborValues(data, x, y, width, height) {
  const neighbors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
        neighbors.push(grayAt(data, width, nx, ny));
      }
    }
  }
  return neighbors;
}

function calculateVariance(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  return values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
}

function combineTextDetectionMethods(brightnessProfile, edgeDensityProfile, textPatterns, height) {
  const brightnessPeaks = findBrightnessPeaks(brightnessProfile);
  const edgePeaks = findEdgeDensityPeaks(edgeDensityProfile);
  const textPeaks = findTextPatternPeaks(textPatterns);

  const combinedEvidence = combineEvidence(brightnessPeaks, edgePeaks, textPeaks, height);
  if (combinedEvidence.textStart && combinedEvidence.textEnd) {
    return {
      startY: combinedEvidence.textStart,
      height: combinedEvidence.textEnd - combinedEvidence.textStart,
    };
  }

  return null;
}

function findBrightnessPeaks(profile) {
  const peaks = [];
  const minBrightness = 30;

  for (let i = 1; i < profile.length - 1; i++) {
    const current = profile[i];
    const prev = profile[i - 1];
    const next = profile[i + 1];
    if (current.brightness > minBrightness &&
        current.brightness > prev.brightness + 10 &&
        current.brightness > next.brightness + 10) {
      peaks.push(current.y);
    }
  }

  return peaks;
}

function findEdgeDensityPeaks(profile) {
  const peaks = [];
  const minEdgeDensity = 0.1;

  for (let i = 1; i < profile.length - 1; i++) {
    const current = profile[i];
    const prev = profile[i - 1];
    const next = profile[i + 1];
    if (current.edgeDensity > minEdgeDensity &&
        current.edgeDensity > prev.edgeDensity &&
        current.edgeDensity > next.edgeDensity) {
      peaks.push(current.y);
    }
  }

  return peaks;
}

function findTextPatternPeaks(patterns) {
  const minTextLikelihood = 0.3;
  return patterns.filter(p => p.textLikelihood > minTextLikelihood).map(p => p.y);
}

function combineEvidence(brightnessPeaks, edgePeaks, textPeaks, height) {
  const tolerance = 20;
  const consensusRegions = brightnessPeaks.map(bPeak => {
    let score = 1;
    if (edgePeaks.some(ePeak => Math.abs(ePeak - bPeak) < tolerance)) score += 1;
    if (textPeaks.some(tPeak => Math.abs(tPeak - bPeak) < tolerance)) score += 1;
    return { y: bPeak, score };
  });

  consensusRegions.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.y - b.y));

  if (consensusRegions.length >= 1) {
    const textStart = consensusRegions[0].y;
    const estimatedTextHeight = Math.min(60, Math.floor(height * 0.08));
    const textEnd = Math.min(textStart + estimatedTextHeight, height);
    return { textStart, textEnd };
  }

  return { textStart: null, textEnd: null };
}

function fallbackTextDetection(height) {
  const textAreaHeight = Math.floor(height * 0.15);
  return { startY: height - textAreaHeight, height: textAreaHeight };
}

export function cropToTextArea(canvas, textBounds, createCanvas = defaultCreateCanvas) {
  const textCanvas = createCanvas(canvas.width, textBounds.height);
  const ctx = textCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, textBounds.startY, canvas.width, textBounds.height, 0, 0, canvas.width, textBounds.height);
  return textCanvas;
}

export function copyCanvas(sourceCanvas, createCanvas = defaultCreateCanvas) {
  const copy = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = copy.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  return copy;
}
