#!/usr/bin/env node

const Tesseract = require('tesseract.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs').promises;
const path = require('path');
const { getCardName } = require('./card-mapping');

/**
 * Comprehensive OCR Test Script for MTG Card Names
 * Tests multiple OCR configurations to achieve >80% accuracy
 */
class OCRTester {
    constructor() {
        this.testDir = './test-images-ocr';
        this.results = [];
        this.configurations = this.getTestConfigurations();
    }

    /**
     * Define all OCR configurations to test
     */
    getTestConfigurations() {
        return [
            // English configurations
            { 
                name: 'English Default', 
                lang: 'eng',
                psm: '6', // Uniform block of text
                oem: '3'  // Default
            },
            { 
                name: 'English Single Line', 
                lang: 'eng',
                psm: '7', // Single text line
                oem: '3'
            },
            { 
                name: 'English Single Word', 
                lang: 'eng',
                psm: '8', // Single word
                oem: '3'
            },
            { 
                name: 'English LSTM Only', 
                lang: 'eng',
                psm: '6',
                oem: '1'  // LSTM only
            },
            
            // German configurations (for DE cards)
            { 
                name: 'German Default', 
                lang: 'deu',
                psm: '6',
                oem: '3'
            },
            { 
                name: 'German Single Line', 
                lang: 'deu',
                psm: '7',
                oem: '3'
            },
            { 
                name: 'German LSTM Only', 
                lang: 'deu',
                psm: '6',
                oem: '1'
            },
            
            // Multi-language configurations
            { 
                name: 'English+German', 
                lang: 'eng+deu',
                psm: '6',
                oem: '3'
            },
            { 
                name: 'English+German Single Line', 
                lang: 'eng+deu',
                psm: '7',
                oem: '3'
            },
            
            // Whitelist configurations for card-like text
            { 
                name: 'English Alphanumeric', 
                lang: 'eng',
                psm: '7',
                oem: '3',
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 \'-,.'
            },
            { 
                name: 'German Alphanumeric', 
                lang: 'deu',
                psm: '7',
                oem: '3',
                whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß0123456789 \'-,.'
            }
        ];
    }

    /**
     * Extract expected text from filename using card mapping
     */
    extractExpectedText(filename) {
        return getCardName(filename);
    }

    /**
     * Calculate similarity between expected and actual text
     */
    calculateAccuracy(expected, actual) {
        if (!expected || !actual) return 0;

        const exp = expected.toLowerCase().trim();
        const act = actual.toLowerCase().trim();

        // Exact match
        if (exp === act) return 100;

        // Levenshtein distance based accuracy
        const maxLen = Math.max(exp.length, act.length);
        const distance = this.levenshteinDistance(exp, act);
        const similarity = ((maxLen - distance) / maxLen) * 100;

        // Also check if the actual text contains most words from expected
        const expWords = exp.split(/\s+/).filter(w => w.length > 2);
        const actWords = act.split(/\s+/).filter(w => w.length > 2);
        
        let wordMatches = 0;
        expWords.forEach(word => {
            if (actWords.some(actWord => 
                actWord.includes(word) || word.includes(actWord) ||
                this.levenshteinDistance(word, actWord) <= 1
            )) {
                wordMatches++;
            }
        });

        const wordAccuracy = expWords.length > 0 ? (wordMatches / expWords.length) * 100 : 0;

        // Return the better of the two scores
        return Math.max(similarity, wordAccuracy);
    }

    /**
     * Calculate Levenshtein distance
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
     * Process single image with given OCR configuration
     */
    async processImage(imagePath, config, expectedText) {
        try {
            console.log(`  Testing ${config.name}...`);
            
            const startTime = Date.now();

            // Build Tesseract options
            const options = {
                logger: () => {} // Suppress logs
            };

            // Configure Tesseract parameters
            const tesseractConfig = {
                tessedit_pageseg_mode: config.psm,
                tessedit_ocr_engine_mode: config.oem
            };

            if (config.whitelist) {
                tesseractConfig.tessedit_char_whitelist = config.whitelist;
            }

            const { data: { text } } = await Tesseract.recognize(
                imagePath,
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
                processTime,
                success: true
            };

        } catch (error) {
            console.log(`    Error: ${error.message}`);
            return {
                config: config.name,
                expectedText,
                recognizedText: '',
                accuracy: 0,
                processTime: 0,
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Test all configurations on all images
     */
    async runTests() {
        console.log('🔍 Starting comprehensive OCR tests...\n');

        try {
            const files = await fs.readdir(this.testDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

            if (imageFiles.length === 0) {
                throw new Error(`No image files found in ${this.testDir}`);
            }

            console.log(`Found ${imageFiles.length} test images:`);
            imageFiles.forEach(file => console.log(`  - ${file}`));
            console.log('');

            // Test each image with each configuration
            for (const imageFile of imageFiles) {
                const imagePath = path.join(this.testDir, imageFile);
                const expectedText = this.extractExpectedText(imageFile);
                
                console.log(`📷 Testing: ${imageFile}`);
                console.log(`   Expected: "${expectedText}"`);

                const imageResults = [];

                for (const config of this.configurations) {
                    const result = await this.processImage(imagePath, config, expectedText);
                    imageResults.push(result);

                    if (result.success) {
                        const accuracyColor = result.accuracy >= 80 ? '🟢' : result.accuracy >= 60 ? '🟡' : '🔴';
                        console.log(`    ${accuracyColor} ${config.name}: ${result.accuracy.toFixed(1)}% - "${result.recognizedText}"`);
                    }
                }

                this.results.push({
                    imageFile,
                    expectedText,
                    results: imageResults
                });

                console.log('');
            }

        } catch (error) {
            console.error('❌ Error during testing:', error.message);
            process.exit(1);
        }
    }

    /**
     * Generate comprehensive test report
     */
    generateReport() {
        console.log('📊 COMPREHENSIVE OCR TEST REPORT\n');
        console.log('='.repeat(60));

        // Overall statistics
        const totalTests = this.results.reduce((sum, img) => sum + img.results.length, 0);
        const successfulTests = this.results.reduce((sum, img) => 
            sum + img.results.filter(r => r.success).length, 0
        );

        console.log(`\n📈 OVERALL STATISTICS:`);
        console.log(`Total tests run: ${totalTests}`);
        console.log(`Successful tests: ${successfulTests}`);
        console.log(`Success rate: ${((successfulTests / totalTests) * 100).toFixed(1)}%`);

        // Configuration performance summary
        console.log(`\n🏆 CONFIGURATION PERFORMANCE RANKING:`);
        const configStats = {};

        this.configurations.forEach(config => {
            const configResults = [];
            this.results.forEach(imgResult => {
                const result = imgResult.results.find(r => r.config === config.name);
                if (result && result.success) {
                    configResults.push(result.accuracy);
                }
            });

            if (configResults.length > 0) {
                configStats[config.name] = {
                    avgAccuracy: configResults.reduce((a, b) => a + b, 0) / configResults.length,
                    maxAccuracy: Math.max(...configResults),
                    minAccuracy: Math.min(...configResults),
                    testsRun: configResults.length,
                    above80: configResults.filter(acc => acc >= 80).length
                };
            }
        });

        // Sort by average accuracy
        const sortedConfigs = Object.entries(configStats)
            .sort(([,a], [,b]) => b.avgAccuracy - a.avgAccuracy);

        sortedConfigs.forEach(([name, stats], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
            const above80Percent = ((stats.above80 / stats.testsRun) * 100).toFixed(1);
            console.log(`${medal} ${name.padEnd(25)} | Avg: ${stats.avgAccuracy.toFixed(1)}% | Max: ${stats.maxAccuracy.toFixed(1)}% | >80%: ${above80Percent}%`);
        });

        // Detailed results per image
        console.log(`\n📋 DETAILED RESULTS BY IMAGE:`);
        this.results.forEach(imgResult => {
            console.log(`\n📷 ${imgResult.imageFile} (Expected: "${imgResult.expectedText}")`);
            
            const successfulResults = imgResult.results
                .filter(r => r.success)
                .sort((a, b) => b.accuracy - a.accuracy);

            if (successfulResults.length > 0) {
                console.log('   Best performers:');
                successfulResults.slice(0, 5).forEach(result => {
                    const accuracyColor = result.accuracy >= 80 ? '🟢' : result.accuracy >= 60 ? '🟡' : '🔴';
                    console.log(`   ${accuracyColor} ${result.config.padEnd(25)} | ${result.accuracy.toFixed(1)}% | "${result.recognizedText}"`);
                });
            } else {
                console.log('   ❌ No successful recognition');
            }
        });

        // Recommendations
        console.log(`\n💡 RECOMMENDATIONS:`);
        
        if (sortedConfigs.length > 0) {
            const bestConfig = sortedConfigs[0];
            const [bestName, bestStats] = bestConfig;
            
            console.log(`\n🎯 BEST OVERALL CONFIGURATION:`);
            console.log(`   Configuration: ${bestName}`);
            console.log(`   Average accuracy: ${bestStats.avgAccuracy.toFixed(1)}%`);
            console.log(`   Tests above 80%: ${bestStats.above80}/${bestStats.testsRun} (${((bestStats.above80/bestStats.testsRun)*100).toFixed(1)}%)`);
            
            if (bestStats.avgAccuracy >= 80) {
                console.log(`   ✅ MEETS TARGET: This configuration achieves >80% accuracy!`);
            } else {
                console.log(`   ⚠️  BELOW TARGET: Consider image quality improvements or additional preprocessing`);
            }

            // Find language-specific recommendations
            const englishConfigs = sortedConfigs.filter(([name]) => name.includes('English') && !name.includes('German'));
            const germanConfigs = sortedConfigs.filter(([name]) => name.includes('German'));
            
            if (englishConfigs.length > 0) {
                console.log(`\n🇺🇸 BEST ENGLISH CONFIG: ${englishConfigs[0][0]} (${englishConfigs[0][1].avgAccuracy.toFixed(1)}%)`);
            }
            if (germanConfigs.length > 0) {
                console.log(`🇩🇪 BEST GERMAN CONFIG: ${germanConfigs[0][0]} (${germanConfigs[0][1].avgAccuracy.toFixed(1)}%)`);
            }
        }

        // Implementation suggestions
        console.log(`\n🔧 IMPLEMENTATION SUGGESTIONS:`);
        console.log(`1. Use the best performing configuration as your primary OCR method`);
        console.log(`2. Consider fallback to secondary config if primary fails`);
        console.log(`3. For mixed-language cards, use multi-language configurations`);
        console.log(`4. If accuracy is still below 80%, consider:`);
        console.log(`   - Improving image preprocessing (contrast, sharpening)`);
        console.log(`   - Cropping more precisely to card name region`);
        console.log(`   - Using manual card name mapping for difficult cases`);

        console.log('\n' + '='.repeat(60));
    }

    /**
     * Save results to JSON file for further analysis
     */
    async saveResults() {
        const reportData = {
            timestamp: new Date().toISOString(),
            testDirectory: this.testDir,
            configurations: this.configurations,
            results: this.results,
            summary: this.generateSummaryStats()
        };

        const reportPath = `ocr-test-results-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
        console.log(`\n📄 Detailed results saved to: ${reportPath}`);
    }

    generateSummaryStats() {
        const configStats = {};
        
        this.configurations.forEach(config => {
            const configResults = [];
            this.results.forEach(imgResult => {
                const result = imgResult.results.find(r => r.config === config.name);
                if (result && result.success) {
                    configResults.push(result.accuracy);
                }
            });

            if (configResults.length > 0) {
                configStats[config.name] = {
                    avgAccuracy: configResults.reduce((a, b) => a + b, 0) / configResults.length,
                    maxAccuracy: Math.max(...configResults),
                    minAccuracy: Math.min(...configResults),
                    testsRun: configResults.length,
                    above80Count: configResults.filter(acc => acc >= 80).length,
                    above80Percent: (configResults.filter(acc => acc >= 80).length / configResults.length) * 100
                };
            }
        });

        return configStats;
    }
}

// Main execution
async function main() {
    const tester = new OCRTester();
    
    try {
        await tester.runTests();
        tester.generateReport();
        await tester.saveResults();
        
        console.log('\n🎉 OCR testing completed successfully!');
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
MTG OCR Test Script

Usage: node test-ocr.js [options]

Options:
  --help, -h     Show this help message
  
This script tests multiple OCR configurations on your preprocessed images
to find the best method for achieving >80% accuracy on MTG card names.

The script will:
1. Test 11 different OCR configurations
2. Measure accuracy against expected text from filenames
3. Generate a comprehensive performance report
4. Recommend the best configuration for your use case

Make sure your images are in the 'test-images-ocr' directory.
`);
    process.exit(0);
}

// Run the tests
main();
