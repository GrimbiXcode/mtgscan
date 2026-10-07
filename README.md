# 🎴 MTG Scanner

> ⚠️ **Unofficial Fan Project** • No affiliation with Wizards of the Coast, Magic: The Gathering, or Hasbro • All card data from Scryfall API

A sophisticated yet simple Magic: The Gathering card scanner that captures cards through your device camera, uses advanced OCR to recognize collector numbers, and builds your digital collection with foil/normal tracking and multi-collection management.

## ✨ Key Features

### 🚀 **Core Scanning Technology**
- **📱 Advanced Camera Integration**: Full viewport display with adjustable frame sizing and visual guides
- **🔢 Language-Independent Recognition**: Uses collector numbers for universal card identification across all MTG languages
- **🎯 Smart OCR Engine**: Finds the collector number anywhere in the photo - hand-held, on a table, in a sleeve - and tries the next-best candidate before giving up
- **📸 Upload Support**: Scan existing photos in addition to live camera capture
- **🔦 Flash Control**: Automatic flash detection and toggle for optimal lighting

### 📚 **Collection Management System** 
- **🗂️ Multi-Collection Support**: Create, manage, and switch between unlimited collections
- **🏷️ Smart Card Tracking**: Separate foil and normal versions with quantity management
- **🌍 Language Detection**: Automatic language recognition and display (English, German, French, etc.)
- **📊 Collection Analytics**: Real-time card counts and collection statistics
- **💾 Robust Data Storage**: Local storage with automatic migration and backup systems
- **📤 Moxfield Export**: Generate CSV files compatible with popular MTG platforms

### 🎨 **User Experience**
- **📐 Adjustable Frame Size**: Customize scanning area for different card sizes and distances
- **🎭 Visual Foil Effects**: Modal UI reflects foil status with shimmer effects
- **🔔 Smart Notifications**: Contextual success, warning, and error messages
- **📱 Mobile-First Design**: Optimized for phones with responsive desktop support
- **🛠️ Debug Mode**: Advanced troubleshooting tools for OCR analysis
- **⚡ Performance Optimized**: Image caching and lazy loading for smooth operation

## 🌟 Why Collector Numbers?

Traditional MTG scanners struggle with card names due to:
- Language dependencies (German, English, French variations)
- Stylized fonts that confuse OCR
- Complex fuzzy matching algorithms
- False positives from similar names

**MTG Scanner uses collector numbers instead:**
- ✅ **Language Independent**: Collector numbers are standardized globally
- ✅ **Exact Matching**: No fuzzy search needed - precise API lookups
- ✅ **Better OCR Target**: Simple numbers are easier to recognize than stylized text  
- ✅ **Unique Identification**: Every card has a unique set/number combination
- ✅ **Simpler Processing**: Single optimized image pipeline

## 🚀 Quick Start

### Prerequisites

- Modern web browser with camera support (Chrome, Safari, Firefox, Edge)
- Node.js (for development server)

### Installation

```bash
# Clone the repository
git clone https://github.com/grimbixcode/mtgscan.git
cd mtgscan

# Install dependencies
npm install

# Start development server
npm run dev
```

Open your browser to `http://localhost:3000` (or the port shown in terminal).

**Note**: Camera access on mobile devices requires HTTPS in production. The dev server should handle this automatically.
If not, you may have to generate certificate files by yourself.

## 📱 How to Use

1. **Start Camera**: Tap "📷 Kamera starten" to begin
2. **Position Card**: Align card within the red frame guide
3. **Focus on Collector Number**: Ensure the collector number (bottom-left) is in the yellow highlighted area
4. **Capture**: Tap "📸 Karte scannen"
5. **Review & Add**: Verify the recognized card and add to your collection

### Alternative: Upload Images

Don't have a card handy? Use "📁 Bild hochladen" to test with existing card photos.

## 🏗️ Project Structure

```
mtgscan/
├── index.html                    # Main HTML structure with modal support
├── src/
│   ├── main.js                   # Core application logic (MTGScanner class)
│   └── recognition/              # DOM-free recognition pipeline (text localization, parsing, orchestration)
├── public/
│   ├── style.css                 # Responsive styling with foil effects
│   ├── privacy.html              # Privacy policy (German)
│   ├── terms.html                # Terms of use (German)
│   ├── imprint.html              # Legal imprint (German)
│   └── legal-en.html             # Legal summary (English)
├── assets/
│   └── default-card.png          # Placeholder card image
├── sandbox/                      # Recognition accuracy benchmark
│   ├── benchmark.js              # End-to-end accuracy benchmark (npm run benchmark)
│   └── test-images/              # Real card photo fixtures (ground truth in filename)
├── .github/
│   └── FUNDING.yml               # GitHub Sponsors configuration
├── Dockerfile                    # Production containerization
├── ProductionDockerDeploymentGuide.md # Docker deployment instructions
├── vite.config.js                # Vite configuration with HTTPS support
├── package.json                  # Dependencies and npm scripts
└── AGENTS.md                     # Comprehensive development/agent guide
```

### Core Architecture Principles

- **Single Class + Pure Recognition Modules**: UI/app state lives in the `MTGScanner` class; pixel-processing logic lives in DOM-free modules under `src/recognition/` so it's testable from Node
- **Event-Driven Flow**: Clean separation between UI events, OCR processing, and data management  
- **Progressive Enhancement**: Works without JavaScript for static legal pages
- **Mobile-First Responsive**: Optimized for phones with desktop compatibility
- **Zero Server Dependencies**: Everything runs client-side for privacy and simplicity
- **Modular OCR Pipeline**: Up to 3 located collector-text candidates tried per scan, ranked by OCR plausibility, with fallback to the next-best Scryfall match on a miss

### File Organization Notes

- **CSS in public/**: `style.css` is in the `public/` directory to ensure both the main app and static legal pages can reference it correctly in production builds
- **Static Legal Pages**: Privacy policy, terms, and imprint are static HTML files that don't require build processing
- **Vite Build Handling**: The main app's CSS gets bundled and optimized, while public files are copied as-is

## 🔧 Advanced Technical Features

### 🧪 Collector-Number Pipeline

1. **Full Resolution Capture**: High-quality image acquisition from camera or upload
2. **Collector-Text Localization**: The collector info is light text on the card's dark bottom border, so the pipeline looks for exactly that anywhere in the photo: light-on-dark pixels → character-sized blobs → text lines → left-aligned two-line blocks. No assumption about where the card sits, how big it is, or what's behind it
3. **Crop & Binarize**: The best blocks are cut from the full-resolution photo, scaled to ~48px glyphs and binarized (Otsu, biased towards the text so the bold "B" keeps its counters)
4. **OCR With Early Exit**: One long-lived Tesseract worker reads the candidates best-first and stops at the first convincing result (usually the first)
5. **Layout-Aware Parsing**: The set code is the token right before the language code ("BLB • DE"); common OCR swaps there ("BLE" → "BLB") are repaired against the real Scryfall set list. Collector numbers lose their printed leading zeros ("0064" → "64"), as Scryfall expects, and keep letter suffixes/promo stars
6. **Exact Scryfall Lookup**: The top 3 ranked candidates are tried against Scryfall before an editable correction field is shown

### 💻 Key Code Innovations

All recognition logic lives in `src/recognition/` as small, DOM-free modules - see [`AGENTS.md`](AGENTS.md) for the full pipeline breakdown. A few representative excerpts:

**Light-on-Dark Text Mask** (`src/recognition/textLocator.js`):
```javascript
// A pixel counts as collector text if it is clearly brighter than its
// neighbourhood while that neighbourhood is dark (the card's black border).
if (mean <= MAX_BACKGROUND && gray[k] - mean >= MIN_CONTRAST) mask[k] = 1;
```

**Multi-Collection Architecture:**
```javascript
// Collections metadata (localStorage: 'mtg-collections-meta')
{
  "collections": {
    "coll_timestamp_randomid": {
      "id": "coll_timestamp_randomid",
      "name": "Standard Deck", 
      "createdAt": "2024-12-23T20:00:00Z",
      "cardCount": 60
    }
  },
  "activeCollection": "coll_timestamp_randomid"
}
```

**Best-First OCR + Fallback Lookup** (`src/main.js`):
```javascript
async performCollectorNumberOCRWithFallback(sourceCanvas) {
    const candidates = locateCollectorTextBlocks(sourceCanvas, { maxCandidates: MAX_CANDIDATES });
    const attempts = [];
    for (const variant of generateDetectionVariants(sourceCanvas, undefined, candidates)) {
        const ocrResult = await this.performCollectorNumberOCR(variant.canvas); // reuses one Tesseract worker
        const score = /* scored against the parsed set code / rarity / number / language */;
        attempts.push({ variant: variant.name, text: ocrResult.cleanedText, score });
        if (score >= 80) break; // High confidence, stop trying more candidates
    }
    return attempts.sort((a, b) => b.score - a.score); // ranked candidates, tried in order against Scryfall
}
```

## 🎯 Design Principles

### Simplicity First
- **One file, one responsibility**
- **Essential features only**
- **No complex frameworks**
- **Vanilla JavaScript with minimal dependencies**

### What We Removed (From Complex Version)
- ❌ Complex CLAHE histogram equalization
- ❌ Multiple region extraction strategies  
- ❌ Name-based OCR with language detection
- ❌ Fuzzy card name matching
- ❌ Multi-language support complexity
- ❌ Advanced noise reduction algorithms

### What We Kept
- ✅ Clean, modern UI
- ✅ Optimized collector number processing
- ✅ Exact Scryfall API integration
- ✅ Local storage collection
- ✅ Progress feedback
- ✅ Error handling

## 🖥️ Development

### 🚀 Available Scripts

```bash
# Development & Build
npm run dev                    # Start Vite development server with HTTPS
npm run build                  # Build optimized production bundle
npm run preview                # Preview production build locally
npm run serve                  # Simple Python HTTP server (fallback)

# 🎯 Recognition Accuracy Benchmark
npm run benchmark              # Run the end-to-end localization+OCR+parsing benchmark against sandbox/test-images/
npm run benchmark -- --max-width=1280   # Same, with fixtures downscaled to camera-like resolution
```

### Browser Support

- Chrome (recommended)
- Safari (iOS/macOS)
- Firefox
- Edge
- Mobile browsers with WebRTC support

### Performance Notes

- Tesseract.js loads ~2MB on first OCR (English model only)
- Images processed client-side only
- Collection stored in localStorage
- Network calls only for Scryfall API lookups

## 🚀 Production Deployment

### 📄 Deployment Options

**Option 1: Static Hosting (Recommended)**
- [Netlify](https://netlify.com) - Best for automatic deployments
- [Vercel](https://vercel.com) - Excellent performance and DX  
- [GitHub Pages](https://pages.github.com) - Free for public repos

**Option 2: Docker Container**
- Full production Docker setup available
- NGINX-based with optimized serving
- See `ProductionDockerDeploymentGuide.md` for complete instructions

### 🛠️ Build Configuration

```bash
# Standard build for static hosting
npm run build

# Docker build for containerized deployment
docker buildx build --platform linux/amd64 -t mtgscan:prod --load .
```

### 💳 Build Output Structure
- `index.html` - Main app with bundled and optimized CSS/JS
- `style.css` - Shared stylesheet for legal pages (copied from public/)
- `privacy.html`, `terms.html`, `imprint.html`, `legal-en.html` - Static legal pages
- `assets/` - Optimized and hashed assets (images, bundled code)
- **Vite Optimizations**: Separate Tesseract.js chunk, source maps, manual chunking

## 🤝 Contributing

Contributions are welcome! This project follows the **simplicity first** principle.

### Before Adding Features
Ask yourself:
1. Is this essential for the core use case?
2. Does this add complexity without significant benefit?
3. Can this be implemented simply?
4. Will users actually use this?

### Code Style
- ES6+ Classes
- Async/Await for async operations
- Try-catch error handling
- No global state (contained in class)

### Areas for Contribution
- 🐛 Bug fixes
- 📱 Mobile UX improvements
- 🎨 UI/UX enhancements
- 📚 Documentation improvements
- 🔧 Build process optimization

## 📋 Roadmap & Recent Achievements

### ✅ **Recently Completed (2026)**
- [x] **Collector-Text Localization**: The collector number is found anywhere in the photo instead of assuming the card fills the frame - 22/22 benchmark fixtures, incl. hand-held, sleeved, foil and table photos (October 2026)
- [x] **Real Multi-Attempt Recognition**: Several located candidates tried per scan and ranked by OCR plausibility, with fallback to the next-best Scryfall match on a miss
- [x] **Recognition Accuracy Benchmark**: `npm run benchmark` measures the real pipeline end-to-end against photo fixtures (superseded the old name-OCR-era testing framework)
- [x] **Confidence Indicator & Manual Correction**: A non-blocking badge for uncertain matches, and an editable retry field instead of a dead end on a failed lookup
- [x] **Wider Collector-Number Parsing**: 1-5 digit numbers, letter suffixes, and promo stars

### ✅ **Recently Completed (2025)**
- [x] **Multi-Collection System**: Create, manage, and switch between unlimited collections
- [x] **Language Detection**: Automatic recognition of card language from collector numbers
- [x] **Visual Foil Effects**: Modal UI with shimmer effects for foil cards
- [x] **Docker Production Setup**: Complete containerization with NGINX
- [x] **Adjustable Frame Sizing**: Customizable scanning area for different use cases
- [x] **Image Upload Support**: Scan existing photos in addition to live camera
- [x] **Advanced Image Caching**: Intelligent localStorage management with auto-cleanup
- [x] **Collection Migration**: Seamless upgrade path preserving existing data

### 🚀 **Future Enhancements**
- [ ] **Collection Import/Export**: JSON format for backup and sharing
- [ ] **Card Price Integration**: Optional TCGPlayer/CardMarket pricing
- [ ] **Collection Templates**: Pre-defined setups for common deck types
- [ ] **Batch Card Processing**: Scan multiple cards in quick succession
- [ ] **Collection Analytics**: Detailed statistics and insights
- [ ] **PWA Support**: Install as mobile app with offline capabilities

### 🚫 **Intentionally Avoided**
- Complex real-time video processing (performance/battery impact)
- Server-side infrastructure (maintains privacy and simplicity)
- User authentication (keeps it local and private)
- Database integrations (localStorage is sufficient and fast)
- AI-powered card name recognition (collector numbers are more reliable)

## ⚠️ Disclaimer

**MTG Scanner** is an **unofficial fan project** created by the community for the community.

### Legal Disclaimers

- **No Official Affiliation**: This app has no connection to, endorsement by, or affiliation with Wizards of the Coast LLC, Hasbro Inc., or their subsidiaries
- **Trademark Notice**: Magic: The Gathering is a registered trademark of Wizards of the Coast LLC
- **Card Data**: All card images and information are provided via the [Scryfall API](https://scryfall.com/) and are subject to respective copyrights
- **Fan Use Only**: This project is intended for personal, non-commercial use by MTG players and collectors
- **No Warranty**: The app is provided "as-is" without warranties of any kind

### Data & Privacy

- **Local Processing**: All images are processed locally on your device - nothing is uploaded to external servers
- **No Tracking**: No cookies, analytics, or user tracking
- **Collection Storage**: Your card collection is stored locally in your browser only
- **API Requests**: Only collector numbers (e.g., "FDN U 0125") are sent to Scryfall's public API

### Limitations

- OCR accuracy depends on lighting conditions and card quality
- Some older or damaged cards may not scan reliably
- Requires modern browser with camera support
- Collection data is tied to your browser/device

For detailed legal information, see the [legal pages](/public/legal-en.html) included with the app.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

### 📏 **Core Technologies**
- **[Scryfall API](https://scryfall.com/docs/api)** - Comprehensive MTG card database and the backbone of card identification
- **[Tesseract.js](https://tesseract.projectnaptha.com/)** - Client-side OCR engine enabling offline text recognition
- **[Vite](https://vitejs.dev/)** - Lightning-fast development builds and optimized production bundles
- **Vanilla JavaScript** - Keeping it simple, fast, and dependency-light

### 🔍 **Research & Testing**
- **Recognition Accuracy Benchmark**: End-to-end localization+OCR+parsing testing against real card photos (`npm run benchmark`)
- **Mobile UX Studies**: Real-world testing on various devices and lighting conditions

### 🏆 **Community & Inspiration**
- **MTG Community** - Feedback, feature requests, and real-world testing
- **Open Source Contributors** - Bug reports and suggestions
- **Magic: The Gathering** - The incredible game that made this project worth building

### 🌐 **Special Recognition**
- **[MDN Web Docs](https://developer.mozilla.org/)** - Comprehensive WebRTC and Canvas API documentation
- **[Can I Use](https://caniuse.com/)** - Browser compatibility research for modern web APIs
- **Privacy-First Design** - No tracking, no servers, no data collection

## 🐛 Known Issues

- OCR accuracy depends on lighting and card condition
- Some older/damaged cards may not scan reliably
- Flash feature availability varies by device

## 📞 Support & Community

### 🐛 **Bug Reports & Features**
- **[GitHub Issues](https://github.com/grimbixcode/mtgscan/issues)** - Report bugs and request features
- **[Discussions](https://github.com/grimbixcode/mtgscan/discussions)** - Ask questions and share experiences
- **Before posting**: Check existing issues and search discussions

### 📚 **Documentation & Help**
- **README.md** - Complete feature overview (you're reading it!)
- **AGENTS.md** - Comprehensive development and architecture guide (for humans and coding agents alike)
- **ProductionDockerDeploymentGuide.md** - Docker deployment instructions
- **`npm run benchmark`** (`sandbox/benchmark.js`) - Recognition accuracy benchmark against `sandbox/test-images/`

### ❤️ **Support the Project**
- **[GitHub Sponsors](https://github.com/sponsors/grimbixcode)** - Support development and maintenance
- **⭐ Star the repo** - Help others discover MTG Scanner
- **Share your collection exports** - Help test compatibility with other tools
- **Contribute code** - PRs welcome following the simplicity-first principle

### 🌐 **Community Guidelines**
- **Be respectful** - We're all here to enjoy MTG and technology
- **Follow simplicity principle** - Feature requests should enhance core functionality
- **Provide context** - When reporting issues, include device, browser, and steps to reproduce
- **Test thoroughly** - Run `npm run benchmark` before and after any change to `src/recognition/*` and check for regressions

---

**"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."** - Antoine de Saint-Exupéry

---

⭐ **Star this project if it helps with your MTG collection!**
