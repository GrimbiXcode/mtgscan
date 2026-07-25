// Test script for foil detection and enhanced OCR
console.log('Testing foil detection and enhanced OCR...');

// Mock the MTGScanner class methods for testing
class TestMTGScanner {
  constructor() {
    // Initialize with test data
    this.collectionRegex = /^[A-Z]{3,4}\s[A-Z]\s\d{3,5}$/;
  }

  // Test analyzeImageCharacteristics method
  analyzeImageCharacteristics(data) {
    let totalBrightness = 0;
    let colorVariance = 0;
    let brightPixels = 0;
    let darkPixels = 0;
    let midtonePixels = 0;
    let pixelCount = data.length / 4;
    const brightnessValues = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += gray;
      brightnessValues.push(gray);

      if (gray > 180) brightPixels++;
      else if (gray < 75) darkPixels++;
      else midtonePixels++;

      const avgRGB = (r + g + b) / 3;
      colorVariance += Math.abs(r - avgRGB) + Math.abs(g - avgRGB) + Math.abs(b - avgRGB);
    }

    const avgBrightness = totalBrightness / pixelCount;
    let brightnessVariance = 0;
    for (const brightness of brightnessValues) {
      brightnessVariance += Math.pow(brightness - avgBrightness, 2);
    }
    brightnessVariance = Math.sqrt(brightnessVariance / pixelCount);

    return {
      averageBrightness: avgBrightness,
      brightnessVariance: brightnessVariance,
      colorVariance: colorVariance / pixelCount,
      brightPixelRatio: brightPixels / pixelCount,
      darkPixelRatio: darkPixels / pixelCount,
      midtonePixelRatio: midtonePixels / pixelCount
    };
  }

  // Test detectFoilCard method
  detectFoilCard(stats) {
    const foilIndicators = {
      highColorVariance: stats.colorVariance > 15,
      highMidtoneRatio: stats.midtonePixelRatio > 0.4,
      lowerContrast: stats.darkPixelRatio < 0.3 && stats.brightPixelRatio < 0.3,
      highBrightnessVariance: stats.brightnessVariance > 20
    };

    const foilScore = Object.values(foilIndicators).filter(Boolean).length;
    
    return {
      isFoil: foilScore >= 2,
      confidence: foilScore / Object.keys(foilIndicators).length
    };
  }

  // Test scoreCollectorNumberResult method
  scoreCollectorNumberResult(text) {
    if (!text) return 0;

    let score = 0;
    const hasCollectionCode = this.collectionRegex.test(text);
    const hasRarityCode = /\s[CURMBLST]\s/.test(text);
    const hasCardNumber = /\d{3,5}/.test(text);
    const hasLanguageCode = /\b(EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.test(text);

    if (hasCollectionCode) score += 50;
    if (hasRarityCode) score += 15;
    if (hasCardNumber) score += 30;
    if (hasLanguageCode) score += 10;
    if (text.length > 10) score += 5;

    return score;
  }
}

// Run tests
function runTests() {
  const scanner = new TestMTGScanner();
  
  console.log('=== Foil Detection Tests ===');
  
  // Test 1: Normal card (low variance, high contrast)
  const normalStats = {
    colorVariance: 10,
    midtonePixelRatio: 0.3,
    darkPixelRatio: 0.4,
    brightPixelRatio: 0.3,
    brightnessVariance: 15
  };
  
  const normalResult = scanner.detectFoilCard(normalStats);
  console.log('Normal card test:', normalResult);
  console.log('Expected: isFoil=false, confidence=0.2');
  
  // Test 2: Foil card (high variance, high midtones)
  const foilStats = {
    colorVariance: 20,
    midtonePixelRatio: 0.5,
    darkPixelRatio: 0.2,
    brightPixelRatio: 0.2,
    brightnessVariance: 25
  };
  
  const foilResult = scanner.detectFoilCard(foilStats);
  console.log('Foil card test:', foilResult);
  console.log('Expected: isFoil=true, confidence=0.75-1.0');
  
  // Test 3: Borderline case
  const borderlineStats = {
    colorVariance: 16,
    midtonePixelRatio: 0.45,
    darkPixelRatio: 0.25,
    brightPixelRatio: 0.25,
    brightnessVariance: 18
  };
  
  const borderlineResult = scanner.detectFoilCard(borderlineStats);
  console.log('Borderline test:', borderlineResult);
  console.log('Expected: isFoil=true (3 indicators), confidence=0.75');
  
  console.log('\n=== OCR Scoring Tests ===');
  
  // Test OCR scoring
  const testTexts = [
    'M21 C 0123',
    'ZNR U 045',
    'INV R 0078',
    'InvalidText',
    'KLD M 123'
  ];
  
  testTexts.forEach(text => {
    const score = scanner.scoreCollectorNumberResult(text);
    console.log(`Text: "${text}" -> Score: ${score}`);
  });
  
  console.log('\n=== Image Analysis Test ===');
  
  // Create test image data (small 4x4 image)
  const testData = new Uint8Array(4 * 4 * 4); // 4x4 RGBA
  
  // Fill with some test values (simulate foil-like characteristics)
  for (let i = 0; i < testData.length; i += 4) {
    testData[i] = 150 + Math.random() * 50;     // R
    testData[i + 1] = 100 + Math.random() * 80; // G  
    testData[i + 2] = 200 + Math.random() * 30; // B
    testData[i + 3] = 255;                     // A
  }
  
  const analysis = scanner.analyzeImageCharacteristics(testData);
  console.log('Test image analysis:', analysis);
  
  const foilTest = scanner.detectFoilCard(analysis);
  console.log('Foil detection on test image:', foilTest);
  
  console.log('\n=== Tests Complete ===');
}

// Run the tests
runTests();