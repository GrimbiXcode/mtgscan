// Collector-text localization for photos where the card does NOT fill the
// frame (hand-held, on a table, in a sleeve): instead of assuming the card's
// bottom-left corner sits in the bottom-left of the photo, look for what the
// collector info actually is - a small block of light text printed on the
// card's dark bottom border - anywhere in the image.
//
// Steps (all on a downscaled grayscale copy, plain canvas math):
// 1. Mark "light on dark" pixels: noticeably brighter than their
//    neighbourhood while that neighbourhood is dark overall.
// 2. Connected components of that mask, filtered to character-sized blobs.
// 3. Characters -> text lines (same height, same baseline, small gaps).
// 4. Lines -> blocks (stacked, left-aligned), scored so that the typical
//    two-line collector block ("C 0064" / "BLB • DE ✒ ARTIST") wins over
//    stray light-on-dark noise (art highlights, carpet texture, the
//    copyright line).
// The best blocks are cropped from the full-resolution source and
// binarized for OCR (see extractCollectorTextRegion/binarizeCollectorText).
// Nothing here assumes where the card sits in the frame, how big it is, or
// what's around it, so tight crops, hand-held and table photos all take the
// same path.

import { defaultCreateCanvas } from './canvasUtil.js';

const WORK_WIDTH = 1000;
// Light-on-dark mask: a pixel counts as text if it is this much brighter
// than its local mean, and that local mean is at most this dark.
const MIN_CONTRAST = 40;
const MAX_BACKGROUND = 90;
// OCR crop parameters, tuned with sandbox/benchmark.js (also checked on the
// fixtures downscaled to camera-like 1280px/960px widths): glyphs are
// scaled to ~48px cap height, the crop keeps half a glyph of margin, and
// the binarization threshold is biased 30% from Otsu towards the text.
const TARGET_TEXT_HEIGHT = 48;
const CROP_MARGIN = 0.5;
const THRESHOLD_BIAS = 0.3;

// Standard Otsu's method: the threshold that maximizes between-class
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

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

function toGray(data, pixelCount) {
  const gray = new Float32Array(pixelCount);
  for (let k = 0; k < pixelCount; k++) {
    gray[k] = 0.299 * data[4 * k] + 0.587 * data[4 * k + 1] + 0.114 * data[4 * k + 2];
  }
  return gray;
}

function integralImage(gray, width, height) {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }
  return integral;
}

function lightOnDarkMask(gray, width, height, radius) {
  const integral = integralImage(gray, width, height);
  const stride = width + 1;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const k = y * width + x;
      if (mean <= MAX_BACKGROUND && gray[k] - mean >= MIN_CONTRAST) mask[k] = 1;
    }
  }
  return mask;
}

// 8-connected components via an explicit stack (no recursion), returning
// only bounding boxes and pixel counts.
function connectedComponents(mask, width, height) {
  const labels = new Int32Array(width * height);
  const components = [];
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = components.length + 1;
    let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const k = stack.pop();
      const x = k % width;
      const y = (k - x) / width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (mask[n] && !labels[n]) {
            labels[n] = id;
            stack.push(n);
          }
        }
      }
    }
    components.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, w: maxX - minX + 1, h: maxY - minY + 1, count });
  }
  return components;
}

function isCharacterLike(c, imageHeight) {
  if (c.h < 4 || c.h > imageHeight * 0.03) return false;
  if (c.w > c.h * 4) return false; // frame lines, merged words
  if (c.count < 4) return false;
  return true;
}

// Minimal union-find used for both grouping passes.
function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => { parent[find(a)] = find(b); };
  return { find, union };
}

function groupBy(items, find) {
  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  return [...groups.values()];
}

function boundsOf(boxes) {
  const x0 = Math.min(...boxes.map(b => b.x0));
  const y0 = Math.min(...boxes.map(b => b.y0));
  const x1 = Math.max(...boxes.map(b => b.x1));
  const y1 = Math.max(...boxes.map(b => b.y1));
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function groupIntoLines(chars) {
  const sorted = [...chars].sort((a, b) => a.x0 - b.x0);
  const { find, union } = makeUnionFind(sorted.length);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const maxH = Math.max(a.h, b.h);
      if (b.x0 - a.x1 > maxH * 2.5) break; // sorted by x0: nothing further can be close
      if (Math.max(a.h, b.h) > Math.min(a.h, b.h) * 2.2) continue;
      const centerA = (a.y0 + a.y1) / 2;
      const centerB = (b.y0 + b.y1) / 2;
      if (Math.abs(centerA - centerB) > maxH * 0.5) continue;
      union(i, j);
    }
  }
  return groupBy(sorted, find)
    .filter(group => group.length >= 2)
    .map(group => ({ chars: group, ...boundsOf(group), charHeight: median(group.map(c => c.h)) }));
}

function groupIntoBlocks(lines) {
  const { find, union } = makeUnionFind(lines.length);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      const charHeight = Math.max(a.charHeight, b.charHeight);
      if (Math.max(a.charHeight, b.charHeight) > Math.min(a.charHeight, b.charHeight) * 1.6) continue;
      const verticalGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
      if (verticalGap > charHeight * 1.2) continue;
      if (Math.abs(a.x0 - b.x0) > charHeight * 2) continue; // collector lines are left-aligned
      union(i, j);
    }
  }
  return groupBy(lines, find).map(group => {
    const blockLines = group.sort((a, b) => a.y0 - b.y0);
    return {
      lines: blockLines,
      ...boundsOf(blockLines),
      charHeight: median(blockLines.flatMap(line => line.chars.map(c => c.h))),
      charCount: blockLines.reduce((sum, line) => sum + line.chars.length, 0),
    };
  });
}

// Higher = more like a collector-info block. The dominant signal is a
// two-line, left-aligned stack of consistent-height characters; position
// (collector info sits low in the frame) only breaks ties.
function scoreBlock(block, imageHeight) {
  let score = Math.min(block.charCount, 30);
  const lineCount = block.lines.length;
  if (lineCount === 2) score += 20;
  else if (lineCount > 3) score -= 10 * (lineCount - 3);

  const heights = block.lines.flatMap(line => line.chars.map(c => c.h));
  const spread = heights.filter(h => Math.abs(h - block.charHeight) <= block.charHeight * 0.35).length / heights.length;
  score *= spread;

  score += 5 * (block.y1 / imageHeight);
  return score;
}

// Returns up to `maxCandidates` collector-text candidates, best first, each
// with its bounds in source-canvas coordinates.
export function locateCollectorTextBlocks(sourceCanvas, { maxCandidates = 3 } = {}, createCanvas = defaultCreateCanvas) {
  const scale = Math.min(1, WORK_WIDTH / sourceCanvas.width);
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const work = createCanvas(width, height);
  const ctx = work.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = toGray(data, width * height);

  const radius = Math.max(6, Math.round(width / 80));
  const mask = lightOnDarkMask(gray, width, height, radius);
  const chars = connectedComponents(mask, width, height).filter(c => isCharacterLike(c, height));
  const lines = groupIntoLines(chars);
  const blocks = groupIntoBlocks(lines)
    .filter(block => block.charCount >= 4)
    .map(block => ({ ...block, score: scoreBlock(block, height) }))
    .sort((a, b) => b.score - a.score);

  return blocks.slice(0, maxCandidates).map(block => ({
    score: block.score,
    lineCount: block.lines.length,
    charCount: block.charCount,
    bounds: {
      x: block.x0 / scale,
      y: block.y0 / scale,
      width: block.w / scale,
      height: block.h / scale,
    },
    charHeight: block.charHeight / scale,
  }));
}

// Crops a located block from the full-resolution source (with a margin) and
// scales it so glyphs land near TARGET_TEXT_HEIGHT. The result is still in
// colour (shown in the debug panel); binarizeCollectorText makes the OCR
// input from it.
export function extractCollectorTextRegion(sourceCanvas, candidate, createCanvas = defaultCreateCanvas) {
  const { bounds, charHeight } = candidate;
  const margin = charHeight * CROP_MARGIN;
  const x0 = Math.max(0, Math.floor(bounds.x - margin));
  const y0 = Math.max(0, Math.floor(bounds.y - margin));
  const x1 = Math.min(sourceCanvas.width, Math.ceil(bounds.x + bounds.width + margin));
  const y1 = Math.min(sourceCanvas.height, Math.ceil(bounds.y + bounds.height + margin));

  const factor = Math.min(6, Math.max(0.5, TARGET_TEXT_HEIGHT / charHeight));
  const outWidth = Math.max(1, Math.round((x1 - x0) * factor));
  const outHeight = Math.max(1, Math.round((y1 - y0) * factor));

  const region = createCanvas(outWidth, outHeight);
  const ctx = region.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, x0, y0, x1 - x0, y1 - y0, 0, 0, outWidth, outHeight);
  return region;
}

// Binarizes an extracted region (left untouched) into a new canvas with
// black text on white, padded with a white border (Tesseract misreads
// glyphs touching the image edge). The threshold sits above Otsu's,
// towards the mean of the light (text) class: at plain Otsu the bold
// collector font bleeds and closes the counters of "B", which Tesseract
// then reads as "E".
export function binarizeCollectorText(region, createCanvas = defaultCreateCanvas) {
  const { width, height } = region;
  const imageData = region.getContext('2d').getImageData(0, 0, width, height);
  const { data } = imageData;
  const gray = toGray(data, width * height);

  const otsu = otsuThreshold(gray);
  let lightSum = 0;
  let lightCount = 0;
  for (const value of gray) {
    if (value > otsu) {
      lightSum += value;
      lightCount++;
    }
  }
  const lightMean = lightCount > 0 ? lightSum / lightCount : otsu;
  const threshold = otsu + THRESHOLD_BIAS * (lightMean - otsu);

  for (let k = 0; k < gray.length; k++) {
    const value = gray[k] > threshold ? 0 : 255; // light text -> black ink
    data[4 * k] = value;
    data[4 * k + 1] = value;
    data[4 * k + 2] = value;
    data[4 * k + 3] = 255;
  }

  const pad = Math.round(TARGET_TEXT_HEIGHT * 0.4);
  const out = createCanvas(width + 2 * pad, height + 2 * pad);
  const outCtx = out.getContext('2d');
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.putImageData(imageData, pad, pad);
  return out;
}
