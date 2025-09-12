#!/usr/bin/env node

/**
 * Verbesserte OCR Test Runner mit optimierter Bildvorverarbeitung
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const Tesseract = require('tesseract.js');

const TEST_IMAGE_DIR = path.join(__dirname, 'test_images', 'german');
const OUTPUT_DIR = path.join(__dirname, 'test_output_improved');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Improved image preprocessing strategies
 */
const PREPROCESSING_STRATEGIES = {
    minimal: {
        name: 'Minimal Processing',
        process: (canvas) => {
            // Only basic cleanup, preserve original quality
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Very light noise reduction only
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Convert to grayscale with standard weights
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
    },
    
    gentle: {
        name: 'Gentle Processing',
        process: (canvas) => {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Convert to grayscale and apply very light contrast
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Weighted grayscale for better text visibility
                let gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
                
                // Very light contrast enhancement (factor 1.1 instead of 1.2)
                gray = Math.max(0, Math.min(255, (gray - 128) * 1.1 + 128));
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
    },
    
    adaptive: {
        name: 'Adaptive Processing',
        process: (canvas) => {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // First pass: analyze image brightness
            let totalBrightness = 0;
            let pixelCount = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                totalBrightness += gray;
                pixelCount++;
            }
            
            const avgBrightness = totalBrightness / pixelCount;
            
            // Adaptive processing based on image characteristics
            let contrastFactor = 1.0;
            if (avgBrightness < 100) {
                contrastFactor = 1.3; // Darker images need more contrast
            } else if (avgBrightness > 180) {
                contrastFactor = 0.9; // Brighter images need less contrast
            } else {
                contrastFactor = 1.1; // Normal contrast for mid-range images
            }
            
            // Second pass: apply adaptive processing
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                let gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
                
                // Adaptive contrast enhancement
                gray = Math.max(0, Math.min(255, (gray - 128) * contrastFactor + 128));
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
    },
    
    edge_enhanced: {
        name: 'Edge Enhanced',
        process: (canvas) => {
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;
            
            // Convert to grayscale first
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
                
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            }
            
            // Apply edge enhancement (unsharp mask)
            const original = new Uint8ClampedArray(data);
            
            // Light blur for unsharp mask
            const blurred = new Uint8ClampedArray(data.length);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    
                    let sum = 0;
                    let count = 0;
                    
                    // 3x3 averaging
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                            sum += original[neighborIdx];
                            count++;
                        }
                    }
                    
                    const avg = Math.round(sum / count);
                    blurred[idx] = avg;
                    blurred[idx + 1] = avg;
                    blurred[idx + 2] = avg;
                    blurred[idx + 3] = original[idx + 3];
                }
            }
            
            // Unsharp mask: original + factor * (original - blurred)
            const factor = 0.5; // Light enhancement
            for (let i = 0; i < data.length; i += 4) {
                const enhanced = Math.max(0, Math.min(255, 
                    original[i] + factor * (original[i] - blurred[i])
                ));
                
                data[i] = enhanced;
                data[i + 1] = enhanced;
                data[i + 2] = enhanced;
            }
            
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }
    }
};

/**
 * Multiple region extraction strategies
 */
const REGION_STRATEGIES = {
    top30: {
        name: 'Top 30%',
        extract: (canvas) => {
            const height = Math.floor(canvas.height * 0.3);
            return extractRegion(canvas, 0, 0, canvas.width, height);
        }
    },
    
    top25: {
        name: 'Top 25%',
        extract: (canvas) => {
            const height = Math.floor(canvas.height * 0.25);
            return extractRegion(canvas, 0, 0, canvas.width, height);
        }
    },
    
    topCentered: {
        name: 'Top Center 80%',
        extract: (canvas) => {
            const width = Math.floor(canvas.width * 0.8);
            const height = Math.floor(canvas.height * 0.3);
            const x = Math.floor((canvas.width - width) / 2);
            return extractRegion(canvas, x, 0, width, height);
        }
    },
    
    nameArea: {
        name: 'Name Area Focus',
        extract: (canvas) => {
            // Focus on where MTG card names typically appear
            const width = Math.floor(canvas.width * 0.85);
            const height = Math.floor(canvas.height * 0.2); // Smaller area, more focused
            const x = Math.floor((canvas.width - width) / 2);
            const y = Math.floor(canvas.height * 0.05); // Slight offset from top
            return extractRegion(canvas, x, y, width, height);
        }
    }
};

function extractRegion(canvas, x, y, width, height) {
    const regionCanvas = createCanvas(width, height);
    const ctx = regionCanvas.getContext('2d');
    ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return regionCanvas;
}

/**
 * Clean OCR text with improved German support
 */
function cleanOCRTextImproved(text) {
    if (!text) return '';
    
    let cleaned = text.toString().trim();
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Remove obvious OCR artifacts but preserve German characters
    cleaned = cleaned
        .replace(/[|\\[\]{}()<>]/g, '')
        .replace(/[~`!@#$%^&*+=_]/g, '')
        .replace(/[""]/g, '')
        .replace(/[.,;:!?]+$/, '');
    
    // German-specific OCR fixes (more conservative)
    const germanFixes = [
        // Only fix obvious mistakes, be more conservative
        { pattern: /\b0(?=[a-zA-ZäöüßÄÖÜ])/g, replacement: 'O' },
        { pattern: /\b1(?=[a-zA-ZäöüßÄÖÜ])/g, replacement: 'I' },
        { pattern: /(?<=[a-zA-ZäöüßÄÖÜ])1\b/g, replacement: 'l' },
        { pattern: /\b8(?=[a-zA-ZäöüßÄÖÜ])/g, replacement: 'B' },
        { pattern: /\b6(?=[a-zA-ZäöüßÄÖÜ])/g, replacement: 'G' },
        
        // Character combination fixes
        { pattern: /rn(?=[a-zA-ZäöüßÄÖÜ\s])/g, replacement: 'm' },
        { pattern: /vv/g, replacement: 'w' },
        { pattern: /ii(?![a-zA-ZäöüßÄÖÜ])/g, replacement: 'll' },
        
        // German umlaut restoration (conservative)
        { pattern: /a\u0308/g, replacement: 'ä' },
        { pattern: /o\u0308/g, replacement: 'ö' },
        { pattern: /u\u0308/g, replacement: 'ü' },
        { pattern: /A\u0308/g, replacement: 'Ä' },
        { pattern: /O\u0308/g, replacement: 'Ö' },
        { pattern: /U\u0308/g, replacement: 'Ü' }
    ];
    
    for (const fix of germanFixes) {
        cleaned = cleaned.replace(fix.pattern, fix.replacement);
    }
    
    // Normalize punctuation
    cleaned = cleaned
        .replace(/\s*-\s*/g, '-')
        .replace(/\s*'\s*/g, "'")
        .replace(/\s*'\s*/g, "'");
    
    // Final cleanup - preserve German characters
    cleaned = cleaned.replace(/[^\x20-\x7EäöüßÄÖÜ'-]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
}

/**
 * Calculate text similarity
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const longer = str1.length > str2.length ? str1.toLowerCase() : str2.toLowerCase();
    const shorter = str1.length > str2.length ? str2.toLowerCase() : str1.toLowerCase();
    
    if (longer.length === 0) return 1.0;
    
    // Use a combination of edit distance and word-based similarity
    const editDistance = levenshteinDistance(longer, shorter);
    const editSimilarity = (longer.length - editDistance) / longer.length;
    
    // Word-based similarity for better handling of OCR variations
    const words1 = str1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = str2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    let wordMatches = 0;
    for (const word1 of words1) {
        for (const word2 of words2) {
            if (word1 === word2 || 
                Math.abs(word1.length - word2.length) <= 1 && 
                levenshteinDistance(word1, word2) <= 1) {
                wordMatches++;
                break;
            }
        }
    }
    
    const wordSimilarity = words1.length > 0 ? wordMatches / words1.length : 0;
    
    // Combine both similarities
    return Math.max(editSimilarity, wordSimilarity);
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
 * Test single image with improved processing
 */
async function testSingleImageImproved(imagePath, expectedName) {
    console.log(`\n🎴 Testing: ${expectedName}`);
    console.log(`   Image: ${path.basename(imagePath)}`);
    
    const startTime = Date.now();
    
    try {
        // Load original image
        const img = await loadImage(imagePath);
        const originalCanvas = createCanvas(img.width, img.height);
        const ctx = originalCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        console.log(`   Original: ${img.width}x${img.height}`);
        
        const allResults = [];
        let bestOverallResult = null;
        let bestSimilarity = 0;
        
        // Test all combinations of region and preprocessing strategies
        for (const [regionName, regionStrategy] of Object.entries(REGION_STRATEGIES)) {
            console.log(`\n   🔍 Testing region: ${regionStrategy.name}`);
            
            // Extract region
            const regionCanvas = regionStrategy.extract(originalCanvas);
            console.log(`      Region size: ${regionCanvas.width}x${regionCanvas.height}`);
            
            for (const [processName, processStrategy] of Object.entries(PREPROCESSING_STRATEGIES)) {
                console.log(`      📝 Processing: ${processStrategy.name}`);
                
                // Clone region for processing
                const processCanvas = createCanvas(regionCanvas.width, regionCanvas.height);
                const processCtx = processCanvas.getContext('2d');
                processCtx.drawImage(regionCanvas, 0, 0);
                
                // Apply preprocessing
                const processed = processStrategy.process(processCanvas);
                
                // Save debug image
                const debugName = `${path.basename(imagePath, path.extname(imagePath))}_${regionName}_${processName}.png`;
                const debugPath = path.join(OUTPUT_DIR, debugName);
                const buffer = processed.toBuffer('image/png');
                fs.writeFileSync(debugPath, buffer);
                
                // Test OCR with German+English
                try {
                    process.stdout.write(`         OCR: `);
                    
                    const { data } = await Tesseract.recognize(processed.toBuffer('image/png'), 'deu+eng', {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                process.stdout.write(`${Math.round(m.progress * 100)}% `);
                            }
                        }
                    });
                    
                    const cleanedText = cleanOCRTextImproved(data.text);
                    const similarity = calculateSimilarity(cleanedText, expectedName);
                    
                    const result = {
                        region: regionName,
                        regionStrategy: regionStrategy.name,
                        preprocessing: processName,
                        processingStrategy: processStrategy.name,
                        rawText: data.text,
                        cleanedText,
                        confidence: data.confidence,
                        similarity,
                        success: similarity >= 0.7
                    };
                    
                    allResults.push(result);
                    
                    if (similarity > bestSimilarity) {
                        bestSimilarity = similarity;
                        bestOverallResult = result;
                    }
                    
                    console.log(`"${cleanedText}" (${Math.round(similarity * 100)}%)`);
                    
                } catch (error) {
                    console.log(`ERROR: ${error.message}`);
                    allResults.push({
                        region: regionName,
                        preprocessing: processName,
                        error: error.message,
                        success: false,
                        similarity: 0
                    });
                }
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        console.log(`\n   🏆 BEST RESULT:`);
        if (bestOverallResult) {
            console.log(`      Text: "${bestOverallResult.cleanedText}"`);
            console.log(`      Similarity: ${Math.round(bestSimilarity * 100)}%`);
            console.log(`      Strategy: ${bestOverallResult.regionStrategy} + ${bestOverallResult.processingStrategy}`);
            console.log(`      ${bestOverallResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        } else {
            console.log(`      ❌ NO VALID RESULTS`);
        }
        
        console.log(`   ⏱️  Total time: ${totalTime}ms`);
        
        return {
            imagePath,
            expectedName,
            allResults,
            bestResult: bestOverallResult,
            totalTime,
            overallSuccess: bestOverallResult?.success || false
        };
        
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
 * Run improved tests
 */
async function runImprovedTests() {
    console.log('🚀 MTG Scanner - Verbesserte OCR Tests für Deutsche Karten');
    console.log('========================================================');
    
    const imageFiles = fs.readdirSync(TEST_IMAGE_DIR)
        .filter(file => /\.(jpg|jpeg|png|gif|bmp)$/i.test(file))
        .sort();
    
    if (imageFiles.length === 0) {
        console.log('❌ No test images found');
        return;
    }
    
    console.log(`📁 Testing ${imageFiles.length} images with ${Object.keys(REGION_STRATEGIES).length} region strategies and ${Object.keys(PREPROCESSING_STRATEGIES).length} processing strategies`);
    
    const allResults = [];
    
    for (const imageFile of imageFiles) {
        const imagePath = path.join(TEST_IMAGE_DIR, imageFile);
        const expectedName = path.basename(imageFile, path.extname(imageFile));
        
        const result = await testSingleImageImproved(imagePath, expectedName);
        allResults.push(result);
    }
    
    // Summary
    console.log('\n📊 IMPROVED TEST SUMMARY');
    console.log('========================');
    
    const successful = allResults.filter(r => r.overallSuccess);
    const failed = allResults.filter(r => !r.overallSuccess);
    
    console.log(`✅ Successful: ${successful.length}/${allResults.length}`);
    console.log(`❌ Failed: ${failed.length}/${allResults.length}`);
    console.log(`📈 Success Rate: ${Math.round((successful.length / allResults.length) * 100)}%`);
    
    const avgTime = allResults.reduce((sum, r) => sum + (r.totalTime || 0), 0) / allResults.length;
    console.log(`⏱️  Average Time: ${Math.round(avgTime)}ms`);
    
    // Analysis
    if (successful.length > 0) {
        console.log('\n🎉 SUCCESSFUL STRATEGIES:');
        successful.forEach(result => {
            if (result.bestResult) {
                console.log(`   - ${result.expectedName}: ${result.bestResult.regionStrategy} + ${result.bestResult.processingStrategy} (${Math.round(result.bestResult.similarity * 100)}%)`);
            }
        });
    }
    
    if (failed.length > 0) {
        console.log('\n❌ FAILED TESTS:');
        failed.forEach(result => {
            console.log(`   - ${result.expectedName}: Best ${Math.round((result.bestResult?.similarity || 0) * 100)}%`);
        });
    }
    
    // Find best strategies overall
    const strategyStats = {};
    allResults.forEach(result => {
        if (result.allResults) {
            result.allResults.forEach(r => {
                if (r.similarity > 0) {
                    const key = `${r.region}_${r.preprocessing}`;
                    if (!strategyStats[key]) {
                        strategyStats[key] = {
                            region: r.regionStrategy,
                            processing: r.processingStrategy,
                            similarities: []
                        };
                    }
                    strategyStats[key].similarities.push(r.similarity);
                }
            });
        }
    });
    
    console.log('\n🏆 BEST STRATEGY COMBINATIONS:');
    const rankedStrategies = Object.entries(strategyStats)
        .map(([key, data]) => ({
            key,
            ...data,
            avgSimilarity: data.similarities.reduce((sum, s) => sum + s, 0) / data.similarities.length,
            maxSimilarity: Math.max(...data.similarities)
        }))
        .sort((a, b) => b.avgSimilarity - a.avgSimilarity)
        .slice(0, 5);
    
    rankedStrategies.forEach((strategy, i) => {
        console.log(`   ${i + 1}. ${strategy.region} + ${strategy.processing}`);
        console.log(`      Avg: ${Math.round(strategy.avgSimilarity * 100)}%, Max: ${Math.round(strategy.maxSimilarity * 100)}%`);
    });
    
    // Save results
    const resultsPath = path.join(OUTPUT_DIR, 'improved-test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        summary: {
            total: allResults.length,
            successful: successful.length,
            failed: failed.length,
            successRate: successful.length / allResults.length,
            avgTime: avgTime
        },
        results: allResults,
        strategyRanking: rankedStrategies
    }, null, 2));
    
    console.log(`\n💾 Detailed results saved to: ${resultsPath}`);
}

if (require.main === module) {
    runImprovedTests().catch(error => {
        console.error('❌ Improved test runner failed:', error);
        process.exit(1);
    });
}

module.exports = { runImprovedTests, testSingleImageImproved };
