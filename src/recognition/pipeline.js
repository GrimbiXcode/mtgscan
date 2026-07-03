// Orchestrates detection + foil-detection + binarization into a single
// card-region candidate, and generates a small set of alternate candidates
// (different crop width, flipped foil path, alternate edge signal) so the
// caller can try OCR against more than one image before giving up.

import { defaultCreateCanvas } from './canvasUtil.js';
import {
  DEFAULT_QUADRANT_FRACTION,
  cropToLowerLeftQuadrant,
  findBottomCardEdge,
  cropToBottomEdge,
  findLeftCardEdge,
  cropToLeftEdge,
  findTextLineBounds,
  cropToTextArea,
  copyCanvas,
} from './detection.js';
import { performFoilDetection } from './foil.js';
import { processCollectorNumberImage } from './binarize.js';

export const WIDER_QUADRANT_FRACTION = { x: 0.85, y: 0.85 };
export const MAX_DETECTION_VARIANTS = 4;

// Runs the full detection -> foil-detection -> binarization pipeline once,
// with no hard-failure path: edge detection always resolves to some edge
// (falling back to a fixed guess when neither signal finds one), so a
// canvas is always produced for the caller to attempt OCR against.
export function detectCardRegion(sourceCanvas, options = {}, createCanvas = defaultCreateCanvas) {
  const { quadrantFraction = DEFAULT_QUADRANT_FRACTION, forceFoilPath = null, edgeChoice = 'auto' } = options;

  const debug = { steps: [] };

  const quadrantCanvas = cropToLowerLeftQuadrant(sourceCanvas, quadrantFraction, createCanvas);
  debug.quadrantImage = quadrantCanvas;
  debug.steps.push({
    step: 1,
    name: 'Quadrant Crop',
    status: 'SUCCESS',
    size: { width: quadrantCanvas.width, height: quadrantCanvas.height },
  });

  const bottomEdgeResult = findBottomCardEdge(quadrantCanvas, { edgeChoice });
  const bottomCroppedCanvas = cropToBottomEdge(quadrantCanvas, bottomEdgeResult.edge, createCanvas);
  debug.bottomCroppedImage = bottomCroppedCanvas;
  debug.steps.push({
    step: 2,
    name: 'Bottom Edge Detection',
    status: 'SUCCESS',
    bottomEdge: bottomEdgeResult.edge,
    confidence: bottomEdgeResult.confidence,
    size: { width: bottomCroppedCanvas.width, height: bottomCroppedCanvas.height },
  });

  const leftEdgeResult = findLeftCardEdge(bottomCroppedCanvas, { edgeChoice });
  const leftCroppedCanvas = cropToLeftEdge(bottomCroppedCanvas, leftEdgeResult.edge, createCanvas);
  debug.leftCroppedImage = leftCroppedCanvas;

  // Whole-corner foil read: kept as the general foil metadata tag shown to
  // the user (independent of which binarization branch OCR actually used).
  const cornerFoilResult = performFoilDetection(leftCroppedCanvas);
  debug.steps.push({
    step: 3,
    name: 'Left Edge Detection',
    status: 'SUCCESS',
    leftEdge: leftEdgeResult.edge,
    confidence: leftEdgeResult.confidence,
    foilDetected: cornerFoilResult.isFoil,
    foilStats: cornerFoilResult.stats,
    size: { width: leftCroppedCanvas.width, height: leftCroppedCanvas.height },
  });

  const textBounds = findTextLineBounds(leftCroppedCanvas);
  const textAreaCanvas = cropToTextArea(leftCroppedCanvas, textBounds, createCanvas);
  debug.textAreaImage = textAreaCanvas;

  // Foil read on the actual OCR strip (not the whole card corner) decides
  // which binarization branch to use, since that's the region that matters
  // for OCR quality.
  const stripFoilResult = performFoilDetection(textAreaCanvas);
  const binarizeIsFoil = forceFoilPath !== null ? forceFoilPath : stripFoilResult.isFoil;

  const finalCanvas = copyCanvas(textAreaCanvas, createCanvas);
  processCollectorNumberImage(finalCanvas, { isFoil: binarizeIsFoil, stats: stripFoilResult.stats });
  debug.finalImage = finalCanvas;
  debug.steps.push({
    step: 4,
    name: 'Text Line Detection & OCR Optimization',
    status: 'SUCCESS',
    usedEnhanced: textBounds.usedEnhanced,
    textBounds,
    imageProcessingApplied: true,
    size: { width: finalCanvas.width, height: finalCanvas.height },
  });

  const edgeConfidence = (bottomEdgeResult.confidence === 'high' && leftEdgeResult.confidence === 'high')
    ? 'high'
    : (bottomEdgeResult.confidence === 'none' || leftEdgeResult.confidence === 'none')
      ? 'none'
      : 'low';

  return {
    canvas: finalCanvas,
    foilDetected: cornerFoilResult.isFoil,
    binarizeIsFoil,
    edgeConfidence,
    bottomEdgeResult,
    leftEdgeResult,
    debug,
  };
}

// Builds a small, capped set of detection candidates: the primary (default)
// crop, a wider crop for imperfect framing, a flipped-foil-path candidate
// (hedges against a foil misclassification), and — only when the two edge
// signals disagreed on the primary run — a candidate that explicitly uses
// the alternate edge signal.
export function runDetectionVariants(sourceCanvas, createCanvas = defaultCreateCanvas) {
  const primary = detectCardRegion(sourceCanvas, {}, createCanvas);
  const variants = [{ name: 'primary', result: primary }];

  const wider = detectCardRegion(sourceCanvas, { quadrantFraction: WIDER_QUADRANT_FRACTION }, createCanvas);
  variants.push({ name: 'wider', result: wider });

  const altBinarization = detectCardRegion(sourceCanvas, { forceFoilPath: !primary.binarizeIsFoil }, createCanvas);
  variants.push({ name: 'alt-binarization', result: altBinarization });

  if (primary.edgeConfidence === 'low') {
    // Try whichever signal the primary run did NOT use, since disagreement
    // means one of the two is probably right for this particular photo.
    const otherEdgeChoice = primary.bottomEdgeResult.chosenMethod === 'otsu' ? 'gradient' : 'otsu';
    const edgeDisagreement = detectCardRegion(sourceCanvas, { edgeChoice: otherEdgeChoice }, createCanvas);
    variants.push({ name: 'edge-disagreement', result: edgeDisagreement });
  }

  return variants.slice(0, MAX_DETECTION_VARIANTS);
}
