# Debug Mode Enhancement Test Checklist

## Pre-Test Setup
- [ ] Run `npm run dev` to start the development server
- [ ] Open https://localhost:3000/ in a browser
- [ ] Accept SSL certificate if prompted
- [ ] Grant camera permissions when requested

## Basic Debug Mode Tests
- [ ] Click "🔬 Debug Modus" button to enable debug mode
- [ ] Verify debug panel opens and shows all sections
- [ ] Verify debug settings show all 5 checkboxes:
  - [ ] "Alle OCR-Konfigurationen verwenden"
  - [ ] "Verarbeitungsschritte anzeigen"  
  - [ ] "Region-Extraktionen anzeigen"
  - [ ] "Bildanalyse anzeigen"
  - [ ] "OCR-Score Aufschlüsselung"

## Enhanced Debug Features Tests

### 1. Processing Steps Visualization
- [ ] Enable "Verarbeitungsschritte anzeigen"
- [ ] Scan a card with debug mode active
- [ ] Verify "Processing Steps" section appears
- [ ] Check that 4 processing steps are shown:
  - [ ] Initial Canvas
  - [ ] Size Optimization  
  - [ ] Content Enhancement
  - [ ] Text Sharpening
- [ ] Verify each step shows a preview image
- [ ] Test download functionality for each step
- [ ] Verify step descriptions are informative

### 2. Region Extraction Visualization
- [ ] Enable "Region-Extraktionen anzeigen"
- [ ] Scan a card with debug mode active
- [ ] Verify "Region Extraction Results" section appears
- [ ] Check that multiple strategies are shown (up to 5)
- [ ] Verify each strategy shows:
  - [ ] Quality score with color coding
  - [ ] Preview image of extracted region
  - [ ] Technical details (aspect ratio, size ratio, etc.)
  - [ ] Download button for region image
- [ ] Verify winning strategy is highlighted with ✅
- [ ] Test region image downloads

### 3. Image Analysis Results
- [ ] Enable "Bildanalyse anzeigen"  
- [ ] Scan a card with debug mode active
- [ ] Verify "Image Analysis Results" section appears
- [ ] Check brightness analysis shows:
  - [ ] Average brightness value
  - [ ] Low/high light detection status
- [ ] Check color analysis shows:
  - [ ] Colorfulness measurement
  - [ ] Color detection status
- [ ] Check processing decisions show:
  - [ ] Enhancement needs assessment
  - [ ] List of applied corrections

### 4. OCR Score Breakdown
- [ ] Enable "OCR-Score Aufschlüsselung"
- [ ] Enable "Alle OCR-Konfigurationen verwenden"  
- [ ] Scan a card with debug mode active
- [ ] Verify "OCR Score Breakdown" section appears
- [ ] Check detailed scoring shows for each configuration:
  - [ ] Base score
  - [ ] Length bonus/penalty
  - [ ] Position bonuses  
  - [ ] First line bonuses
  - [ ] Word count scoring
  - [ ] Source bonuses
  - [ ] Letter composition scores
  - [ ] Final calculated score

## Control Tests
- [ ] Disable individual debug features and verify sections hide
- [ ] Re-enable features and verify sections reappear
- [ ] Test "🔄 OCR erneut testen" button with different settings
- [ ] Verify debug log updates with processing information

## UI/UX Tests  
- [ ] Verify responsive design on mobile device/small screen
- [ ] Test dark mode compatibility (if browser supports)
- [ ] Check that debug sections are visually organized
- [ ] Verify download buttons work and generate meaningful filenames
- [ ] Test debug mode cleanup when closing debug panel

## Error Handling Tests
- [ ] Test debug mode with poor quality images
- [ ] Test with cards that have difficult text to read
- [ ] Verify graceful handling of failed region extractions
- [ ] Test OCR timeout scenarios

## Performance Tests
- [ ] Monitor console for errors during debug operations
- [ ] Verify debug mode doesn't significantly slow down processing
- [ ] Check memory usage with multiple debug images generated
- [ ] Test cleanup when debug mode is disabled

## Integration Tests
- [ ] Test normal scanning workflow with debug mode disabled
- [ ] Verify debug enhancements don't break existing functionality
- [ ] Test export functionality still works with debug mode active
- [ ] Verify manual input still works properly

## Browser Compatibility
- [ ] Test on Chrome/Chromium
- [ ] Test on Firefox  
- [ ] Test on Safari (macOS/iOS)
- [ ] Test on mobile browsers

## Expected Outcomes
✅ **Success Criteria:**
- All debug sections display correctly with meaningful data
- Image downloads work and contain expected content
- Debug settings control visibility as expected
- No console errors during normal operation
- Performance remains acceptable
- Original functionality remains intact

❌ **Failure Indicators:**
- Debug sections don't appear or show empty data
- Console errors during debug operations
- Significant performance degradation  
- Broken download functionality
- UI layout issues on mobile devices
- Interference with normal scanning workflow

## Troubleshooting Notes
- If camera doesn't start, ensure HTTPS is being used
- If debug sections don't appear, check browser console for JavaScript errors
- If downloads fail, check browser download permissions
- If images appear black, verify canvas drawing operations are working
