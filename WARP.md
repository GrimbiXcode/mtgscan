# MTG Scanner - Simple & Focused

## Project Overview

A simplified Magic: The Gathering card scanner that focuses on core functionality without overengineering. The app captures card images through a camera, uses OCR to recognize collector numbers, and builds a digital collection using exact Scryfall API lookups.

## Architecture Principles

### Simplicity First
- **One file, one responsibility**: Clean separation between HTML structure, CSS styling, and JavaScript logic
- **No complex frameworks**: Vanilla JavaScript with minimal external dependencies
- **Essential features only**: Card capture → Collector Number OCR → Exact API Lookup → Collection management

### Core Components

```
mtgscan/
├── index.html              # Main HTML structure with modal support
├── src/
│   └── main.js             # Application logic (single MTGScanner class)
├── public/
│   ├── style.css           # Clean, responsive styling
│   ├── privacy.html        # Privacy policy (German)
│   ├── terms.html          # Terms of use (German)
│   ├── imprint.html        # Legal imprint (German)
│   └── legal-en.html       # Legal summary (English)
├── assets/
│   └── default-card.png    # Placeholder card image
├── sandbox/
│   ├── OCR-TESTING.md      # Comprehensive testing guide
│   ├── test-ocr.js         # OCR testing script
│   ├── test-ocr-advanced.js # Advanced OCR analysis
│   └── test-images/        # Test image collections
├── Dockerfile              # Production containerization
├── vite.config.js          # Vite config with HTTPS support
└── package.json            # Dependencies and scripts
```

## Key Features

### 1. Camera Integration
- **Full viewport display**: Shows complete camera feed, not cropped
- **Visual guides**: Red frame for card positioning, yellow area for collector number region
- **Environment camera**: Automatically uses back camera on mobile devices
- **High resolution**: Captures at optimal quality for OCR

### 2. Optimized Collector Number Processing
```javascript
// High contrast inversion for collector numbers
processCollectorNumberImage(canvas) {
    // Convert to grayscale
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // High contrast enhancement (2.5x factor)
    const enhanced = (gray - 128) * 2.5 + 128;
    
    // Invert colors (white text on dark background → black on white)
    const inverted = 255 - enhanced;
}
```

### 3. Precise Collector Number Cropping
- **Step 1**: Capture full camera image
- **Step 2**: Crop to card frame (red border area)
- **Step 3**: Crop to collector number area (bottom-left, optimized coordinates: x=0.1%, y=90%, w=20%, h=8%)
- **Step 4**: Apply high-contrast inversion processing for OCR

### 4. Language-Independent Collector Number OCR
- Tesseract.js with optimized configuration for collector numbers
- Always uses English language model (collector numbers are language-independent)
- PSM mode 13 (raw line) with alphanumeric whitelist
- Focuses on extracting format: "SET RARITY NUMBER" (e.g., "FDN U 0125")

### 5. Exact Scryfall API Integration
```javascript
// Precise collector number lookup
async searchCardByCollectorNumber(collectorInfo) {
    const { setCode, collectorNumber } = this.parseCollectorNumber(collectorInfo);
    const response = await fetch(
        `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`
    );
    // Exact match, no fuzzy search needed
}
```

## UI/UX Design

### Visual Hierarchy
1. **Header**: App title and recognition method indicator ("Language Independent")
2. **Camera Section**: Live preview with positioning guides
3. **Processing**: Progress bar and status updates
4. **Results**: Card preview and add/retry options
5. **Collection**: Grid display with basic management

### Responsive Design
- Mobile-first approach
- Touch-friendly buttons
- Flexible card grid
- Collapsible sections on smaller screens

### User Flow
```
Start Camera → Position Card → Capture → Crop to Collector → OCR → Exact API Lookup → Add to Collection
     ↓              ↓           ↓           ↓            ↓         ↓              ↓
  Full preview   Visual guide   Card     Collector#   Parse   Scryfall      LocalStorage
```

## Technical Decisions

### Why Simple?
- **Maintainable**: Single developer can understand entire codebase
- **Reliable**: Fewer moving parts = fewer failure points
- **Fast**: No complex algorithms causing performance issues
- **Debuggable**: Clear flow from input to output

### What We Removed
- Complex CLAHE histogram equalization (caused grid artifacts)
- Multiple region extraction strategies
- Advanced noise reduction algorithms
- Name-based OCR with language detection
- German OCR retry mechanisms
- Complex image analysis functions
- Fuzzy card name search
- Language selection dropdown
- Multiple preprocessing pipelines for different languages

### What We Kept
- Clean, modern UI
- Optimized collector number image processing
- Exact Scryfall API integration
- Local storage for collection
- Progress feedback
- Error handling
- Fallback OCR strategies for better recognition

## Development Guidelines

### Code Style
- **ES6+ Classes**: Single `MTGScanner` class
- **Async/Await**: For all asynchronous operations
- **Error Handling**: Try-catch blocks with user feedback
- **No Global State**: Everything contained in class instance

### Adding Features
Before adding any new feature, ask:
1. Is this essential for the core use case?
2. Does this add complexity without significant benefit?
3. Can this be implemented simply?
4. Will users actually use this?

### Performance
- Lazy load Tesseract.js only when needed
- Use canvas for image processing
- Store collection in localStorage
- Minimal DOM manipulation

## File Structure Details

### `index.html`
- Semantic HTML5 structure
- Progressive enhancement approach
- No inline styles or scripts
- Accessible form elements

### `src/main.js`
- Single class architecture
- Clear method separation
- Event-driven flow
- Error boundaries

### `src/style.css`
- CSS Grid for layouts
- CSS Custom Properties for theming
- Mobile-first responsive design
- Utility classes for common patterns

## Local Development

```bash
# Start development server
npm run dev

# Open browser to localhost:3000 (or next available port)
# Camera requires HTTPS in production
```

## Production Considerations

### Hosting Requirements
- HTTPS required for camera access
- Static file hosting (Netlify, Vercel, GitHub Pages)
- No server-side requirements

### Performance
- Tesseract.js loads ~2MB on first OCR (English model only)
- Images processed client-side with optimized collector number pipeline
- Collection stored locally
- Network only for exact Scryfall API lookups
- Faster recognition due to simpler OCR target (numbers vs stylized text)

### Browser Support
- Modern browsers with WebRTC camera support
- Chrome, Safari, Firefox, Edge
- Mobile browsers on iOS/Android

## Future Enhancements (If Needed)

### Potential Simple Additions
- Card count tracking
- Export to CSV/Excel
- Basic statistics
- Backup/restore from file
- Share collection link

### Things to Avoid
- Complex image processing algorithms
- Real-time video processing
- Multi-language OCR support
- Fuzzy text matching
- Database integrations
- User authentication
- Cloud sync (unless essential)
- Reverting to name-based recognition

## Recent Evolution: From Name-Based to Collector Number Recognition

### Why We Switched (December 2024)

**The Problem with Name-Based OCR:**
- Language dependency created complexity (German, English, French support)
- Fuzzy card name matching was unreliable
- OCR struggled with stylized card name fonts
- Multiple retry mechanisms made code complex
- False positives from similar card names

**The Collector Number Solution:**
- **Language Independent**: Collector numbers are standardized across all languages
- **Exact Match**: No fuzzy search needed - precise Scryfall API lookup
- **Better OCR Target**: Numbers and simple letters are easier to recognize
- **Unique Identification**: Collector numbers uniquely identify cards within sets
- **Simplified Processing**: Single optimized image processing pipeline

### Code Cleanup Impact

**Removed Functions (500+ lines of complexity):**
- `cropToNameArea()` - Name region extraction
- `processImageForOCR()` - Language-aware image processing
- `performOCR()` - Multi-language OCR with German fallbacks
- `retryGermanOCR()` - German-specific retry mechanisms
- `searchCard()` - Fuzzy name-based search
- `analyzeOCRResult()` - OCR confidence analysis
- Language selection dropdown and related UI

**Result: 40% smaller codebase, 100% more reliable**

## Lessons Learned

### From Complex Version
- **Over-engineering kills usability**: Complex CLAHE caused visible grid artifacts
- **Debug features become maintenance burden**: Extensive debugging slowed core functionality
- **Multiple strategies create confusion**: Simple approach often works better
- **Performance matters**: Complex algorithms caused UI freezes

### From Name-Based to Collector Numbers
- **Language independence beats multilingual complexity**: One approach works everywhere
- **Exact matching beats fuzzy search**: Precision over flexibility
- **OCR works better on simple targets**: Numbers > stylized text
- **Unique identifiers eliminate ambiguity**: No more "Lightning Bolt" vs "Lightning Bolt (Reprint)"

### Simplicity Wins
- **Users want core functionality to work reliably**
- **Visual guides are more helpful than perfect algorithms**
- **Progressive enhancement beats feature bloat**
- **Clean code is maintainable code**
- **Domain-specific solutions beat general-purpose complexity**

---

*"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry*
