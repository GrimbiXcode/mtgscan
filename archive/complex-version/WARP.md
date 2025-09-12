# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

# MTG Scanner - Technical Documentation

> **🎴 Magic: The Gathering Card Scanner Web Application**  
> A modern web app for scanning MTG cards using device cameras and exporting collections to Moxfield.

## 📋 Project Overview

**MTG Scanner** is a sophisticated web application built with vanilla JavaScript that enables users to scan Magic: The Gathering cards using their device camera, store them locally, and export collections in various formats for popular MTG collection management platforms.

### Key Statistics
- **Language**: JavaScript (ES6 Modules)
- **Build Tool**: Vite
- **Dependencies**: Minimal (Tesseract.js for OCR)
- **Storage**: IndexedDB (client-side)
- **API**: Scryfall REST API
- **UI Language**: German

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    MTG Scanner App                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Vanilla JS)   │  Storage (IndexedDB)            │
│  ├── Camera Management   │  ├── Card Collection            │
│  ├── Region Extraction   │  ├── Metadata Storage           │
│  ├── OCR Integration     │  └── Search Indexing            │
│  └── Export Functionality│                                 │
├─────────────────────────────────────────────────────────────┤
│                External Services                            │
│  ├── Scryfall API (Card Data)                              │
│  ├── MediaDevices API (Camera)                             │
│  └── Tesseract.js (OCR Engine)                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**Removed Complex Card Detection**: Previously included ~1200 lines of real-time card boundary detection code. Now uses focused region extraction strategies for better performance and maintainability.

**Intelligent Region Extraction**: Uses 5 different strategies with quality scoring to extract optimal OCR regions:
- Quality-based selection using size ratio, aspect ratio, and content analysis
- Fallback system ensures robust operation
- Debug mode provides visual comparison of all strategies

## 📁 Project Structure

```
mtgscan/
├── 📄 index.html              # Main application entry point
├── 📦 package.json            # Dependencies and build scripts
├── 📦 package-lock.json       # Dependency lock file
├── ⚙️  vite.config.js          # Vite configuration
├── 📚 README.md               # German user documentation
├── 📚 WARP.md                 # This technical documentation
├── 📁 node_modules/           # Dependencies
│   ├── tesseract.js/          # OCR engine
│   ├── vite/                  # Build tool
│   └── ...                    # Other dependencies
└── 📁 src/                    # Source code modules
    ├── 🎯 main.js             # Application orchestrator
    ├── 💾 database.js         # IndexedDB wrapper
    ├── 🔍 scryfall.js         # Scryfall API client
    ├── 📷 camera.js           # Camera management & region extraction
    ├── 🔤 ocrService.js       # OCR integration with Tesseract.js
    ├── 📊 csvExport.js        # Export functionality
    └── 🎨 styles.css          # UI styling
```

## 🔧 Core Modules

### 1. **MTGScannerApp** (`main.js`)
**Main orchestrator class that coordinates all functionality**

```javascript
class MTGScannerApp {
    // Manages application lifecycle
    // Coordinates between camera, database, and API
    // Handles UI events and state management
}
```

**Key Responsibilities:**
- Application initialization and lifecycle management
- Event handling and user interactions
- Coordination between modules
- Error handling and user feedback

### 2. **MTGDatabase** (`database.js`)
**IndexedDB wrapper for persistent storage**

```javascript
class MTGDatabase {
    // CRUD operations for card collection
    // Search and indexing capabilities
    // Data validation and cleanup
}
```

**Schema:**
```javascript
{
    id: number,              // Auto-increment primary key
    name: string,            // Card name
    set: string,             // Set name
    setCode: string,         // Set code (e.g., "DOM")
    scryfallId: string,      // Scryfall UUID
    imageUrl: string,        // Card image URL
    manaCost: string,        // Mana cost (e.g., "{2}{U}")
    typeLine: string,        // Type line
    quantity: number,        // Quantity owned
    dateAdded: string,       // ISO timestamp
    collectorNumber: string, // Collector number
    rarity: string,          // Card rarity
    colors: array,           // Color identity
    cmc: number             // Converted mana cost
}
```

### 3. **ScryfallAPI** (`scryfall.js`)
**Scryfall API integration for card identification**

**Endpoints Used:**
- `/cards/named` - Exact/fuzzy card name search
- `/cards/search` - Advanced search queries
- `/cards/autocomplete` - Name suggestions

**Features:**
- Fuzzy name matching
- OCR text processing and card identification
- Error handling for API limits
- Image URL resolution for double-faced cards

### 4. **CameraManager** (`camera.js`)
**Camera access and intelligent region extraction**

**Capabilities:**
- Multi-device camera support with HTTPS requirement handling
- Optimal constraint selection (mobile vs desktop)
- **5 intelligent region extraction strategies** for OCR optimization:
  - `smart_name_region`: Adaptive based on card proportions
  - `adaptive_top_region`: Content-aware sizing with text density analysis
  - `enhanced_top25`: Improved positioning algorithm
  - `focused_name_area`: MTG card name area targeting
  - `wide_top_center`: Wide extraction for complex layouts
- Quality-based strategy selection with scoring system
- Comprehensive debug mode with visual strategy comparison
- Canvas-based image capture with preprocessing

### 5. **OCRService** (`ocrService.js`)
**OCR integration with Tesseract.js**

**Features:**
- Multi-language support (English, German, French, Spanish, etc.)
- Language preference persistence in localStorage
- Progress tracking and status updates
- Optimized initialization with worker management
- Performance optimization with SharedArrayBuffer support

### 6. **CSVExporter** (`csvExport.js`)
**Multi-format export functionality**

**Supported Formats:**
- **Moxfield**: CSV with full metadata
- **Deckbox**: Alternative CSV format
- **MTG Arena**: Text format for deck import

## 🚀 Development Workflow

### Prerequisites
```bash
# Node.js and npm required
node --version  # v16+ recommended
npm --version   # v7+ recommended
```

### Setup & Installation
```bash
# Clone or navigate to project
cd /Users/davidgrimbichler/gitlabor/mtgscan

# Install dependencies
npm install

# Start development server
npm run dev
# → http://localhost:3000

# Alternative: Simple HTTP server
npm run serve
# → http://localhost:8080
```

### Build & Deployment
```bash
# Production build
npm run build
# → Creates dist/ folder

# Preview production build
npm run preview
```

### Development Scripts
```bash
# Development with hot reload (HTTPS enabled for camera API)
npm run dev              # → https://localhost:3000

# Production build
npm run build            # → Creates dist/ folder with optimized assets

# Preview production build locally
npm run preview          # → Preview built app

# Simple HTTP server (limited functionality - camera requires HTTPS)
npm run serve            # → http://localhost:8080
```

### SSL Certificate Setup
The development server requires HTTPS for camera API access. Certificates are included:
```bash
# Self-signed certificates (already generated)
localhost.pem        # SSL certificate
localhost-key.pem    # SSL private key
```

### Critical Development Commands
```bash
# IMPORTANT: Always use npm run dev for full functionality
# Camera API requires HTTPS - npm run serve will have limited camera access
npm run dev

# Test OCR languages
# Change language in UI dropdown or via console:
# window.mtgScanner.ocrService.setLanguage('deu') // German
# window.mtgScanner.ocrService.setLanguage('eng') // English

# Debug region extraction
# Enable debug mode in UI to see all 5 region extraction strategies
# Download intermediate processing steps for analysis

# Check application state in console
window.mtgScanner.currentCards      // Current card collection
window.mtgScanner.useOCR            // OCR availability status
window.mtgScanner.debugMode         // Debug mode status
```

## 🔍 API Integration

### Scryfall API Usage
```javascript
// Card search by name
const card = await scryfallAPI.searchCardByName("Lightning Bolt", true);

// Advanced search
const results = await scryfallAPI.searchCards("c:red cmc:1");

// Autocomplete
const suggestions = await scryfallAPI.getAutocomplete("light");
```

**Rate Limiting:**
- 100 requests per second
- Built-in error handling for 429 responses
- Automatic retry logic (not yet implemented)

## 💾 Data Management

### IndexedDB Structure
```javascript
// Database: MTGScannerDB (version 1)
// Object Store: cards
// Indexes: name, set, scryfallId
```

### Storage Operations
```javascript
// Add card
await database.addCard(cardData);

// Get all cards
const cards = await database.getAllCards();

// Update quantity
await database.updateCard(id, { quantity: 3 });

// Delete card
await database.deleteCard(id);

// Clear collection
await database.clearAllCards();
```

## 📱 Camera Integration

### Supported Features
- **Environment Camera**: Prefers back camera on mobile
- **Optimal Resolution**: 1280x720 ideal, up to 1920x1080
- **Image Processing**: Grayscale conversion, contrast enhancement
- **Cross-Platform**: Works on iOS Safari, Android Chrome, Desktop

### Camera Constraints
```javascript
{
  video: {
    facingMode: 'environment',     // Back camera preferred
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    focusMode: 'continuous',
    exposureMode: 'continuous'
  }
}
```

## 🎯 Current Implementation Status

### ✅ Fully Implemented
- **Camera capture and preview** with HTTPS requirement handling
- **5 intelligent region extraction strategies** with quality-based selection
- **Full OCR integration** with Tesseract.js and multi-language support
- **Scryfall API integration** with fuzzy search and error handling
- **IndexedDB storage** with full CRUD operations and search indexing
- **Multi-format CSV export** (Moxfield, Deckbox, MTG Arena)
- **Comprehensive debug mode** with visual strategy comparison
- **Responsive UI** with dark mode support and German localization
- **Error handling and user feedback** with graceful fallbacks

### ⚠️ Partially Implemented
- **Offline Support**: Storage works offline, but no service worker for PWA
- **Advanced Image Processing**: Could be enhanced for better card recognition

### 🔮 Future Enhancements
- **Service Worker** for PWA capabilities and offline caching
- **Bulk scanning** mode for multiple cards
- **Cloud synchronization** between devices
- **Price data integration** from TCGPlayer or similar APIs
- **Advanced image enhancement** for better OCR in poor lighting

## 🛠️ Technical Decisions

### Why Vanilla JavaScript?
- **Minimal Bundle Size**: No framework overhead
- **Direct API Access**: Full control over browser APIs
- **Fast Performance**: No virtual DOM or compilation step
- **Easy Debugging**: Straightforward stack traces

### Why Vite?
- **Fast Development**: Instant HMR and fast builds
- **ES Module Support**: Native module handling
- **Minimal Configuration**: Works out of the box
- **Modern Tooling**: Built for modern web development

### Why IndexedDB?
- **Large Storage Capacity**: No 5MB localStorage limit
- **Structured Data**: Built for complex objects with CRUD operations
- **Async Operations**: Non-blocking database operations
- **Offline Capability**: Works without network connection
- **Search Indexing**: Built-in indexes on name, set, and scryfallId fields

### Why Tesseract.js for OCR?
- **Client-Side Processing**: No server required, privacy-friendly
- **Multi-Language Support**: 10+ languages including English, German, Japanese
- **WebAssembly Performance**: Near-native speed in modern browsers
- **Worker-Based**: Non-blocking UI during OCR processing
- **SharedArrayBuffer Optimization**: Faster processing when available

## 🐛 Debugging & Testing

### Common Issues
1. **Camera Permission**: Check browser permissions (requires HTTPS)
2. **API Rate Limits**: Scryfall has 100 req/sec limit
3. **HTTPS Required**: Camera API requires secure context - use `npm run dev`
4. **OCR Language**: Ensure correct language is selected for better results
5. **Mobile Compatibility**: Test on actual devices, not browser dev tools

### Built-in Debug Mode
```javascript
// Enable debug mode in UI
// Click 🔬 Debug button in the interface

// Debug mode shows:
// - 5 region extraction strategies with quality scores
// - Visual comparison of extraction methods
// - Downloadable intermediate processing steps
// - Real-time OCR analysis with confidence metrics
```

### Console Debug Tools
```javascript
// Access app instance in console
window.mtgScanner

// Check database state
await window.mtgScanner.database.getAllCards()

// Test camera support
await CameraManager.checkCameraSupport()

// Test OCR service
window.mtgScanner.ocrService.isReady()

// Check current debug mode
window.mtgScanner.debugMode
```

### Browser Compatibility
- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅  
- **Safari**: Requires HTTPS for camera (use `npm run dev`) ⚠️
- **Mobile Browsers**: Optimized for touch, supports multi-language OCR ✅
- **iOS Safari**: Camera works with HTTPS, OCR performance may vary ⚠️

## 📊 Performance Considerations

### Optimization Strategies
- **Lazy Loading**: Card images loaded on demand from Scryfall CDN
- **Debounced Search**: Prevents excessive API calls during manual input
- **Image Compression**: JPEG quality set to 0.8 for captures
- **Efficient DOM Updates**: Minimal re-renders in card collection
- **Smart Region Extraction**: Only processes card name areas, not full image
- **OCR Worker Management**: Reuses Tesseract.js workers for performance
- **Manual Chunking**: Tesseract.js separated into its own build chunk

### Storage Efficiency
- **Selective Data**: Only stores necessary card fields
- **Image Caching**: Uses Scryfall CDN URLs
- **Cleanup Operations**: Removes outdated entries

## 🔒 Security & Privacy

### Data Handling
- **Local Storage Only**: No server-side data collection
- **API Keys**: None required (Scryfall is open)
- **Image Processing**: All done client-side
- **No Tracking**: No analytics or third-party scripts

### Privacy Features
- **Offline Capable**: Can work without internet
- **No Registration**: No user accounts required
- **Data Portability**: Easy CSV export/import

---

## 📞 Developer Contact

**Project**: MTG Scanner  
**Location**: `/Users/davidgrimbichler/gitlabor/mtgscan`  
**Documentation**: This file (WARP.md)  
**User Guide**: README.md (German)

---

*This documentation was generated for Warp terminal integration and technical reference.*
