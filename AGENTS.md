# MTG Scanner - Agent Guide

This file is the generic, tool-agnostic architecture/dev guide for coding
agents working in this repo (Claude, Cursor, Codex, Warp, etc.). It was
previously named `WARP.md`; keep it updated as the app evolves rather than
letting a second, stale doc drift.

## Project Overview

A simplified Magic: The Gathering card scanner that focuses on core functionality without overengineering. The app captures card images through a camera, uses OCR to recognize collector numbers, and builds a digital collection using exact Scryfall API lookups.

## Architecture Principles

### Simplicity First
- **Clean separation**: HTML structure, CSS styling, app/UI logic, and the recognition pipeline each live in their own place
- **No complex frameworks**: Vanilla JavaScript with minimal external dependencies
- **Essential features only**: Card capture → Card Region Detection → Collector Number OCR → Exact API Lookup (with fallback) → Collection management

### Core Components

```
mtgscan/
├── index.html                    # Main HTML structure with modal support
├── src/
│   ├── main.js                   # App/UI logic (MTGScanner class): camera, collections, modals
│   └── recognition/               # Pure, DOM-free recognition pipeline (see below)
│       ├── canvasUtil.js         # createCanvas() abstraction (browser <canvas> vs. node-canvas)
│       ├── detection.js          # Card-edge detection (Otsu + gradient) and text-line detection
│       ├── foil.js               # Foil-card heuristic (color variance / brightness distribution)
│       ├── binarize.js           # Foil-aware binarization for OCR
│       ├── parsing.js            # OCR text cleanup, scoring, and collector-number parsing
│       └── pipeline.js           # Orchestrates the above into detectCardRegion / runDetectionVariants
├── public/
│   ├── style.css                 # Clean, responsive styling
│   ├── privacy.html              # Privacy policy (German)
│   ├── terms.html                # Terms of use (German)
│   ├── imprint.html              # Legal imprint (German)
│   └── legal-en.html             # Legal summary (English)
├── assets/
│   └── default-card.png          # Placeholder card image
├── sandbox/
│   ├── benchmark.js               # End-to-end accuracy benchmark (npm run benchmark)
│   └── test-images/               # Real card photo fixtures, ground truth in the filename
├── Dockerfile                     # Production containerization
├── vite.config.js                 # Vite config with HTTPS support
└── package.json                   # Dependencies and scripts
```

### Recognition Pipeline Architecture

The recognition code in `src/recognition/` is intentionally DOM-free (it only
touches `canvas`/`ImageData` APIs and takes an injectable `createCanvas`), so
the exact same code runs in the browser and in Node for `sandbox/benchmark.js`.
`main.js` imports it and orchestrates capture, UI, and Scryfall lookups
around it - it does not contain any pixel-processing logic itself.

- `pipeline.js`'s `detectCardRegion(sourceCanvas, options, createCanvas)` runs
  one full pass: quadrant crop → bottom/left edge detection → foil read →
  text-line crop → foil-aware binarization → OCR-ready canvas.
- `runDetectionVariants(sourceCanvas, createCanvas)` runs `detectCardRegion`
  a handful of times with different options (default crop, a wider crop, a
  flipped foil path, and - only when the two edge signals disagreed - the
  alternate edge signal), capped at 4 variants, so the caller can try OCR
  against more than one candidate image.
- Edge detection (`detection.js`) combines two independent signals instead of
  a single fixed black-pixel threshold: an Otsu-adaptive threshold (handles
  varying lighting) and a gradient-energy profile (handles cards that aren't
  black-bordered, e.g. borderless/extended-art). They're expected to agree on
  a normal bordered photo; on disagreement Otsu is preferred by default and
  the gradient signal is retried as a separate "edge-disagreement" variant.
- `main.js`'s `performCollectorNumberOCRWithFallback()` runs OCR against each
  variant (short-circuiting once a result scores ≥80), and `processImage()`
  tries the top 3 ranked OCR candidates against Scryfall before giving up.

## Key Features

### 1. Camera Integration
- **Full viewport display**: Shows complete camera feed, not cropped
- **Visual guides**: Red frame for card positioning, yellow area for collector number region
- **Environment camera**: Automatically uses back camera on mobile devices
- **High resolution**: Captures at optimal quality for OCR

### 2. Foil-Aware Collector Number Processing (`src/recognition/binarize.js`)
```javascript
// Standard (non-foil) high contrast inversion for collector numbers
processNormalCollectorNumber(data) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * 2.5 + 128));
    const inverted = 255 - enhanced; // white text on dark background -> black on white
}
```
Foil cards go through `processFoilCollectorNumber()` instead, which uses a
brightness-adaptive threshold rather than the fixed 2.5x curve above - foil
shimmer needs different handling than a flat print.

### 3. Adaptive Card-Edge & Text-Line Detection (`src/recognition/detection.js`)
- **Step 1**: Crop to the lower-left portion of the frame (default 60% width/height; a wider 85% variant is tried when the default crop misses)
- **Step 2/3**: Find the bottom/left card edge using **both** an Otsu-adaptive threshold and a gradient-energy profile - not a single fixed black-pixel threshold - so borderless/extended-art cards and non-ideal lighting are tolerated. On disagreement, both hypotheses get tried (see `runDetectionVariants`)
- **Step 4**: Locate the collector-number text line via combined brightness/edge-density/text-pattern heuristics, with a "bottom 15%" fallback if inconclusive
- **Step 5**: Run foil detection on the actual text strip (not the whole card corner) and binarize accordingly

### 4. Language-Independent Collector Number OCR
- Tesseract.js with optimized configuration for collector numbers
- Always uses English language model (collector numbers are language-independent)
- PSM mode 13 (raw line) with an alphanumeric + `*` whitelist (the `*` is the closest OCR-recognizable proxy for a promo `★`)
- Runs against multiple detection variants (see Recognition Pipeline Architecture above), short-circuiting once a result scores ≥80
- Focuses on extracting format: "SET RARITY NUMBER" (e.g., "FDN U 0125"), now also accepting 1-2 digit numbers and letter suffixes ("150a")

### 5. Exact Scryfall API Integration With Fallback
```javascript
// Precise collector number lookup - tries the next-best OCR candidate on a miss
async searchCardByCollectorNumber(collectorInfo) {
    const { setCode, collectorNumber, language } = parseCollectorNumber(collectorInfo, this.collectionRegex);
    const response = await fetch(
        `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${encodeURIComponent(collectorNumber)}`
    );
    // Exact match, no fuzzy search needed - collectorNumber is URL-encoded
    // (not parseInt'd) so letter suffixes and the promo star survive.
}
```
`processImage()` calls this against the top 3 ranked OCR candidates in
order, and on a low-confidence or failed match shows an editable
"Sammlernummer korrigieren" field instead of a dead end.

## UI/UX Design

### Visual Hierarchy
1. **Header**: App title and recognition method indicator ("Language Independent")
2. **Camera Section**: Live preview with positioning guides
3. **Processing**: Progress bar and status updates
4. **Results**: Card preview, confidence badge (medium/low matches only), and add/retry options - or an editable collector-number field if no card was found
5. **Collection**: Grid display with basic management

### Responsive Design
- Mobile-first approach
- Touch-friendly buttons
- Flexible card grid
- Collapsible sections on smaller screens

### User Flow
```
Start Camera → Position Card → Capture → Detect Region (multi-variant) → OCR (ranked) → Scryfall Lookup (tries top 3) → Add to Collection
                                                                                              ↓ (all miss)
                                                                                    Editable manual-correction field
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
- **ES6+ Classes**: App/UI logic lives in the single `MTGScanner` class (`src/main.js`)
- **Pure functions for recognition**: Pixel-processing logic (detection, foil, binarization, parsing) lives in DOM-free ES modules under `src/recognition/`, imported by `main.js` - keep new recognition logic there rather than adding it back into the class, so it stays usable from `sandbox/benchmark.js`
- **Async/Await**: For all asynchronous operations
- **Error Handling**: Try-catch blocks with user feedback
- **No Global State**: Everything contained in class instance or passed explicitly between recognition functions

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
- Single class architecture (camera, UI, collections, modals)
- Delegates all pixel-processing to `src/recognition/*`
- Clear method separation
- Event-driven flow
- Error boundaries

### `src/recognition/`
- DOM-free pure functions and small data objects only - no `document.*` calls
- Each file has one responsibility (detection / foil / binarize / parsing / orchestration)
- Must stay runnable from both the browser and Node (`sandbox/benchmark.js`)

### `public/style.css`
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

## Collection Management System (December 2024)

### Multi-Collection Support
The app now supports multiple collections with full CRUD operations:

**Data Structure:**
```javascript
// Collections metadata (localStorage: 'mtg-collections-meta')
{
  "collections": {
    "coll_timestamp_randomid": {
      "id": "coll_timestamp_randomid",
      "name": "Standard Deck",
      "createdAt": "2024-12-23T20:00:00Z",
      "lastModified": "2024-12-23T20:30:00Z",
      "cardCount": 60
    }
  },
  "activeCollection": "coll_timestamp_randomid"
}

// Individual collections (localStorage: 'mtg-collection-{id}')
[...cards with existing structure...]
```

**Key Features:**
- **Collection Management Modal**: Create, rename, delete collections
- **Collection Selector**: Dropdown to switch between collections
- **Metadata Tracking**: Creation date, last modified, card count
- **Automatic Migration**: Existing collections are migrated seamlessly
- **Responsive Design**: Mobile-friendly collection management

**UI Components:**
- Collection header with name and card count
- Collection dropdown selector
- "Sammlungen verwalten" button opens management modal
- Modal shows all collections with metadata and actions

**Safety Features:**
- Cannot delete the last remaining collection
- Confirmation dialog for collection deletion
- Duplicate name prevention
- Automatic switching if active collection is deleted

### Migration Strategy
```javascript
// Old format (localStorage: 'mtg-collection')
[...cards...]

// Automatically migrates to new multi-collection system
// Creates default collection "Meine Sammlung"
// Preserves all existing cards and metadata
```

## Development Notes

### Testing During Development
**Important**: For testing purposes, do not start the web server with `npm run dev` - the web server should already be running during development. Only run scripts and check functionality without restarting the server.

### Testing the Recognition Pipeline
There is no unit test suite; accuracy is checked with `npm run benchmark`
(`sandbox/benchmark.js`), which runs the real detection → foil detection →
binarization → OCR → parsing pipeline in Node against the photos in
`sandbox/test-images/` and checks the parsed set/collector-number against
each filename's ground truth (`"<rarity> <number> <set> <lang>[ note].jpeg"`).
It reports both primary-only accuracy and best-of-variants accuracy so a
regression in the default path is visible even if a fallback variant still
recovers. **Run it before and after any change to `src/recognition/*`** to
catch regressions - the current baseline is 7/8 fixtures passing (the one
failure is a deliberately annotated debug image, not a real-world case).
The fixture set has no borderless/showcase-frame, foil, low-light, or
rotated examples yet; add more `.jpeg` files following the naming
convention above if you need to validate those cases.

### Collection System Implementation
1. **Initialization Order**: Collections system initializes after DOM elements are ready
2. **Data Persistence**: Each collection stored separately in localStorage
3. **UI Updates**: All collection switches update both dropdown and display
4. **Error Handling**: Graceful fallbacks for missing collections or corrupted data

## Future Enhancements (If Needed)

### Potential Simple Additions
- Collection export (individual or all collections)
- Collection import/merge functionality
- Basic collection statistics
- Collection templates for common deck types
- Backup/restore from file with collection preservation
- Share collection link

### Things to Avoid
- Heavy new CV/ML dependencies (e.g. OpenCV.js, a bundled model) - the Otsu/gradient edge detection added in July 2026 stayed in scope because it's a few dozen lines of plain canvas math, not a new dependency; weigh future detection improvements the same way
- Real-time video processing
- Multi-language OCR support
- Fuzzy text matching
- Database integrations
- User authentication
- Cloud sync (unless essential)
- Reverting to name-based recognition
- Over-complicating collection hierarchy (folders/subfolders)

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

## Recognition Accuracy Overhaul (July 2026)

The collector-number pipeline had drifted into an unreliable, unmeasured
state: a single fixed black-pixel threshold for card-edge detection (no
tolerance for borderless/extended-art cards or poor lighting), a regex that
silently rejected valid 1-2 digit collector numbers, only one OCR attempt
per scan despite docs describing a multi-strategy fallback that no longer
existed in the code, a `searchCardFallback()` that was a stub always
returning `null`, and no automated way to measure accuracy at all.

**What changed:**
- Extracted the pixel-processing pipeline out of `MTGScanner` into
  `src/recognition/*` (DOM-free, testable from Node) and added
  `sandbox/benchmark.js` as the first real accuracy measurement.
- Replaced the fixed threshold with Otsu-adaptive + gradient-energy edge
  detection (see Recognition Pipeline Architecture above).
- Fixed the collector-number regex (1-5 digits, suffixes, promo star) and
  switched from `parseInt` to `encodeURIComponent` for the Scryfall lookup
  so suffixes survive.
- Replaced the single OCR attempt + dead-end fallback with real multi-variant
  detection/OCR and multi-candidate Scryfall lookup.
- Added a confidence badge and an editable manual-correction field instead
  of a dead-end "unknown card" state.

**Result:** `npm run benchmark` went from no measurement at all to a
reproducible 7/8 (88%) baseline on the existing fixtures - re-run it before
trusting any further change to the recognition pipeline.

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
