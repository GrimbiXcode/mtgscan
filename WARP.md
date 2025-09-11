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
│  ├── Image Processing    │  ├── Metadata Storage           │
│  ├── OCR Integration     │  └── Search Indexing            │
│  └── Export Functionality│                                 │
├─────────────────────────────────────────────────────────────┤
│                External Services                            │
│  ├── Scryfall API (Card Data)                              │
│  ├── MediaDevices API (Camera)                             │
│  └── Tesseract.js (OCR Engine)                             │
└─────────────────────────────────────────────────────────────┘
```

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
    ├── 📷 camera.js           # Camera management
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
**Camera access and image processing**

**Capabilities:**
- Multi-device camera support
- Optimal constraint selection (mobile vs desktop)
- Image preprocessing for OCR
- Canvas-based image capture
- Basic image enhancement (contrast, sharpening)

### 5. **CSVExporter** (`csvExport.js`)
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
```json
{
  "dev": "vite",              // Development server with HMR
  "build": "vite build",      // Production build
  "preview": "vite preview",  // Preview built app
  "serve": "python3 -m http.server 8080"  // Simple server
}
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
- **Camera capture and preview**
- **Scryfall API integration with fuzzy search**
- **IndexedDB storage with full CRUD**
- **Multi-format CSV export**
- **Responsive UI with dark mode support**
- **Error handling and user feedback**

### ⚠️ Partially Implemented
- **OCR Integration**: Tesseract.js installed but uses manual input
- **Image Processing**: Basic preprocessing, room for enhancement
- **Offline Support**: Storage works offline, but no service worker

### 🔮 Future Enhancements
- **Full OCR automation** with Tesseract.js
- **Service Worker** for PWA capabilities
- **Advanced image processing** for better card recognition
- **Bulk scanning** mode
- **Cloud synchronization**
- **Price data integration**

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
- **Structured Data**: Built for complex objects
- **Async Operations**: Non-blocking database operations
- **Offline Capability**: Works without network connection

## 🐛 Debugging & Testing

### Common Issues
1. **Camera Permission**: Check browser permissions
2. **API Rate Limits**: Scryfall has 100 req/sec limit
3. **HTTPS Required**: Camera API requires secure context
4. **Mobile Compatibility**: Test on actual devices

### Debug Tools
```javascript
// Access app instance in console
window.mtgScanner

// Check database state
await window.mtgScanner.database.getAllCards()

// Test camera support
await CameraManager.checkCameraSupport()
```

### Browser Compatibility
- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅
- **Safari**: Requires HTTPS for camera ⚠️
- **Mobile Browsers**: Optimized for touch ✅

## 📊 Performance Considerations

### Optimization Strategies
- **Lazy Loading**: Card images loaded on demand
- **Debounced Search**: Prevents excessive API calls
- **Image Compression**: JPEG quality set to 0.8
- **Efficient DOM Updates**: Minimal re-renders

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
