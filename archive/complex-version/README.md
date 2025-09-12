# MTG Scanner 🎴

Eine Web-App zum Scannen von Magic: The Gathering Karten mit der Gerätekamera und Export für Moxfield.

## Features

- 📷 **Kamera-Integration**: Nutzt die Gerätekamera zum Aufnehmen von Kartenbildern
- 🔍 **Scryfall-Integration**: Identifiziert Karten über die Scryfall API
- 💾 **Browser-Speicherung**: Speichert Karten lokal im Browser mit IndexedDB
- 📊 **CSV-Export**: Exportiert Karten im Moxfield-kompatiblen Format
- 📱 **Responsive Design**: Optimiert für Mobile und Desktop
- 🌙 **Dark Mode**: Automatische Anpassung an Systemeinstellungen

## Technologie-Stack

- **Frontend**: Vanilla JavaScript (ES6 Module)
- **Styling**: CSS3 mit CSS Custom Properties
- **Speicher**: IndexedDB für lokale Datenpersistierung
- **API**: Scryfall API für Karteninformationen
- **Build Tool**: Vite (optional)

## Installation

1. Repository klonen oder herunterladen:
```bash
git clone <repository-url>
cd mtgscan
```

2. Dependencies installieren (optional, nur für Entwicklung):
```bash
npm install
```

3. Entwicklungsserver starten:
```bash
# Mit Vite (empfohlen)
npm run dev
```

4. Browser öffnen und zur lokalen URL navigieren (z.B. `http://localhost:3000`)

## Verwendung

### Karten scannen

1. **Kamera starten**: Klicke auf "📷 Kamera starten"
2. **Karte positionieren**: Halte die MTG-Karte vor die Kamera (Name sollte gut lesbar sein)
3. **Scannen**: Klicke auf "📸 Karte scannen"
4. **OCR-Ergebnis prüfen**: 
   - ✨ **Automatisch**: OCR erkennt den Text und schlägt Kartennamen vor
   - 🔄 **Wiederholen**: OCR erneut ausführen bei schlechten Ergebnissen
   - ✏️ **Manuell**: Fallback zur manuellen Namenseingabe
5. **Bestätigen**: Wähle einen Vorschlag oder gib manuell ein

### Kartensammlung verwalten

- **Karte bearbeiten**: Klicke auf eine Karte in der Liste, um Anzahl zu ändern
- **Karte löschen**: Lösche einzelne Karten über das Detail-Modal
- **Sammlung leeren**: Lösche alle Karten mit "🗑️ Alle löschen"

### Export

- **CSV Export**: Klicke auf "📊 Als CSV exportieren" für Moxfield-Import
- Die CSV-Datei wird automatisch heruntergeladen

## Projektstruktur

```
mtgscan/
├── index.html              # Haupt-HTML-Datei
├── package.json            # Node.js Abhängigkeiten
├── README.md              # Dokumentation
└── src/
    ├── main.js            # Haupt-Anwendungslogik
    ├── database.js        # IndexedDB Wrapper
    ├── scryfall.js        # Scryfall API Integration
    ├── camera.js          # Kamera-Funktionalität
    ├── csvExport.js       # CSV Export Funktionen
    └── styles.css         # Styling
```

## API-Referenz

### MTGDatabase
- `init()`: Initialisiert die IndexedDB
- `addCard(cardData)`: Fügt eine Karte hinzu
- `getAllCards()`: Lädt alle gespeicherten Karten
- `updateCard(id, updates)`: Aktualisiert eine Karte
- `deleteCard(id)`: Löscht eine Karte
- `clearAllCards()`: Löscht alle Karten

### ScryfallAPI
- `searchCardByName(name, fuzzy)`: Sucht Karte nach Name
- `identifyCardFromText(text)`: Identifiziert Karte aus OCR-Text

### CameraManager
- `startCamera()`: Startet die Kamera
- `stopCamera()`: Stoppt die Kamera
- `captureImage()`: Nimmt ein Bild auf

### CSVExporter
- `exportToMoxfield(cards)`: Exportiert für Moxfield
- `exportToDeckbox(cards)`: Exportiert für Deckbox
- `exportToMTGArena(cards)`: Exportiert für MTG Arena

## Browser-Kompatibilität

- **Chrome/Edge**: Vollständige Unterstützung
- **Firefox**: Vollständige Unterstützung
- **Safari**: Kamera-Zugriff erfordert HTTPS
- **Mobile Browser**: Optimiert für Touch-Bedienung

## Entwicklung

### Neue Features

1. **✅ Automatische OCR**: Vollständige Tesseract.js Integration für automatische Texterkennung
2. **✅ Intelligente Bildverarbeitung**: Erweiterte Algorithmen für bessere Kartenidentifikation
3. **✅ Interaktive Vorschläge**: Mehrere Kartennamen-Vorschläge mit Confidence-Werten
4. **✅ Fallback-System**: Automatischer Wechsel zu manueller Eingabe bei OCR-Fehlern

### Geplante Verbesserungen

1. **Offline-Funktionalität**: Service Worker für PWA-Funktionen
2. **Bulk-Import**: Mehrere Karten gleichzeitig scannen
3. **Preisdaten**: Integration von Preisinformationen
4. **Sync-Funktionalität**: Cloud-Synchronisation zwischen Geräten

### Lokale Entwicklung

```bash
# Entwicklungsserver starten
npm run dev

# Build für Produktion
npm run build

# Preview der Build-Version
npm run preview
```

## Lizenz

MIT License - siehe LICENSE Datei für Details.

## Beitragen

1. Fork des Repositories
2. Feature Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request öffnen

## Support

Bei Fragen oder Problemen bitte ein Issue im GitHub Repository erstellen.

---

**Hinweis**: Diese Version verfügt über vollständige OCR-Funktionalität mit Tesseract.js. Bei schlechten Lichtverhältnissen oder unleserlichen Karten steht die manuelle Eingabe als Fallback zur Verfügung.
