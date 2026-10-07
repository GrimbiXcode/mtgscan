// Turns a photo into OCR-ready candidates: the collector-text blocks found
// by textLocator.js, best first, each cropped from the full-resolution
// photo and binarized.

import { defaultCreateCanvas } from './canvasUtil.js';
import { locateCollectorTextBlocks, extractCollectorTextRegion, binarizeCollectorText } from './textLocator.js';

// The true block ranks first on every fixture at full resolution; the
// runners-up cover small/distant cards where e.g. the copyright line
// outranks it.
export const MAX_CANDIDATES = 3;

// Downscaled copy of the source with the located blocks outlined (best
// candidate in red), for the debug panel.
export function drawLocatorOverview(sourceCanvas, candidates, createCanvas = defaultCreateCanvas) {
  const scale = Math.min(1, 800 / sourceCanvas.width);
  const overview = createCanvas(Math.round(sourceCanvas.width * scale), Math.round(sourceCanvas.height * scale));
  const ctx = overview.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, overview.width, overview.height);
  ctx.lineWidth = 3;
  candidates.forEach((candidate, i) => {
    const { x, y, width, height } = candidate.bounds;
    ctx.strokeStyle = i === 0 ? '#ff0000' : '#ffcc00';
    ctx.strokeRect(x * scale - 4, y * scale - 4, width * scale + 8, height * scale + 8);
  });
  return overview;
}

// Lazily yields { name, candidate, region, canvas } per located block, most
// promising first, so a caller that stops at the first convincing OCR
// result never pays for cropping the rest. `region` is the colour crop,
// `canvas` the binarized OCR input.
export function* generateDetectionVariants(sourceCanvas, createCanvas = defaultCreateCanvas, candidates = null) {
  const located = candidates ?? locateCollectorTextBlocks(sourceCanvas, { maxCandidates: MAX_CANDIDATES }, createCanvas);
  for (const [i, candidate] of located.entries()) {
    const region = extractCollectorTextRegion(sourceCanvas, candidate, createCanvas);
    yield { name: `located-${i + 1}`, candidate, region, canvas: binarizeCollectorText(region, createCanvas) };
  }
}
