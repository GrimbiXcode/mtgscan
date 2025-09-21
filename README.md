# 🎴 MTG Scanner

A simple, focused Magic: The Gathering card scanner that captures cards through your device camera, uses OCR to recognize collector numbers, and builds your digital collection using precise Scryfall API lookups.

## ✨ Key Features

- **📱 Camera Integration**: Full viewport camera display with visual positioning guides
- **🔢 Language-Independent Recognition**: Uses collector numbers for universal card identification
- **🎯 Exact API Lookups**: Precise Scryfall integration with no fuzzy matching needed
- **📚 Collection Management**: Local storage with export capabilities
- **🚀 Zero Dependencies**: Vanilla JavaScript with minimal external libraries
- **📦 Simple Architecture**: One responsibility per file, easy to understand and maintain

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
├── index.html          # Main HTML structure
├── src/
│   ├── main.js         # Application logic (MTGScanner class)
│   └── style.css       # Clean, responsive styling
├── assets/
│   └── default-card.png # Placeholder card image
├── package.json        # Vite dev server config
└── README.md          # This file
```

### Core Architecture

- **Single Class Design**: Everything contained in `MTGScanner` class
- **Event-Driven Flow**: Clear separation of concerns
- **Progressive Enhancement**: Works without JavaScript for basic HTML
- **Mobile-First**: Responsive design optimized for phones and tablets

## 🔧 Technical Details

### Image Processing Pipeline

1. **Full Camera Capture**: High-resolution image capture
2. **Card Frame Crop**: Extract card area using red guide
3. **Collector Number Crop**: Focus on bottom-left region (x=0.1%, y=90%, w=20%, h=8%)
4. **High-Contrast Processing**: Optimized for OCR recognition
5. **OCR Extraction**: Tesseract.js with English model (PSM mode 13)
6. **API Lookup**: Direct Scryfall API call with exact collector number

### Key Code Snippets

**Collector Number Processing:**
```javascript
processCollectorNumberImage(canvas) {
    // Convert to grayscale
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // High contrast enhancement (2.5x factor)
    const enhanced = (gray - 128) * 2.5 + 128;
    
    // Invert colors (white text on dark background → black on white)
    const inverted = 255 - enhanced;
}
```

**Exact API Lookup:**
```javascript
async searchCardByCollectorNumber(collectorInfo) {
    const { setCode, collectorNumber } = this.parseCollectorNumber(collectorInfo);
    const response = await fetch(
        `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`
    );
    // Exact match, no fuzzy search needed
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

### Available Scripts

```bash
npm run dev        # Start Vite development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run serve      # Simple Python HTTP server
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

## 🚢 Production Deployment

### Requirements
- **HTTPS Required**: Camera access needs secure context
- **Static Hosting**: No server-side processing needed
- **Modern Browser Support**: WebRTC camera API

### Recommended Hosts
- [Netlify](https://netlify.com) (recommended)
- [Vercel](https://vercel.com)
- [GitHub Pages](https://pages.github.com)

### Build & Deploy

```bash
# Build for production
npm run build

# Deploy dist/ folder to your hosting service
```

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

## 📋 Roadmap

### Potential Simple Additions
- [ ] Card count tracking and statistics
- [ ] Export to CSV/Excel formats
- [ ] Backup/restore from file
- [ ] Share collection functionality
- [ ] Basic card value integration

### Things We'll Avoid
- Complex image processing algorithms
- Real-time video processing
- Multi-language OCR support
- Database integrations
- User authentication systems
- Cloud sync (unless essential)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Scryfall API](https://scryfall.com/docs/api) for comprehensive MTG card data
- [Tesseract.js](https://tesseract.projectnaptha.com/) for client-side OCR
- [Vite](https://vitejs.dev/) for fast development builds
- The MTG community for inspiration and feedback

## 🐛 Known Issues

- OCR accuracy depends on lighting and card condition
- Some older/damaged cards may not scan reliably
- Flash feature availability varies by device

## 📞 Support

- 🐛 Report bugs via [GitHub Issues](https://github.com/grimbixcode/mtgscan/issues)
- 💡 Feature requests welcome (following simplicity principle)
- 📖 Check existing issues before creating new ones

---

**"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."** - Antoine de Saint-Exupéry

---

⭐ **Star this project if it helps with your MTG collection!**