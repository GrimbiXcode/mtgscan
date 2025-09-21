#!/usr/bin/env node

const Tesseract = require('tesseract.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');
const { getCardName } = require('./card-mapping');

/**
 * Advanced OCR Test Script with Enhanced Image Processing
 * Focuses on card name regions and applies various preprocessing techniques
 */
class AdvancedOCRTester {
    constructor() {
        this.testDir = './test-images-ocr';
        this.results = [];
        this.configurations = this.getAdvancedConfigurations();
    }

    /**
     * Advanced OCR configurations with different preprocessing techniques
     */
    getAdvancedConfigurations() {
        return [
            // Standard configurations
            { 
                name: 'German Standard', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'none'
            },
            { 
                name: 'German High Contrast', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'contrast'
            },
            { 
                name: 'German Inverted', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'invert'
            },
            { 
                name: 'German Upscaled', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'upscale'
            },
            { 
                name: 'German Sharpen', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'sharpen'
            },
            
            // English fallbacks
            { 
                name: 'English Standard', 
                lang: 'eng',
                psm: '7',
                oem: '3',
                preprocessing: 'none'
            },
            { 
                name: 'English High Contrast', 
                lang: 'eng',
                psm: '7',
                oem: '3',
                preprocessing: 'contrast'
            },
            
            // Multi-language
            { 
                name: 'Multi-lang Standard', 
                lang: 'eng+deu',
                psm: '7',
                oem: '3',
                preprocessing: 'none'
            },
            { 
                name: 'Multi-lang Contrast', 
                lang: 'eng+deu',
                psm: '7',
                oem: '3',
                preprocessing: 'contrast'
            },
            
            // Different PSM modes with preprocessing
            { 
                name: 'German Block Text', 
                lang: 'deu',
                psm: '6',
                oem: '3',
                preprocessing: 'contrast'
            },
            { 
                name: 'German Single Word', 
                lang: 'deu',
                psm: '8',
                oem: '3',
                preprocessing: 'contrast'
            },
            
            // Character whitelist variants
            { 
                name: 'German Letters Only', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                preprocessing: 'contrast',
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß \'-'
            }
        ];
    }

    /**
     * Apply image preprocessing based on technique
     */
    async preprocessImage(imagePath, technique) {
        if (technique === 'none') {
            return imagePath;
        }

        try {
            const image = await loadImage(imagePath);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            const data = imageData.data;

            switch (technique) {
                case 'contrast':
                    // Increase contrast
                    const contrastFactor = 2.0;
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrastFactor + 128));
                        data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrastFactor + 128));
                        data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrastFactor + 128));
                    }
                    break;
                
                case 'invert':
                    // Invert colors (white text on black background)
                    for (let i = 0; i < data.length; i += 4) {
                        data[i] = 255 - data[i];
                        data[i + 1] = 255 - data[i + 1];
                        data[i + 2] = 255 - data[i + 2];
                    }
                    break;
                
                case 'sharpen':
                    // Apply sharpening filter
                    const originalData = new Uint8ClampedArray(data);
                    for (let y = 1; y < image.height - 1; y++) {
                        for (let x = 1; x < image.width - 1; x++) {
                            for (let c = 0; c < 3; c++) {
                                const idx = (y * image.width + x) * 4 + c;
                                const kernel = [
                                    originalData[idx - image.width * 4 - 4 + c] * -1,
                                    originalData[idx - image.width * 4 + c] * -1,
                                    originalData[idx - image.width * 4 + 4 + c] * -1,
                                    originalData[idx - 4 + c] * -1,
                                    originalData[idx + c] * 9,
                                    originalData[idx + 4 + c] * -1,
                                    originalData[idx + image.width * 4 - 4 + c] * -1,
                                    originalData[idx + image.width * 4 + c] * -1,
                                    originalData[idx + image.width * 4 + 4 + c] * -1
                                ];
                                data[idx] = Math.min(255, Math.max(0, kernel.reduce((a, b) => a + b, 0)));
                            }
                        }
                    }
                    break;
                
                case 'upscale':
                    // Create 2x upscaled image
                    const upscaleCanvas = createCanvas(image.width * 2, image.height * 2);
                    const upscaleCtx = upscaleCanvas.getContext('2d');
                    upscaleCtx.imageSmoothingEnabled = false;
                    upscaleCtx.drawImage(canvas, 0, 0, image.width * 2, image.height * 2);
                    
                    const tempPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, `_upscaled.$1`);
                    const buffer = upscaleCanvas.toBuffer('image/png');
                    await fs.writeFile(tempPath, buffer);
                    return tempPath;
            }

            ctx.putImageData(imageData, 0, 0);
            
            const tempPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, `_${technique}.$1`);
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(tempPath, buffer);
            return tempPath;

        } catch (error) {
            console.log(`    ⚠️  Preprocessing failed for ${technique}: ${error.message}`);
            return imagePath;
        }
    }

    /**
     * Clean up temporary preprocessed images
     */
    async cleanupTempFiles(imagePath) {
        const tempPatterns = ['_contrast', '_invert', '_sharpen', '_upscaled'];
        for (const pattern of tempPatterns) {
            try {
                const tempPath = imagePath.replace(/\.(png|jpg|jpeg)$/i, `${pattern}.$1`);
                await fs.unlink(tempPath);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Extract expected text from filename using card mapping
     */
    extractExpectedText(filename) {
        return getCardName(filename);
    }

    /**
     * Calculate accuracy with enhanced matching
     */
    calculateAccuracy(expected, actual) {
        if (!expected || !actual) return 0;

        const exp = expected.toLowerCase().trim();
        const act = actual.toLowerCase().trim();

        // Exact match
        if (exp === act) return 100;

        // Remove common OCR artifacts
        const cleanActual = act
            .replace(/[|]/g, 'I')  // Common OCR mistake
            .replace(/[0]/g, 'O')  // Zero to O
            .replace(/[5]/g, 'S')  // 5 to S
            .replace(/[1]/g, 'l')  // 1 to l
            .trim();

        if (exp === cleanActual) return 95;

        // Levenshtein distance based accuracy
        const maxLen = Math.max(exp.length, cleanActual.length);
        const distance = this.levenshteinDistance(exp, cleanActual);
        const similarity = ((maxLen - distance) / maxLen) * 100;

        // Word-based matching
        const expWords = exp.split(/\s+/).filter(w => w.length > 2);
        const actWords = cleanActual.split(/\s+/).filter(w => w.length > 2);
        
        let wordMatches = 0;
        expWords.forEach(word => {
            if (actWords.some(actWord => 
                actWord.includes(word) || word.includes(actWord) ||
                this.levenshteinDistance(word, actWord) <= Math.max(1, Math.floor(word.length * 0.2))
            )) {
                wordMatches++;
            }
        });

        const wordAccuracy = expWords.length > 0 ? (wordMatches / expWords.length) * 100 : 0;

        // Partial string matching
        let partialMatch = 0;
        if (cleanActual.includes(exp.substring(0, Math.floor(exp.length / 2)))) {
            partialMatch = 50;
        }

        // Return the best score
        return Math.max(similarity, wordAccuracy, partialMatch);
    }

    /**
     * Levenshtein distance calculation
     */
    levenshteinDistance(str1, str2) {
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
     * Process single image with advanced OCR configuration
     */
    async processImage(imagePath, config, expectedText) {
        let processedImagePath = imagePath;
        
        try {
            console.log(`  Testing ${config.name}...`);
            
            const startTime = Date.now();

            // Apply preprocessing if specified
            if (config.preprocessing && config.preprocessing !== 'none') {
                processedImagePath = await this.preprocessImage(imagePath, config.preprocessing);
            }

            // Build Tesseract configuration
            const tesseractConfig = {
                tessedit_pageseg_mode: config.psm,
                tessedit_ocr_engine_mode: config.oem
            };

            if (config.whitelist) {
                tesseractConfig.tessedit_char_whitelist = config.whitelist;
            }

            // Additional OCR parameters for better accuracy
            tesseractConfig.tessedit_char_blacklist = '0123456789';  // Remove numbers if not expected
            tesseractConfig.textord_min_linesize = '2.5';  // Minimum line size

            const { data: { text, confidence } } = await Tesseract.recognize(
                processedImagePath,
                config.lang,
                {
                    logger: () => {}, // Suppress verbose logging
                    ...tesseractConfig
                }
            );

            const processTime = Date.now() - startTime;
            const cleanText = text.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
            const accuracy = this.calculateAccuracy(expectedText, cleanText);

            return {
                config: config.name,
                expectedText,
                recognizedText: cleanText,
                accuracy,
                confidence: confidence || 0,
                processTime,
                success: true,
                preprocessing: config.preprocessing || 'none'
            };

        } catch (error) {
            console.log(`    Error: ${error.message}`);
            return {
                config: config.name,
                expectedText,
                recognizedText: '',
                accuracy: 0,
                confidence: 0,
                processTime: 0,
                success: false,
                error: error.message,
                preprocessing: config.preprocessing || 'none'
            };
        } finally {
            // Cleanup temporary files
            if (processedImagePath !== imagePath) {
                await this.cleanupTempFiles(imagePath);
            }
        }
    }

    /**
     * Run comprehensive tests with progress tracking
     */
    async runTests() {
        console.log('🔍 Starting ADVANCED OCR tests with image preprocessing...\n');

        try {
            const files = await fs.readdir(this.testDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

            if (imageFiles.length === 0) {
                throw new Error(`No image files found in ${this.testDir}`);
            }

            console.log(`Found ${imageFiles.length} test images:`);
            imageFiles.forEach(file => console.log(`  - ${file}`));
            console.log(`\n🧪 Testing ${this.configurations.length} configurations per image\n`);

            // Test each image with each configuration
            for (let imageIndex = 0; imageIndex < imageFiles.length; imageIndex++) {
                const imageFile = imageFiles[imageIndex];
                const imagePath = path.join(this.testDir, imageFile);
                const expectedText = this.extractExpectedText(imageFile);
                
                console.log(`📷 [${imageIndex + 1}/${imageFiles.length}] Testing: ${imageFile}`);
                console.log(`   Expected: "${expectedText}"`);

                const imageResults = [];
                let bestAccuracy = 0;
                let bestConfig = '';

                for (const config of this.configurations) {
                    const result = await this.processImage(imagePath, config, expectedText);
                    imageResults.push(result);

                    if (result.success && result.accuracy > bestAccuracy) {
                        bestAccuracy = result.accuracy;
                        bestConfig = result.config;
                    }

                    if (result.success) {
                        const accuracyColor = result.accuracy >= 80 ? '🟢' : 
                                            result.accuracy >= 60 ? '🟡' : 
                                            result.accuracy >= 30 ? '🟠' : '🔴';
                        const confidenceStr = result.confidence > 0 ? ` (${result.confidence.toFixed(0)}% conf)` : '';
                        console.log(`    ${accuracyColor} ${config.name}: ${result.accuracy.toFixed(1)}%${confidenceStr} - "${result.recognizedText}"`);
                    }
                }

                if (bestAccuracy > 0) {
                    console.log(`    🏆 Best: ${bestConfig} with ${bestAccuracy.toFixed(1)}% accuracy`);
                }

                this.results.push({
                    imageFile,
                    expectedText,
                    results: imageResults,
                    bestAccuracy,
                    bestConfig
                });

                console.log('');
            }

        } catch (error) {
            console.error('❌ Error during testing:', error.message);
            process.exit(1);
        }
    }

    /**
     * Generate enhanced test report with actionable insights
     */
    generateReport() {
        console.log('📊 ADVANCED OCR TEST REPORT\n');
        console.log('='.repeat(70));

        // Overall statistics
        const totalTests = this.results.reduce((sum, img) => sum + img.results.length, 0);
        const successfulTests = this.results.reduce((sum, img) => 
            sum + img.results.filter(r => r.success).length, 0
        );

        const testsAbove80 = this.results.reduce((sum, img) => 
            sum + img.results.filter(r => r.success && r.accuracy >= 80).length, 0
        );

        const testsAbove60 = this.results.reduce((sum, img) => 
            sum + img.results.filter(r => r.success && r.accuracy >= 60).length, 0
        );

        console.log(`\n📈 OVERALL PERFORMANCE:`);
        console.log(`Total tests run: ${totalTests}`);
        console.log(`Successful tests: ${successfulTests}`);
        console.log(`Tests ≥80% accuracy: ${testsAbove80} (${((testsAbove80/totalTests)*100).toFixed(1)}%)`);
        console.log(`Tests ≥60% accuracy: ${testsAbove60} (${((testsAbove60/totalTests)*100).toFixed(1)}%)`);

        // Best per-image results
        console.log(`\n🎯 BEST RESULTS PER IMAGE:`);
        this.results.forEach(imgResult => {
            const statusIcon = imgResult.bestAccuracy >= 80 ? '🟢' : 
                             imgResult.bestAccuracy >= 60 ? '🟡' : 
                             imgResult.bestAccuracy >= 30 ? '🟠' : '🔴';
            console.log(`${statusIcon} ${imgResult.imageFile}: ${imgResult.bestAccuracy.toFixed(1)}% (${imgResult.bestConfig})`);
        });

        // Configuration analysis
        console.log(`\n🔬 PREPROCESSING TECHNIQUE ANALYSIS:`);
        const preprocessingStats = {};
        
        this.results.forEach(imgResult => {
            imgResult.results.forEach(result => {
                if (result.success) {
                    const prep = result.preprocessing;
                    if (!preprocessingStats[prep]) {
                        preprocessingStats[prep] = [];
                    }
                    preprocessingStats[prep].push(result.accuracy);
                }
            });
        });

        Object.entries(preprocessingStats)
            .sort(([,a], [,b]) => (b.reduce((x,y) => x+y, 0)/b.length) - (a.reduce((x,y) => x+y, 0)/a.length))
            .forEach(([prep, accuracies]) => {
                const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
                const max = Math.max(...accuracies);
                const above80 = accuracies.filter(a => a >= 80).length;
                console.log(`  ${prep.padEnd(12)}: Avg ${avg.toFixed(1)}% | Max ${max.toFixed(1)}% | >80%: ${above80}/${accuracies.length}`);
            });

        // Language analysis
        console.log(`\n🌐 LANGUAGE MODEL ANALYSIS:`);
        const languageStats = {};
        
        this.results.forEach(imgResult => {
            imgResult.results.forEach(result => {
                if (result.success) {
                    const lang = this.configurations.find(c => c.name === result.config)?.lang || 'unknown';
                    if (!languageStats[lang]) {
                        languageStats[lang] = [];
                    }
                    languageStats[lang].push(result.accuracy);
                }
            });
        });

        Object.entries(languageStats)
            .sort(([,a], [,b]) => (b.reduce((x,y) => x+y, 0)/b.length) - (a.reduce((x,y) => x+y, 0)/a.length))
            .forEach(([lang, accuracies]) => {
                const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
                const max = Math.max(...accuracies);
                const above80 = accuracies.filter(a => a >= 80).length;
                console.log(`  ${lang.padEnd(12)}: Avg ${avg.toFixed(1)}% | Max ${max.toFixed(1)}% | >80%: ${above80}/${accuracies.length}`);
            });

        // Recommendations
        console.log(`\n💡 ACTIONABLE RECOMMENDATIONS:\n`);
        
        const hasGoodResults = testsAbove80 > 0;
        const hasDecentResults = testsAbove60 > 0;
        
        if (hasGoodResults) {
            console.log(`✅ SUCCESS: ${testsAbove80} tests achieved ≥80% accuracy!`);
            
            // Find the best performing configuration
            let bestOverallConfig = '';
            let bestOverallScore = 0;
            
            Object.entries(preprocessingStats).forEach(([prep, accuracies]) => {
                const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
                if (avg > bestOverallScore) {
                    bestOverallScore = avg;
                    bestOverallConfig = prep;
                }
            });
            
            console.log(`🏆 RECOMMENDED CONFIG: Use German language model with '${bestOverallConfig}' preprocessing`);
            
        } else if (hasDecentResults) {
            console.log(`⚠️  PARTIAL SUCCESS: ${testsAbove60} tests achieved ≥60% accuracy`);
            console.log(`🔧 NEXT STEPS:`);
            console.log(`   1. Improve image quality before OCR`);
            console.log(`   2. Crop more precisely to card name region`);
            console.log(`   3. Try additional preprocessing techniques`);
            
        } else {
            console.log(`❌ POOR RESULTS: No tests achieved ≥60% accuracy`);
            console.log(`🚨 CRITICAL ISSUES DETECTED:`);
            console.log(`   1. Images may not contain readable card names`);
            console.log(`   2. Text may be too small or blurry`);
            console.log(`   3. Consider manual inspection of image content`);
            
            // Analyze what OCR is actually reading
            const commonText = {};
            this.results.forEach(imgResult => {
                imgResult.results.forEach(result => {
                    if (result.success && result.recognizedText.length > 5) {
                        const text = result.recognizedText;
                        commonText[text] = (commonText[text] || 0) + 1;
                    }
                });
            });
            
            const mostCommon = Object.entries(commonText)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);
                
            if (mostCommon.length > 0) {
                console.log(`\n🔍 OCR IS CONSISTENTLY READING:`);
                mostCommon.forEach(([text, count]) => {
                    console.log(`   "${text}" (${count} times)`);
                });
                console.log(`\n💭 This suggests the images contain card metadata rather than names`);
                console.log(`   Consider cropping to a different region of the card`);
            }
        }

        console.log(`\n🛠️  GENERAL OPTIMIZATION TIPS:`);
        console.log(`1. Ensure images show the card NAME region clearly`);
        console.log(`2. Use images with high contrast between text and background`);
        console.log(`3. Minimum recommended text height: 20+ pixels`);
        console.log(`4. For German cards, always use 'deu' language model`);
        console.log(`5. Consider combining multiple OCR results for better accuracy`);

        console.log('\n' + '='.repeat(70));
    }

    /**
     * Save enhanced results with detailed analysis
     */
    async saveResults() {
        const reportData = {
            timestamp: new Date().toISOString(),
            testDirectory: this.testDir,
            configurations: this.configurations,
            results: this.results,
            summary: this.generateSummaryStats(),
            analysis: this.generateAnalysisData()
        };

        const reportPath = `ocr-advanced-results-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed results saved to: ${reportPath}`);
    }

    generateSummaryStats() {
        // Implementation similar to original but with enhanced metrics
        const configStats = {};
        
        this.configurations.forEach(config => {
            const configResults = [];
            this.results.forEach(imgResult => {
                const result = imgResult.results.find(r => r.config === config.name);
                if (result && result.success) {
                    configResults.push({
                        accuracy: result.accuracy,
                        confidence: result.confidence,
                        processTime: result.processTime
                    });
                }
            });

            if (configResults.length > 0) {
                configStats[config.name] = {
                    avgAccuracy: configResults.reduce((a, b) => a + b.accuracy, 0) / configResults.length,
                    avgConfidence: configResults.reduce((a, b) => a + b.confidence, 0) / configResults.length,
                    avgProcessTime: configResults.reduce((a, b) => a + b.processTime, 0) / configResults.length,
                    maxAccuracy: Math.max(...configResults.map(r => r.accuracy)),
                    minAccuracy: Math.min(...configResults.map(r => r.accuracy)),
                    testsRun: configResults.length,
                    above80Count: configResults.filter(r => r.accuracy >= 80).length,
                    above60Count: configResults.filter(r => r.accuracy >= 60).length
                };
            }
        });

        return configStats;
    }

    generateAnalysisData() {
        return {
            totalImages: this.results.length,
            totalTests: this.results.reduce((sum, img) => sum + img.results.length, 0),
            successfulTests: this.results.reduce((sum, img) => sum + img.results.filter(r => r.success).length, 0),
            testsAbove80: this.results.reduce((sum, img) => sum + img.results.filter(r => r.success && r.accuracy >= 80).length, 0),
            testsAbove60: this.results.reduce((sum, img) => sum + img.results.filter(r => r.success && r.accuracy >= 60).length, 0),
            bestPerImage: this.results.map(img => ({
                image: img.imageFile,
                bestAccuracy: img.bestAccuracy,
                bestConfig: img.bestConfig
            }))
        };
    }
}

// Main execution
async function main() {
    const tester = new AdvancedOCRTester();
    
    try {
        await tester.runTests();
        tester.generateReport();
        await tester.saveResults();
        
        console.log('\n🎉 Advanced OCR testing completed!');
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Advanced MTG OCR Test Script

Usage: node test-ocr-advanced.js [options]

This enhanced script:
1. Tests 12+ OCR configurations with image preprocessing
2. Applies contrast enhancement, sharpening, upscaling, and inversion
3. Provides detailed analysis of preprocessing techniques
4. Gives actionable recommendations for achieving >80% accuracy

Image preprocessing techniques:
- High Contrast: Increases text/background contrast
- Sharpen: Applies sharpening filter to text edges  
- Upscale: 2x image scaling for better OCR
- Invert: White text on black background

Make sure your images contain clear, readable card names!
`);
    process.exit(0);
}

main();
