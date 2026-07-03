// Canvas creation helper shared by all recognition modules.
// Browsers get a real <canvas> element; Node (the benchmark harness) injects
// the `canvas` npm package's createCanvas instead, so the exact same
// detection/binarization code runs in both environments unmodified.

export function defaultCreateCanvas(width, height) {
  if (typeof document === 'undefined') {
    throw new Error('No canvas implementation available; pass a createCanvas(width, height) function.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
