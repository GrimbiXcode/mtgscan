// Foil-card detection: crude but cheap heuristic based on color variance and
// brightness distribution (foil shimmer produces more midtone, less pure
// black/white pixels than a normal card print).

export function analyzeImageCharacteristics(data) {
  let totalBrightness = 0;
  let colorVariance = 0;
  const pixelCount = data.length / 4;

  let brightPixels = 0;
  let darkPixels = 0;
  let midtonePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    totalBrightness += gray;

    if (gray > 180) brightPixels++;
    else if (gray < 75) darkPixels++;
    else midtonePixels++;

    const avgRGB = (r + g + b) / 3;
    colorVariance += Math.abs(r - avgRGB) + Math.abs(g - avgRGB) + Math.abs(b - avgRGB);
  }

  return {
    averageBrightness: totalBrightness / pixelCount,
    colorVariance: colorVariance / pixelCount,
    brightPixelRatio: brightPixels / pixelCount,
    darkPixelRatio: darkPixels / pixelCount,
    midtonePixelRatio: midtonePixels / pixelCount,
  };
}

export function detectFoilCard(stats) {
  const foilIndicators = {
    highColorVariance: stats.colorVariance > 15,
    highMidtoneRatio: stats.midtonePixelRatio > 0.4,
    lowerContrast: stats.darkPixelRatio < 0.3 && stats.brightPixelRatio < 0.3,
  };

  const foilScore = Object.values(foilIndicators).filter(Boolean).length;
  return foilScore >= 2;
}

export function performFoilDetection(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const stats = analyzeImageCharacteristics(data);
  const isFoil = detectFoilCard(stats);

  return { isFoil, stats };
}
