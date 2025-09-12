# OCR Testing Guide

This guide explains how to test and improve the MTG card name recognition.

## Step 1: Capture Test Images

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open the app in your browser and test the camera functionality

3. When you scan a card, use the new debug download buttons in the results section:
   - **📷 Original** - Downloads the full camera capture
   - **🎴 Card** - Downloads the cropped card image
   - **📝 Name** - Downloads the processed name area (this is what goes to OCR)

4. Save the downloaded images to the appropriate test directories:
   - Original images → `test-images/captured/`
   - Card images → `test-images/card/`
   - Name images → `test-images/name/`

## Step 2: Test OCR Performance

Run the OCR test script to analyze your captured images:

### Test All Images
```bash
# Test with English
npm run test-ocr

# Test with German
npm run test-ocr:deu

# Test with specific language
node test-ocr.js --lang=fra
```

### Test Single Image
```bash
# Test one specific image
node test-ocr.js test-images/name/your-image.png

# Test with experimental processing
node test-ocr.js test-images/name/your-image.png --experimental
```

## Step 3: Analyze Results

The test script will:
- Show OCR progress for each image
- Display recognized text
- Save processed images with `-processed.png` suffix
- Generate a summary report

### Understanding the Output

- ✅ **Successful**: OCR recognized text from the image
- ❌ **Failed**: No text was recognized or error occurred
- 💾 **Processed images**: Check these to see how the preprocessing affected your image

## Step 4: Improving OCR

### Common Issues and Solutions

1. **Low contrast text**
   - Try the experimental mode: `--experimental`
   - Adjust the contrast parameter in `main.js` (currently 1.5)

2. **Wrong language detection**
   - Make sure you're using the correct language code
   - Available: `eng`, `deu`, `fra`, `spa`

3. **Poor image quality**
   - Ensure good lighting when capturing
   - Check that the card name is clearly visible in the red frame
   - Make sure the camera is focused

### Modifying Image Processing

The processing logic is in both files:
- `src/main.js` - Browser version
- `test-ocr.js` - Node.js test version

Current processing:
1. Convert to grayscale: `gray = 0.299*r + 0.587*g + 0.114*b`
2. Enhance contrast: `enhanced = (gray - 128) * 1.5 + 128`

### Testing Different Parameters

Use the experimental mode to test different contrast values:

```bash
node test-ocr.js test-images/name/problematic-image.png --experimental
```

This will test:
- No processing
- Current method (contrast 1.5)
- Higher contrast (2.0)
- Lower contrast (1.2)

## Step 5: Apply Improvements

Once you find better parameters through testing:

1. Update the `processImage` method in `src/main.js`
2. Test in the web app
3. Re-run the test script to verify improvements

## Debugging Tips

### Visual Inspection
- Always check the `-processed.png` files to see preprocessing results
- Compare original name images with processed versions
- Look for artifacts or loss of text clarity

### Systematic Testing
- Test with different card types (creatures, spells, lands)
- Try various lighting conditions
- Test both English and German cards
- Include cards with different text styles

### Performance Monitoring
- Note which types of cards work best
- Track improvement over different parameter changes
- Keep successful test images as regression tests

## Advanced Testing

### Batch Processing
Create multiple images of the same card under different conditions and compare results.

### Language Comparison
```bash
# Test same image with different languages
node test-ocr.js image.png --lang=eng
node test-ocr.js image.png --lang=deu
```

### Custom Processing
Modify the `processImage` method in `test-ocr.js` to try:
- Different grayscale formulas
- Brightness adjustments
- Edge enhancement
- Noise reduction

Remember: Keep it simple! Complex processing can introduce artifacts that hurt OCR performance.
