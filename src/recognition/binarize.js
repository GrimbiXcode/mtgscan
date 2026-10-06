// Binarization: converts the cropped collector-number text strip into a
// high-contrast black-on-white image for OCR, branching on foil status
// since foil shimmer needs a different contrast curve than a normal print.

export function processFoilCollectorNumber(data, stats) {
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    let threshold = 128;
    if (stats.averageBrightness > 140) {
      threshold = 160;
    } else if (stats.averageBrightness < 100) {
      threshold = 100;
    }

    let enhanced;
    if (gray > threshold) {
      enhanced = 128 + (gray - threshold) * (127 / (255 - threshold)) * 1.8;
    } else {
      enhanced = (gray / threshold) * 128 * 0.6;
    }
    enhanced = Math.max(0, Math.min(255, enhanced));

    const inverted = 255 - enhanced;
    data[i] = inverted;
    data[i + 1] = inverted;
    data[i + 2] = inverted;
  }
}

export function processNormalCollectorNumber(data) {
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * 2.5 + 128));
    const inverted = 255 - enhanced;
    data[i] = inverted;
    data[i + 1] = inverted;
    data[i + 2] = inverted;
  }
}

export function processCollectorNumberImage(canvas, foilDetectionResult) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  if (foilDetectionResult.isFoil) {
    processFoilCollectorNumber(data, foilDetectionResult.stats);
  } else {
    processNormalCollectorNumber(data);
  }

  ctx.putImageData(imageData, 0, 0);
}
