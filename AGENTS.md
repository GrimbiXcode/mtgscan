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
- **Essential features only**: Card capture → Collector-Text Localization → Collector Number OCR → Exact API Lookup (with fallback) → Collection management

### Core Components

```
mtgscan/
├── index.html                    # Main HTML structure with modal support
├── src/
│   ├── main.js                   # App/UI logic (MTGScanner class): camera, collections, modals
│   └── recognition/               # Pure, DOM-free recognition pipeline (see below)
│       ├── canvasUtil.js         # createCanvas() abstraction (browser <canvas> vs. node-canvas)
│       ├── textLocator.js        # Finds the collector-text block anywhere in the photo, crops + binarizes it
│       ├── parsing.js            # OCR text cleanup, scoring, and collector-number parsing
│       └── pipeline.js           # Orchestrates the above into generateDetectionVariants
├── public/
│   ├── style.css                 # Clean, responsive styling
│   ├── privacy.html              # Privacy policy (German)
│   ├── terms.html                # Terms of use (German)
│   ├── imprint.html              # Legal imprint (German)
│   ├── legal-en.html             # Legal summary (English)
│   └── tesseract/                # (gitignored) Tesseract.js worker + core WASM, vendored from node_modules by the vite plugin
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

- `textLocator.js`'s `locateCollectorTextBlocks(sourceCanvas)` finds the
  collector info without assuming where the card is: it's light text on the
  card's dark bottom border, so on a ~1000px-wide grayscale copy it marks
  pixels clearly brighter than their (dark) neighbourhood, takes connected
  components of character size, groups them into lines and the lines into
  left-aligned blocks, and ranks blocks so the two-line collector block
  ("C 0064" / "BLB • DE ✒ ARTIST") wins over stray light-on-dark noise
  (art highlights, carpet texture, the copyright line). ~100ms per photo.
- `extractCollectorTextRegion()` crops a block from the full-resolution
  photo and scales it to ~48px glyphs; `binarizeCollectorText()` turns it
  into black-on-white with an Otsu threshold biased 30% towards the text
  (plain Otsu lets the bold font close the counters of "B" → read as "E").
- `pipeline.js`'s `generateDetectionVariants()` lazily yields up to 3 such
  candidates, best first, so nothing past the first convincing OCR result
  is ever cropped.
- `main.js`'s `performCollectorNumberOCRWithFallback()` OCRs them with one
  long-lived Tesseract worker (short-circuiting once a result scores ≥80),
  and `processImage()` tries the top 3 ranked OCR candidates against
  Scryfall before giving up.

## Key Features

### 1. Camera Integration
- **Full viewport display**: Shows complete camera feed, not cropped
- **Visual guides**: Red frame for card positioning, yellow area for collector number region
- **Environment camera**: Automatically uses back camera on mobile devices
- **High resolution**: Captures at optimal quality for OCR

### 2. Collector-Text Localization (`src/recognition/textLocator.js`)
- Works on hand-held, sleeved, on-the-table and tightly cropped photos alike - no fixed crop region, no card-edge detection
- Tuning constants (`MIN_CONTRAST`, `MAX_BACKGROUND`, `TARGET_TEXT_HEIGHT`, `CROP_MARGIN`, `THRESHOLD_BIAS`) were picked with `npm run benchmark`, also at `--max-width=1280`/`960` to cover camera-resolution captures
- Relies on the black card border; white-bordered or borderless cards with light text areas are not covered by fixtures yet

### 3. Language-Independent Collector Number OCR
- Tesseract.js, one worker per session (`getOcrWorker()`), English model only (collector numbers are language-independent)
- Tesseract's **default** page segmentation reads the two-line block reliably. Note: `Tesseract.recognize(img, lang, options)` only passes `options` to the worker constructor, so the PSM 13/whitelist settings the app used to pass there were never applied - use `worker.setParameters()` if you ever need them
- Runs against up to 3 located candidates, short-circuiting once a result scores ≥80

### 4. Layout-Aware Parsing (`src/recognition/parsing.js`)
- The set code is taken from the token right before the language code ("BLB • DE"), tested against an **anchored** copy of the Scryfall set regex - the unanchored one matches inside artist names ("CASTANON" → "STA")
- At that position only, common OCR swaps are repaired against the real set list (`OCR_CONFUSIONS`, e.g. "BLE" → "BLB", "EQE" → "EOE")
- The collector number is searched before the set code first; printed leading zeros are dropped ("0064" → "64"), because Scryfall 404s on `/cards/blb/0064`
- The promo star must follow the digits on the same line, so the "•" separator (often read as "*") can't turn "0064" into "0064★"

### 5. Exact Scryfall API Integration With Fallback
```javascript
// Precise collector number lookup - tries the next-best OCR candidate on a miss
async searchCardByCollectorNumber(collectorInfo) {
    const { setCode, collectorNumber, language } = parseCollectorNumber(collectorInfo, this.collectionRegex);
    const response = await fetch(
        `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${encodeURIComponent(collectorNumber)}`
    );
    // Exact match, no fuzzy search needed - collectorNumber is URL-encoded
    // (not parseInt'd) so letter suffixes and the promo star survive; the
    // parser has already dropped printed leading zeros.
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
- **Pure functions for recognition**: Pixel-processing logic (text localization, binarization, parsing) lives in DOM-free ES modules under `src/recognition/`, imported by `main.js` - keep new recognition logic there rather than adding it back into the class, so it stays usable from `sandbox/benchmark.js`
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
- Lazy load Tesseract.js only when needed: `main.js` does `import('tesseract.js')` on first OCR (npm package, not a CDN script) and keeps that one worker for the session, and the vite `vendorTesseractAssets` plugin copies its worker/core files into `public/tesseract/` so they load same-origin under `COEP: require-corp`; only the English language data still comes from the jsdelivr CDN (fetched via CORS, which COEP allows)
- Use canvas for image processing; keep debug images as canvases and only `toDataURL()` them when the debug panel shows them (encoding a 12MP photo costs hundreds of ms)
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
- Each file has one responsibility (text localization / parsing / orchestration)
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

### Operator Details in the Legal Pages
Name, address, email and hoster in `public/imprint.html`, `privacy.html`,
`terms.html` and `legal-en.html` are not hardcoded - they're
`{{LEGAL_OPERATOR_*}}` placeholders, filled from the environment with the
same variables and notation as filahub (see `.env.example`):
`LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS`, `LEGAL_OPERATOR_EMAIL`,
`LEGAL_OPERATOR_HOSTING`. Line breaks as `\n`; values are HTML-escaped.
- **Docker/Coolify**: `docker/legal-operator.sh` runs from nginx's
  `/docker-entrypoint.d/` on every container start - changing a value only
  needs a restart, not a rebuild.
- **`vite dev`/`vite preview`**: the `legalOperatorDetails` plugin in
  `vite.config.js` does the same from the shell environment / `.env`. Keep
  both renderers in sync.
- A missing value shows up on the page as `[Angabe fehlt: …]` and is logged
  at container start.

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
(`sandbox/benchmark.js`), which runs the real localization → binarization →
OCR → parsing pipeline in Node against the photos in
`sandbox/test-images/` and checks the parsed set/collector-number against
each filename's ground truth (`"<rarity> <number> <set> <lang>[ note].jpeg"`,
a macOS-style `-1` duplicate suffix is fine). The number is compared
exactly as it goes to Scryfall (no leading zeros). It reports both
first-variant and best-of-variants accuracy so a regression in the default
path is visible even if a fallback candidate still recovers, and uses the
live Scryfall set list (it needs a custom User-Agent, Scryfall 400s Node's
default one). **Run it before and after any change to `src/recognition/*`**,
also with `-- --max-width=1280` (camera-like resolution). Current baseline:
22/22 at full resolution and at 1280px, 22/22 at 960px (one via the second
candidate). The fixtures include hand-held, sleeved, table, foil and
"Breaking News" (OTP) photos, but no white-bordered/borderless cards and no
low-light shots yet. New fixtures: downscale to a 2048px long side at JPEG
quality ~85 before committing (keeps the repo small; the benchmark results
are identical to the 12MP originals).

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
- Heavy new CV/ML dependencies (e.g. OpenCV.js, a bundled model) - the collector-text localization added in October 2026 stayed in scope because it's plain canvas math (integral image, connected components), not a new dependency; weigh future detection improvements the same way
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

## Collector-Text Localization (October 2026)

Real photos (card hand-held or on a table, in a sleeve, not filling the
frame) failed completely: the July pipeline cropped a fixed lower-left
quadrant and looked for card edges inside it, which only works when the
card fills the photo. Measured on new fixtures: 0/8 real-world photos
recognized. Investigating that also turned up three bugs that hit every
scan: PSM 13/whitelist never reached Tesseract (wrong API), the
unanchored set regex picked set codes out of artist names, and leading
zeros were sent to Scryfall (`/cards/blb/0064` is a 404, so every modern
card failed the lookup even when OCR was right - the benchmark hid it by
stripping zeros before comparing).

**What changed:**
- New `textLocator.js` finds the collector block anywhere in the photo;
  the fixed-corner pipeline (`detection.js`, `foil.js`, `binarize.js`) was
  removed - on the fixtures it never recovered a single card the locator
  missed, and only added OCR runs.
- Layout-aware set-code parsing with OCR-confusion repair, zero-stripping,
  and star handling (see Key Features 4).
- One reused Tesseract worker instead of a new one per OCR attempt.
- The foil heuristic was removed: it never fired on any fixture, foil or
  not. Foil status is set with the toggle in the card modal. (On the card,
  the separator is "★" for foil vs "•" for non-foil - a possible future
  signal, but OCR reads both as "*" and the star's shape alone wasn't
  separable from letters on the two foil fixtures.)

**Result:** `npm run benchmark` 7/15 → 22/22, ~0.3s per photo in Node
(was ~3s), usually with a single OCR run.

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
