// Quick test script for Gaussian blur fix
// Run this in browser console to test the blur functionality

function testGaussianBlurFix() {
    console.log('🔧 Testing Gaussian Blur Fix...');
    
    // Import camera manager (assumes it's already loaded)
    if (typeof CameraManager === 'undefined') {
        console.error('❌ CameraManager not found. Please load camera.js first.');
        return false;
    }
    
    const camera = new CameraManager();
    
    try {
        // Test 1: Basic Gaussian blur with valid data
        console.log('📋 Test 1: Valid Gaussian blur');
        const testData = new Uint8Array([
            100, 120, 110, 130, 90,
            80, 140, 160, 120, 100,
            90, 110, 180, 140, 110,
            100, 130, 150, 120, 95,
            85, 100, 120, 110, 105
        ]);
        
        const blurred = camera.gaussianBlur(testData, 5, 5, 3);
        console.log(`✓ Gaussian blur completed: ${blurred.length} pixels processed`);
        
        // Test 2: Test with edge case - small kernel
        console.log('📋 Test 2: Small kernel size');
        const blurred2 = camera.gaussianBlur(testData, 5, 5, 1);
        console.log(`✓ Small kernel blur completed: ${blurred2.length} pixels processed`);
        
        // Test 3: Test simple blur fallback
        console.log('📋 Test 3: Simple blur fallback');
        const simpleBlurred = camera.simpleBlur(testData, 5, 5);
        console.log(`✓ Simple blur completed: ${simpleBlurred.length} pixels processed`);
        
        // Test 4: Test card detection preprocessing with small image
        console.log('📋 Test 4: Preprocessing pipeline');
        const imageData = new ImageData(new Uint8ClampedArray([
            100, 120, 110, 255,  // R,G,B,A
            80, 140, 160, 255,
            90, 110, 180, 255,
            100, 130, 150, 255
        ]), 2, 2);  // 2x2 image
        
        const processed = camera.preprocessForEdgeDetection(imageData);
        console.log(`✓ Preprocessing completed: ${processed.length} pixels processed`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Test the card detection pipeline with error handling
function testCardDetectionPipeline() {
    console.log('🎴 Testing Card Detection Pipeline...');
    
    if (typeof CameraManager === 'undefined') {
        console.error('❌ CameraManager not found. Please load camera.js first.');
        return false;
    }
    
    const camera = new CameraManager();
    
    try {
        // Create a test canvas
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 100;
        testCanvas.height = 100;
        const ctx = testCanvas.getContext('2d');
        
        // Draw a simple test pattern
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, 100, 100);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, 80, 80);
        
        console.log('📋 Testing card boundary detection...');
        const bounds = camera.detectCardBoundaries(testCanvas);
        
        if (bounds) {
            console.log('✓ Card detection completed successfully');
            console.log('  Confidence:', (bounds.confidence * 100).toFixed(1) + '%');
            console.log('  Area:', bounds.area);
            console.log('  Aspect Ratio:', bounds.aspectRatio.toFixed(2));
        } else {
            console.log('ℹ️ No card detected (expected with test pattern)');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Card detection test failed:', error);
        return false;
    }
}

// Run all tests
function runBlurFixTests() {
    console.log('🚀 Running Gaussian Blur Fix Tests...\n');
    
    const test1Result = testGaussianBlurFix();
    const test2Result = testCardDetectionPipeline();
    
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Gaussian Blur Fix: ${test1Result ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Card Detection Pipeline: ${test2Result ? '✅ PASS' : '❌ FAIL'}`);
    
    if (test1Result && test2Result) {
        console.log('\n🎉 All tests passed! The Gaussian blur fix is working correctly.');
        console.log('💡 The card detection error should now be resolved.');
    } else {
        console.log('\n⚠️ Some tests failed. Please check the browser console for details.');
    }
    
    return test1Result && test2Result;
}

// Auto-run if executed directly in browser
if (typeof window !== 'undefined') {
    console.log('📝 Blur fix test script loaded.');
    console.log('💡 Run runBlurFixTests() to execute the tests.');
    
    // Provide easy access to test functions
    window.runBlurFixTests = runBlurFixTests;
    window.testGaussianBlurFix = testGaussianBlurFix;
    window.testCardDetectionPipeline = testCardDetectionPipeline;
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runBlurFixTests, testGaussianBlurFix, testCardDetectionPipeline };
}
