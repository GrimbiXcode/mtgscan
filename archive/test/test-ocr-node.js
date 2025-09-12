#!/usr/bin/env node

/**
 * Node.js OCR Test Runner für deutsche MTG-Karten
 * Testet die OCR-Verbesserungen direkt mit den Testbildern
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const Tesseract = require('tesseract.js');

// Test configuration
const TEST_IMAGE_DIR = path.join(__dirname, 'test_images', 'german');
const OUTPUT_DIR = path.join(__dirname, 'test_output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// German-optimized OCR configurations
const OCR_CONFIGS = {
    primary: {
        lang: 'deu+eng',
        options: {
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()""',
            preserve_interword_spaces: '1',
            tessedit_do_invert: '0',
            user_defined_dpi: '300'
        }
    },
    enhanced: {
        lang: 'deu+eng',
        options: {
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()""',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300'
        }
    },
    aggressive: {
        lang: 'deu+eng',
        options: {
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD,
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()""',
            tessedit_do_invert: '1',
            user_defined_dpi: '300'
        }
    }
};

/**
 * Text cleaning function (matches the web version)
 */
function cleanOCRText(text) {
    if (!text) return '';
    
    let cleaned = text.toString().trim();
    
    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Remove OCR artifacts
    cleaned = cleaned
        .replace(/[|\\[\]{}()<>]/g, '')
        .replace(/[~`!@#$%^&*+=_]/g, '')
        .replace(/["]/g, '')
        .replace(/[.,;:!?]+$/, '');
    
    // Fix common OCR mistakes
    const fixes = [
        { pattern: /\b0(?=[a-zA-Z])/g, replacement: 'O' },
        { pattern: /\b1(?=[a-zA-Z])/g, replacement: 'I' },
        { pattern: /(?<=[a-zA-Z])0\b/g, replacement: 'O' },
        { pattern: /(?<=[a-zA-Z])1\b/g, replacement: 'l' },
        { pattern: /\b5(?=[a-zA-Z])/g, replacement: 'S' },
        { pattern: /\b8(?=[a-zA-Z])/g, replacement: 'B' },
        { pattern: /\b6(?=[a-zA-Z])/g, replacement: 'G' },
        { pattern: /\b9(?=[a-zA-Z])/g, replacement: 'g' },
        { pattern: /rn(?=[a-zA-Z\s])/g, replacement: 'm' },
        { pattern: /vv/g, replacement: 'w' },
        { pattern: /ii/g, replacement: 'll' },
        { pattern: /cl(?=[a-zA-Z])/g, replacement: 'd' },
        { pattern: /fi(?=[a-zA-Z])/g, replacement: 'h' },
        // German-specific fixes
        { pattern: /ae/gi, replacement: 'ä' },
        { pattern: /oe/gi, replacement: 'ö' },
        { pattern: /ue/gi, replacement: 'ü' }
    ];
    
    for (const fix of fixes) {
        cleaned = cleaned.replace(fix.pattern, fix.replacement);
    }
    
    // Normalize punctuation
    cleaned = cleaned
        .replace(/\s*-\s*/g, '-')
        .replace(/\s*'\s*/g, "'")
        .replace(/\s*'\s*/g, "'");
    
    // Final cleanup
    cleaned = cleaned.replace(/[^\x20-\x7EäöüßÄÖÜ'-]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
}

/**
 * Calculate similarity between two strings
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * Preprocess image for better OCR
 */
function preprocessImage(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale and enhance contrast
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Convert to grayscale
        let gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        
        // Light contrast enhancement
        gray = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 128));
        
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/**
 * Extract card name region from image
 */
function extractCardNameRegion(canvas) {
    // Extract top 30% of the image (where card names typically are)
    const headerHeight = Math.floor(canvas.height * 0.3);
    const headerCanvas = createCanvas(canvas.width, headerHeight);
    const ctx = headerCanvas.getContext('2d');
    
    ctx.drawImage(canvas, 0, 0, canvas.width, headerHeight, 
                        0, 0, canvas.width, headerHeight);
    
    return headerCanvas;
}

/**
 * Test OCR on a single image with all configurations
 */
async function testSingleImage(imagePath, expectedName) {
    console.log(`\n🧪 Testing: ${expectedName}`);
    console.log(`   Image: ${path.basename(imagePath)}`);
    
    const startTime = Date.now();
    
    try {
        // Load image
        const img = await loadImage(imagePath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        console.log(`   Original size: ${img.width}x${img.height}`);
        
        // Extract card name region
        const nameRegion = extractCardNameRegion(canvas);
        console.log(`   Name region: ${nameRegion.width}x${nameRegion.height}`);
        
        // Preprocess
        const processed = preprocessImage(nameRegion);
        
        // Save preprocessed image for debugging
        const debugPath = path.join(OUTPUT_DIR, `${path.basename(imagePath, path.extname(imagePath))}_processed.png`);
        const buffer = processed.toBuffer('image/png');
        fs.writeFileSync(debugPath, buffer);
        
        const results = [];
        
        // Test each OCR configuration
        for (const [configName, config] of Object.entries(OCR_CONFIGS)) {
            console.log(`   Testing config: ${configName}`);
            
            try {
                const { data } = await Tesseract.recognize(processed.toBuffer('image/png'), config.lang, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            process.stdout.write(`\r   ${configName}: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                });
                
                const cleanedText = cleanOCRText(data.text);
                const similarity = calculateSimilarity(cleanedText, expectedName);
                
                results.push({
                    config: configName,
                    rawText: data.text,
                    cleanedText,
                    confidence: data.confidence,
                    similarity,
                    success: similarity >= 0.8
                });
                
                console.log(`\r   ${configName}: "${cleanedText}" (${Math.round(similarity * 100)}% similarity)`);
                
            } catch (error) {
                console.log(`\r   ${configName}: ERROR - ${error.message}`);
                results.push({
                    config: configName,
                    error: error.message,
                    success: false
                });
            }
        }
        
        // Find best result
        const successful = results.filter(r => r.success);
        const bestResult = successful.length > 0 ? 
            successful.reduce((best, current) => current.similarity > best.similarity ? current : best) :
            results.reduce((best, current) => (current.similarity || 0) > (best.similarity || 0) ? current : best);
        
        const totalTime = Date.now() - startTime;
        
        const testResult = {
            imagePath,
            expectedName,
            results,
            bestResult,
            totalTime,
            overallSuccess: bestResult.success || false
        };
        
        // Print summary
        console.log(`   ✨ Best: "${bestResult.cleanedText || 'ERROR'}" (${Math.round((bestResult.similarity || 0) * 100)}%)`);
        console.log(`   ⏱️  Time: ${totalTime}ms`);
        console.log(`   ${testResult.overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
        
        return testResult;
        
    } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        return {
            imagePath,
            expectedName,
            error: error.message,
            totalTime: Date.now() - startTime,
            overallSuccess: false
        };
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('🎴 MTG Scanner OCR Test Runner für Deutsche Karten');
    console.log('================================================');
    
    // Find test images
    const imageFiles = fs.readdirSync(TEST_IMAGE_DIR)
        .filter(file => /\.(jpg|jpeg|png|gif|bmp)$/i.test(file))
        .sort();
    
    if (imageFiles.length === 0) {
        console.log('❌ No test images found in', TEST_IMAGE_DIR);
        return;
    }
    
    console.log(`📁 Found ${imageFiles.length} test images`);
    
    const allResults = [];
    
    for (const imageFile of imageFiles) {
        const imagePath = path.join(TEST_IMAGE_DIR, imageFile);
        const expectedName = path.basename(imageFile, path.extname(imageFile));
        
        const result = await testSingleImage(imagePath, expectedName);
        allResults.push(result);
    }
    
    // Print summary
    console.log('\n📊 TEST SUMMARY');
    console.log('===============');
    
    const successful = allResults.filter(r => r.overallSuccess);
    const failed = allResults.filter(r => !r.overallSuccess);
    
    console.log(`✅ Successful: ${successful.length}/${allResults.length}`);
    console.log(`❌ Failed: ${failed.length}/${allResults.length}`);
    console.log(`📈 Success Rate: ${Math.round((successful.length / allResults.length) * 100)}%`);
    
    const avgTime = allResults.reduce((sum, r) => sum + (r.totalTime || 0), 0) / allResults.length;
    console.log(`⏱️  Average Time: ${Math.round(avgTime)}ms`);
    
    if (failed.length > 0) {
        console.log('\n❌ FAILED TESTS:');
        failed.forEach(result => {
            console.log(`   - ${result.expectedName}: "${result.bestResult?.cleanedText || 'ERROR'}" (${Math.round((result.bestResult?.similarity || 0) * 100)}%)`);
        });
        
        console.log('\n🔧 OPTIMIZATION SUGGESTIONS:');
        
        // Analyze failure patterns
        const lowConfidenceTests = failed.filter(r => r.bestResult && r.bestResult.confidence < 50);
        const partialMatches = failed.filter(r => r.bestResult && r.bestResult.similarity > 0.5 && r.bestResult.similarity < 0.8);
        
        if (lowConfidenceTests.length > 0) {
            console.log('   📉 Low confidence results detected - consider:');
            console.log('      • Improving image preprocessing');
            console.log('      • Adjusting OCR parameters');
            console.log('      • Using different OCR models');
        }
        
        if (partialMatches.length > 0) {
            console.log('   📝 Partial matches detected - consider:');
            console.log('      • Improving text cleaning functions');
            console.log('      • Adding more German-specific corrections');
            console.log('      • Adjusting similarity thresholds');
        }
    }
    
    // Save detailed results to JSON
    const resultsPath = path.join(OUTPUT_DIR, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2));
    console.log(`\n💾 Detailed results saved to: ${resultsPath}`);
}

/**
 * Main execution
 */
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = {
    runAllTests,
    testSingleImage,
    cleanOCRText,
    calculateSimilarity
};
