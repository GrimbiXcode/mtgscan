// Enhanced Camera Manager Test Script
// Run this in the browser console to validate the new camera functionality

console.log('🎴 Testing Enhanced MTG Scanner Camera Manager');

// Test 1: Check if enhanced features are available
function testEnhancedFeatures() {
    console.log('\n📋 Test 1: Enhanced Features Check');
    
    const camera = new CameraManager();
    
    // Check for new properties
    const hasCardDetectionConfig = camera.cardDetectionConfig !== undefined;
    const hasOverlayCanvas = camera.overlayCanvas !== undefined;
    const hasRealTimeDetection = typeof camera.startRealTimeDetection === 'function';
    const hasCardExtraction = typeof camera.extractCardFromFrame === 'function';
    const hasEnhancedPreprocessing = typeof camera.applyEnhancedPreprocessingPipeline === 'function';
    
    console.log(`✓ Card Detection Config: ${hasCardDetectionConfig}`);
    console.log(`✓ Overlay Canvas Support: ${hasOverlayCanvas !== undefined}`);
    console.log(`✓ Real-time Detection: ${hasRealTimeDetection}`);
    console.log(`✓ Card Extraction: ${hasCardExtraction}`);
    console.log(`✓ Enhanced Preprocessing: ${hasEnhancedPreprocessing}`);
    
    return hasCardDetectionConfig && hasRealTimeDetection && hasCardExtraction && hasEnhancedPreprocessing;
}

// Test 2: Check backward compatibility
function testBackwardCompatibility() {
    console.log('\n🔄 Test 2: Backward Compatibility Check');
    
    const camera = new CameraManager();
    
    // Check if legacy methods still exist
    const hasInit = typeof camera.init === 'function';
    const hasStartCamera = typeof camera.startCamera === 'function';
    const hasCaptureImage = typeof camera.captureImage === 'function';
    const hasPreprocessImage = typeof camera.preprocessImage === 'function';
    const hasPreprocessForOCR = typeof camera.preprocessForOCR === 'function';
    const hasCheckCameraSupport = typeof CameraManager.checkCameraSupport === 'function';
    
    console.log(`✓ init(): ${hasInit}`);
    console.log(`✓ startCamera(): ${hasStartCamera}`);
    console.log(`✓ captureImage(): ${hasCaptureImage}`);
    console.log(`✓ preprocessImage(): ${hasPreprocessImage}`);
    console.log(`✓ preprocessForOCR(): ${hasPreprocessForOCR}`);
    console.log(`✓ checkCameraSupport(): ${hasCheckCameraSupport}`);
    
    return hasInit && hasStartCamera && hasCaptureImage && hasPreprocessImage && hasPreprocessForOCR;
}

// Test 3: Card detection configuration
function testCardDetectionConfig() {
    console.log('\n⚙️ Test 3: Card Detection Configuration');
    
    const camera = new CameraManager();
    const config = camera.cardDetectionConfig;
    
    console.log('Card Detection Config:', config);
    console.log(`✓ Min Area: ${config.minArea}`);
    console.log(`✓ Max Area: ${config.maxArea}`);
    console.log(`✓ Aspect Ratio Range: ${config.aspectRatioMin} - ${config.aspectRatioMax}`);
    console.log(`✓ Canny Thresholds: ${config.cannyLow} - ${config.cannyHigh}`);
    
    return config.minArea > 0 && config.maxArea > config.minArea;
}

// Test 4: Image processing algorithms
function testImageProcessingAlgorithms() {
    console.log('\n🖼️ Test 4: Image Processing Algorithms');
    
    const camera = new CameraManager();
    
    // Test Gaussian blur
    const testData = new Uint8Array([100, 120, 110, 130, 90]);
    const blurred = camera.gaussianBlur(testData, 5, 1, 3);
    console.log(`✓ Gaussian Blur: ${blurred instanceof Uint8Array}`);
    
    // Test contour detection methods
    const hasContourMethods = typeof camera.findCardContours === 'function' &&
                              typeof camera.selectBestCardContour === 'function' &&
                              typeof camera.scoreContourAsCard === 'function';
    console.log(`✓ Contour Detection Methods: ${hasContourMethods}`);
    
    // Test perspective correction methods
    const hasPerspectiveMethods = typeof camera.perspectiveCorrectCard === 'function' &&
                                  typeof camera.calculatePerspectiveMatrix === 'function' &&
                                  typeof camera.bilinearInterpolate === 'function';
    console.log(`✓ Perspective Correction Methods: ${hasPerspectiveMethods}`);
    
    return hasContourMethods && hasPerspectiveMethods;
}

// Test 5: Enhanced preprocessing pipeline
function testEnhancedPreprocessing() {
    console.log('\n🔧 Test 5: Enhanced Preprocessing Pipeline');
    
    const camera = new CameraManager();
    
    // Create a test canvas
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 400;
    testCanvas.height = 300;
    const ctx = testCanvas.getContext('2d');
    
    // Fill with test pattern
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#000000';
    ctx.fillText('Test Card Name', 50, 50);
    
    try {
        // Test content analysis
        const analysis = camera.analyzeImageContent(testCanvas);
        console.log(`✓ Content Analysis: brightness=${analysis.brightness.toFixed(1)}, colorfulness=${analysis.colorfulness.toFixed(1)}`);
        
        // Test preprocessing pipeline
        const processed = camera.applyEnhancedPreprocessingPipeline(testCanvas);
        console.log(`✓ Preprocessing Pipeline: ${processed.width}x${processed.height}`);
        
        return analysis.brightness > 0 && processed instanceof HTMLCanvasElement;
    } catch (error) {
        console.error('✗ Preprocessing failed:', error.message);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Enhanced Camera Manager Tests...\n');
    
    const results = {
        enhancedFeatures: testEnhancedFeatures(),
        backwardCompatibility: testBackwardCompatibility(),
        cardDetectionConfig: testCardDetectionConfig(),
        imageProcessing: testImageProcessingAlgorithms(),
        enhancedPreprocessing: testEnhancedPreprocessing()
    };
    
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    let passedTests = 0;
    let totalTests = Object.keys(results).length;
    
    for (const [testName, result] of Object.entries(results)) {
        const status = result ? '✅ PASS' : '❌ FAIL';
        console.log(`${testName}: ${status}`);
        if (result) passedTests++;
    }
    
    console.log(`\n🎯 Overall Result: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! Enhanced Camera Manager is ready for use.');
        
        // Test camera support
        console.log('\n📷 Testing Camera Support...');
        try {
            const support = await CameraManager.checkCameraSupport();
            console.log('Camera Support:', support);
        } catch (error) {
            console.warn('Camera support test failed:', error.message);
        }
        
    } else {
        console.log('⚠️ Some tests failed. Please check the implementation.');
    }
    
    return results;
}

// Auto-run tests if this script is executed directly
if (typeof window !== 'undefined' && window.CameraManager) {
    runAllTests();
} else {
    console.log('📝 Test script loaded. Run runAllTests() to execute tests.');
}

// Export for manual testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAllTests, testEnhancedFeatures, testBackwardCompatibility };
}
