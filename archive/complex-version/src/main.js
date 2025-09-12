// Main application file
import MTGDatabase from './database.js';
import ScryfallAPI from './scryfall.js';
import CameraManager from './camera.js';
import CSVExporter from './csvExport.js';
import OCRService from './ocrService.js';

class MTGScannerApp {
    constructor() {
        this.database = new MTGDatabase();
        this.scryfallAPI = new ScryfallAPI();
        this.camera = new CameraManager();
        this.csvExporter = new CSVExporter();
        this.ocrService = new OCRService();

        this.currentCards = [];
        this.currentEditCard = null;
        this.currentOCRResult = null;
        this.selectedSuggestion = null;
        this.useOCR = true; // Enable OCR by default
        this.debugMode = false; // Debug mode disabled by default
        this.debugLog = []; // Store debug messages
        this.lastCapturedImage = null; // Store last captured image for debugging

        this.initializeApp();
    }

    async initializeApp() {
        try {
            // Initialize database
            await this.database.init();

            // Load existing cards
            await this.loadCards();

            // Set up event listeners
            this.setupEventListeners();

            // Check camera support
            await this.checkCameraSupport();

            // Initialize OCR if supported
            await this.initializeOCR();

            console.log('MTG Scanner erfolgreich initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
            this.showError('Initialisierungsfehler: ' + error.message);
        }
    }

    setupEventListeners() {
        // Camera controls
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('captureCard').addEventListener('click', () => this.captureCard());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());

        // Collection controls
        document.getElementById('clearCollection').addEventListener('click', () => this.clearCollection());
        document.getElementById('exportCSV').addEventListener('click', () => this.exportToCSV());

        // Modal controls
        document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
        document.getElementById('saveCardChanges').addEventListener('click', () => this.saveCardChanges());
        document.getElementById('deleteCard').addEventListener('click', () => this.deleteCurrentCard());

        // OCR controls
        document.getElementById('acceptOCR').addEventListener('click', () => this.acceptOCRResult());
        document.getElementById('manualInput').addEventListener('click', () => this.showManualInput());
        document.getElementById('retryOCR').addEventListener('click', () => this.retryOCR());

        // Debug controls
        document.getElementById('toggleDebug').addEventListener('click', () => this.toggleDebugMode());
        document.getElementById('closeDebug').addEventListener('click', () => this.closeDebugMode());
        document.getElementById('downloadOriginal').addEventListener('click', () => this.downloadDebugImage('original'));
        document.getElementById('downloadProcessed').addEventListener('click', () => this.downloadDebugImage('processed'));
        document.getElementById('retestOCR').addEventListener('click', () => this.retestOCRDebug());

        // Language selection control
        document.getElementById('ocrLanguage').addEventListener('change', (e) => this.changeOCRLanguage(e.target.value));

        // Close modal when clicking outside
        document.getElementById('cardModal').addEventListener('click', (e) => {
            if (e.target.id === 'cardModal') {
                this.closeModal();
            }
        });
    }

    async checkCameraSupport() {
        const support = await CameraManager.checkCameraSupport();

        if (!support.supported) {
            document.getElementById('startCamera').disabled = true;
            this.showError('Kamera wird nicht unterstützt: ' + support.error);
        } else if (support.needsPermission) {
            // Camera exists but needs permission - don't disable the button
            console.log('Kamera verfügbar, aber Berechtigung erforderlich');
            this.showInfo('Kamerazugriff verfügbar - Berechtigung wird beim Start angefragt');
        } else {
            console.log(`${support.deviceCount} Kamera(s) verfügbar`);
            if (support.note) {
                console.log(support.note);
            }
        }
    }

    async initializeOCR() {
        try {
            if (!OCRService.isSupported()) {
                console.warn('OCR wird nicht unterstützt - verwende manuelle Eingabe');
                this.useOCR = false;
                return;
            }

            // Load saved language preference or use default
            const savedLanguage = this.loadLanguagePreference();

            // Set the UI dropdown to the saved language
            const languageSelect = document.getElementById('ocrLanguage');
            if (languageSelect) {
                languageSelect.value = savedLanguage;
            }

            // Initialize OCR with progress callbacks and selected language
            await this.ocrService.init(
                (progress) => this.updateOCRProgress(progress),
                (status) => this.updateOCRStatus(status),
                savedLanguage
            );

            this.useOCR = true;
            console.log(`OCR erfolgreich initialisiert (Sprache: ${savedLanguage})`);
        } catch (error) {
            console.error('OCR Initialisierung fehlgeschlagen:', error);
            this.useOCR = false;
            this.showError('OCR konnte nicht initialisiert werden - verwende manuelle Eingabe');
        }
    }

    // Load language preference from localStorage
    loadLanguagePreference() {
        try {
            const saved = localStorage.getItem('mtgscan-ocr-language');
            return saved || 'eng'; // Default to English
        } catch (error) {
            console.warn('Konnte Spracheinstellung nicht laden:', error);
            return 'eng';
        }
    }

    // Save language preference to localStorage
    saveLanguagePreference(language) {
        try {
            localStorage.setItem('mtgscan-ocr-language', language);
        } catch (error) {
            console.warn('Konnte Spracheinstellung nicht speichern:', error);
        }
    }

    // Change OCR language
    async changeOCRLanguage(language) {
        try {
            if (!this.useOCR) {
                console.warn('OCR ist nicht verfügbar');
                return;
            }

            // Show status update
            this.updateOCRStatus(`Sprache wird auf ${this.getLanguageName(language)} geändert...`);

            // Change OCR language
            await this.ocrService.setLanguage(language);

            // Save preference
            this.saveLanguagePreference(language);

            // Update status
            this.updateOCRStatus(`OCR bereit (${this.getLanguageName(language)})`);

            console.log(`OCR Sprache geändert zu: ${language}`);
        } catch (error) {
            console.error('Fehler beim Ändern der OCR Sprache:', error);
            this.showError('Sprache konnte nicht geändert werden: ' + error.message);
        }
    }

    // Get display name for language code
    getLanguageName(code) {
        const languages = {
            'eng': 'English',
            'deu': 'Deutsch',
            'fra': 'Français',
            'spa': 'Español',
            'ita': 'Italiano',
            'por': 'Português',
            'jpn': '日本語',
            'kor': '한국어',
            'chi_sim': '中文 (简体)',
            'chi_tra': '中文 (繁體)',
            'rus': 'Русский'
        };
        return languages[code] || code;
    }

    async startCamera() {
        try {
            const video = document.getElementById('cameraPreview');
            const canvas = document.getElementById('captureCanvas');

            await this.camera.init(video, canvas);
            await this.camera.startCamera();

            // Update UI
            document.getElementById('startCamera').disabled = true;
            document.getElementById('captureCard').disabled = false;
            document.getElementById('stopCamera').disabled = false;

            video.style.display = 'block';

            // Show card positioning frame (visual guide only)
            const cardFrame = document.getElementById('cardFrame');
            if (cardFrame) {
                cardFrame.classList.add('active');
            }

        } catch (error) {
            console.error('Fehler beim Starten der Kamera:', error);
            this.showError('Kamera konnte nicht gestartet werden: ' + error.message);
        }
    }

    stopCamera() {
        this.camera.stopCamera();

        // Update UI
        document.getElementById('startCamera').disabled = false;
        document.getElementById('captureCard').disabled = true;
        document.getElementById('stopCamera').disabled = true;

        document.getElementById('cameraPreview').style.display = 'none';

        // Hide card positioning frame
        const cardFrame = document.getElementById('cardFrame');
        if (cardFrame) {
            cardFrame.classList.remove('active');
        }
    }

    async captureCard() {
        try {
            this.showProcessingStatus(true, 'Bild wird aufgenommen...');
            this.addDebugLog('Capturing image from camera', 'info');

            // Capture image
            const capturedImage = await this.camera.captureImage();

            // Store original canvas for debugging
            const originalCanvas = document.createElement('canvas');
            originalCanvas.width = capturedImage.canvas.width;
            originalCanvas.height = capturedImage.canvas.height;
            const originalCtx = originalCanvas.getContext('2d');
            originalCtx.drawImage(capturedImage.canvas, 0, 0);

            if (this.useOCR && this.ocrService.getProcessingStatus().isInitialized) {
                await this.processWithOCR(capturedImage, originalCanvas);
            } else {
                await this.processManually();
            }

        } catch (error) {
            console.error('Fehler beim Scannen der Karte:', error);
            this.addDebugLog(`Image capture failed: ${error.message}`, 'error');
            this.showError('Scan-Fehler: ' + error.message);
        } finally {
            this.showProcessingStatus(false);
        }
    }

    async processWithOCR(capturedImage, originalCanvas = null) {
        try {
            this.showOCRProgress(true);
            this.updateOCRStatus('Bild wird für deutsche Kartenerkennung vorbereitet...');
            this.addDebugLog('Starting German MTG card preprocessing for OCR', 'info');

        // Preprocess image with optimized region extraction (with debug support)
        const canvas = capturedImage.canvas;
        const processedCanvas = this.camera.preprocessForOCR(canvas, this.debugMode);

        // Get region extraction results for debugging
        const regionExtraction = this.camera.getLastRegionExtraction();
        
        // Store images for debugging
        this.lastCapturedImage = {
            original: originalCanvas || canvas,
            processed: processedCanvas,
            regionExtraction: regionExtraction
        };

        // Update debug display if in debug mode
        if (this.debugMode) {
            this.updateDebugImages(this.lastCapturedImage.original, this.lastCapturedImage.processed, regionExtraction);
            this.addDebugLog('Updated debug images display with enhanced region extraction', 'info');
        }

            // Perform OCR with German optimization
            this.updateOCRStatus('Erkenne deutschen Kartentext...');
            this.addDebugLog('Starting optimized German OCR text recognition', 'info');
            
        // Use simple OCR processing to prevent hanging
        const ocrResult = await this.ocrService.recognizeText(processedCanvas, 'eng');
            
            this.addDebugLog(`German OCR completed. Text: "${ocrResult.text}", Confidence: ${Math.round(ocrResult.confidence || 0)}%`, 'info');

            // Extract possible German card names with enhanced processing
            const cardSuggestions = this.extractGermanCardSuggestions(ocrResult);
            this.addDebugLog(`Found ${cardSuggestions.length} German card name suggestions`, 'info');

            this.currentOCRResult = {
                ...ocrResult,
                suggestions: cardSuggestions
            };

            // Update debug results if in debug mode
            if (this.debugMode) {
                this.updateDebugOCRResults(ocrResult);
            }

            // Show OCR results to user
            this.displayOCRResults(ocrResult, cardSuggestions);

        } catch (error) {
            console.error('OCR Fehler:', error);
            this.addDebugLog(`German OCR processing failed: ${error.message}`, 'error');
            this.showError('Deutsche OCR fehlgeschlagen: ' + error.message);
            await this.processManually();
        } finally {
            this.showOCRProgress(false);
        }
    }
    
    // Enhanced German card text recognition with optimal settings
    async recognizeGermanCardText(canvas) {
        const ocrConfig = {
            logger: m => {
                if (m.status === 'recognizing text') {
                    this.updateOCRStatus(`Erkenne deutschen Kartentext... ${Math.round(m.progress * 100)}%`);
                }
            },
            // Optimal settings based on test results
            tessedit_pageseg_mode: '7',  // Single text line
            tessedit_ocr_engine_mode: '2', // LSTM neural net
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüß 0123456789,-\'"()[]',
            // German-specific optimizations
            tessedit_write_images: false,
            tessedit_create_hocr: false,
            tessjs_create_pdf: false
        };
        
        return await this.ocrService.recognizeText(canvas, 'deu+eng', ocrConfig);
    }
    
    // Enhanced German card name extraction and suggestions
    extractGermanCardSuggestions(ocrResult) {
        let text = ocrResult.text || '';
        
        // Clean up German OCR text specifically
        text = this.cleanGermanOCRText(text);
        
        const suggestions = [];
        
        if (text && text.length >= 3) {
            // Add cleaned full text
            suggestions.push({
                text: text,
                confidence: ocrResult.confidence || 0,
                source: 'full_text_cleaned'
            });
            
            // Try various German text cleaning strategies
            const variations = this.generateGermanTextVariations(text);
            variations.forEach((variation, index) => {
                suggestions.push({
                    text: variation,
                    confidence: Math.max(0, (ocrResult.confidence || 0) - (index + 1) * 5),
                    source: `german_variation_${index + 1}`
                });
            });
        }
        
        // Remove duplicates and sort by confidence
        const uniqueSuggestions = suggestions
            .filter((suggestion, index, self) => 
                self.findIndex(s => s.text.toLowerCase() === suggestion.text.toLowerCase()) === index
            )
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5); // Top 5 suggestions
            
        return uniqueSuggestions;
    }
    
    // Clean German OCR text with specific patterns
    cleanGermanOCRText(text) {
        if (!text) return '';
        
        let cleaned = text;
        
        // String-based replacements for German characters
        const stringReplacements = {
            // Umlaut corrections
            'ü': 'ü', 'ä': 'ä', 'ö': 'ö',
            'Ü': 'Ü', 'Ä': 'Ä', 'Ö': 'Ö',
            'ß': 'ß',
            // Common OCR character mistakes
            '§': 'ß',
            '(3': 'ß', 
            '|3': 'ß',
            'cl': 'd',
            'rn': 'm',
            '\\': '/'
        };
        
        // Apply string replacements
        Object.entries(stringReplacements).forEach(([pattern, replacement]) => {
            cleaned = cleaned.replaceAll(pattern, replacement);
        });
        
        // Apply regex-based cleaning
        // Remove common OCR artifacts
        cleaned = cleaned.replace(/[`~@#$%^&*+={}\[\]|<>]/g, '');
        
        // Fix spacing issues
        cleaned = cleaned.replace(/\s{2,}/g, ' ');
        cleaned = cleaned.replace(/^\s+|\s+$/g, '');
        
        return cleaned;
    }
    
    // Generate variations of German text for better matching
    generateGermanTextVariations(text) {
        const variations = [];
        
        // Remove punctuation
        variations.push(text.replace(/[.,;:!?\-"'()\[\]]/g, '').trim());
        
        // Try common word splits/joins for German compounds
        const words = text.split(/\s+/);
        if (words.length > 1) {
            // Join all words (compound words)
            variations.push(words.join(''));
            
            // Try different combinations
            if (words.length === 2) {
                variations.push(words.join(' '));
            }
        }
        
        // Fix common German title case issues
        const titleCased = text.split(' ').map(word => {
            if (word.length > 0) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word;
        }).join(' ');
        variations.push(titleCased);
        
        // Remove duplicates and empty strings
        return [...new Set(variations)].filter(v => v && v.length >= 3);
    }

    async processManually() {
        const cardName = await this.promptForCardName();
        if (cardName) {
            await this.searchAndAddCard(cardName);
        }
    }

    // Manual card name input fallback
    async promptForCardName() {
        return new Promise((resolve) => {
            const cardName = prompt('Kartenname eingeben:');
            resolve(cardName ? cardName.trim() : null);
        });
    }

    async loadCards() {
        try {
            this.currentCards = await this.database.getAllCards();
            this.renderCardList();
            this.updateCardCount();
        } catch (error) {
            console.error('Fehler beim Laden der Karten:', error);
            this.showError('Fehler beim Laden der Karten');
        }
    }

    renderCardList() {
        const cardListContainer = document.getElementById('cardList');

        if (this.currentCards.length === 0) {
            cardListContainer.innerHTML = `
                <div class="empty-state">
                    <p>Noch keine Karten gescannt. Verwende die Kamera, um zu beginnen!</p>
                </div>
            `;
            return;
        }

        let html = '';
        for (const card of this.currentCards) {
            html += this.generateCardHTML(card);
        }

        cardListContainer.innerHTML = html;

        // Add click handlers for card items
        cardListContainer.querySelectorAll('.card-item').forEach(item => {
            item.addEventListener('click', () => {
                const cardId = parseInt(item.dataset.cardId);
                this.showCardDetails(cardId);
            });
        });
    }

    generateCardHTML(card) {
        const imageUrl = this.getCardImageUrl(card);

        return `
            <div class="card-item" data-card-id="${card.id}">
                <div class="card-image">
                    <img src="${imageUrl}" alt="${card.name}" loading="lazy">
                    <div class="quantity-badge">${card.quantity}</div>
                </div>
                <div class="card-info">
                    <h3 class="card-name">${card.name}</h3>
                    <p class="card-set">${card.set} (${card.setCode})</p>
                    <p class="card-type">${card.typeLine || ''}</p>
                    ${card.manaCost ? `<div class="mana-cost">${card.manaCost}</div>` : ''}
                </div>
            </div>
        `;
    }

    showCardDetails(cardId) {
        const card = this.currentCards.find(c => c.id === cardId);
        if (!card) return;

        this.currentEditCard = card;

        // Populate modal with card data
        document.getElementById('modalCardName').textContent = card.name;
        document.getElementById('modalCardImage').src = this.getCardImageUrl(card);
        document.getElementById('modalCardSet').textContent = card.set || '';
        document.getElementById('modalCardType').textContent = card.typeLine || '';
        document.getElementById('modalCardCost').textContent = card.manaCost || '';
        document.getElementById('cardQuantity').value = card.quantity || 1;

        // Show modal
        document.getElementById('cardModal').style.display = 'flex';
    }

    // Helper method to get the appropriate image URL for a card
    getCardImageUrl(card) {
        // If we have stored image data (blob), convert it to data URL
        if (card.imageData) {
            try {
                return this.blobToDataURL(card.imageData);
            } catch (error) {
                console.warn('Failed to convert blob to data URL for card:', card.name, error);
            }
        }

        // Fallback to external URL or default image
        return card.imageUrl || 'assets/default-card.png';
    }

    // Convert blob to data URL for display
    blobToDataURL(blob) {
        if (!blob) return 'assets/default-card.png';

        // Create object URL for the blob
        return URL.createObjectURL(blob);
    }

    closeModal() {
        document.getElementById('cardModal').style.display = 'none';
        this.currentEditCard = null;
    }

    async saveCardChanges() {
        if (!this.currentEditCard) return;

        try {
            const newQuantity = parseInt(document.getElementById('cardQuantity').value);

            if (isNaN(newQuantity) || newQuantity < 1) {
                this.showError('Bitte geben Sie eine gültige Anzahl ein');
                return;
            }

            await this.database.updateCard(this.currentEditCard.id, { quantity: newQuantity });

            this.closeModal();
            await this.loadCards();

            this.showSuccess('Karte wurde aktualisiert');

        } catch (error) {
            console.error('Fehler beim Speichern:', error);
            this.showError('Fehler beim Speichern der Änderungen');
        }
    }

    async deleteCurrentCard() {
        if (!this.currentEditCard) return;

        if (confirm(`Möchten Sie "${this.currentEditCard.name}" wirklich löschen?`)) {
            try {
                await this.database.deleteCard(this.currentEditCard.id);

                this.closeModal();
                await this.loadCards();

                this.showSuccess('Karte wurde gelöscht');

            } catch (error) {
                console.error('Fehler beim Löschen:', error);
                this.showError('Fehler beim Löschen der Karte');
            }
        }
    }

    async clearCollection() {
        if (confirm('Möchten Sie wirklich alle Karten löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            try {
                await this.database.clearAllCards();
                await this.loadCards();

                this.showSuccess('Alle Karten wurden gelöscht');

            } catch (error) {
                console.error('Fehler beim Löschen der Sammlung:', error);
                this.showError('Fehler beim Löschen der Sammlung');
            }
        }
    }

    async exportToCSV() {
        try {
            if (this.currentCards.length === 0) {
                this.showError('Keine Karten zum Exportieren vorhanden');
                return;
            }

            this.csvExporter.validateCards(this.currentCards);
            this.csvExporter.exportToMoxfield(this.currentCards);

            this.showSuccess(`${this.currentCards.length} Karten erfolgreich exportiert!`);

        } catch (error) {
            console.error('Export-Fehler:', error);
            this.showError('Export-Fehler: ' + error.message);
        }
    }

    updateCardCount() {
        const count = this.currentCards.length;
        document.getElementById('cardCount').textContent = count;
    }

    showProcessingStatus(show, message = 'Karte wird verarbeitet...') {
        const statusElement = document.getElementById('processingStatus');
        const statusText = document.getElementById('statusText');
        statusElement.style.display = show ? 'flex' : 'none';
        if (statusText && message) {
            statusText.textContent = message;
        }
    }

    showOCRProgress(show) {
        const progressElement = document.getElementById('ocrProgress');
        progressElement.style.display = show ? 'block' : 'none';
        if (!show) {
            // Reset progress
            this.updateOCRProgress(0);
        }
    }

    updateOCRProgress(progress) {
        const progressFill = document.getElementById('progressFill');
        const progressPercentage = document.getElementById('ocrPercentage');

        const percentage = Math.round(progress * 100);

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }

        if (progressPercentage) {
            progressPercentage.textContent = `${percentage}%`;
        }
    }

    updateOCRStatus(status) {
        const statusText = document.getElementById('ocrStatusText');
        if (statusText) {
            statusText.textContent = status;
        }
    }

    displayOCRResults(ocrResult, suggestions) {
        // Hide processing indicators
        this.showProcessingStatus(false);
        this.showOCRProgress(false);

        // Show recognized text
        const recognizedTextElement = document.getElementById('recognizedText');
        if (recognizedTextElement) {
            recognizedTextElement.textContent = ocrResult.text || 'Kein Text erkannt';
        }

        // Show suggestions
        this.displayCardSuggestions(suggestions);

        // Show OCR results panel
        const ocrResultsElement = document.getElementById('ocrResults');
        ocrResultsElement.style.display = 'block';

        // Auto-select best suggestion if available
        if (suggestions && suggestions.length > 0) {
            this.selectSuggestion(0);
        }
    }

    displayCardSuggestions(suggestions) {
        const suggestionsList = document.getElementById('suggestionsList');

        if (!suggestions || suggestions.length === 0) {
            suggestionsList.innerHTML = '<div class="suggestions-empty">Keine Kartennamen erkannt</div>';
            return;
        }

        let html = '';
        suggestions.forEach((suggestion, index) => {
            const confidence = Math.round(suggestion.confidence);
            const sourceIcon = this.getSourceIcon(suggestion.source);
            html += `
                <div class="suggestion-item" data-index="${index}" onclick="window.mtgScanner.selectSuggestion(${index})">
                    <div class="suggestion-content">
                        <span class="suggestion-text">${suggestion.text}</span>
                        <div class="suggestion-meta">
                            <span class="suggestion-source" title="${suggestion.source}">${sourceIcon}</span>
                            <span class="suggestion-confidence">${confidence}%</span>
                        </div>
                    </div>
                </div>
            `;
        });

        suggestionsList.innerHTML = html;
    }

    selectSuggestion(index) {
        // Remove previous selection
        document.querySelectorAll('.suggestion-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select new item
        const selectedItem = document.querySelector(`[data-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
            this.selectedSuggestion = this.currentOCRResult.suggestions[index];
        }
    }

    async acceptOCRResult() {
        try {
            this.showProcessingStatus(true, 'Karte wird gesucht...');

            if (this.currentOCRResult && this.currentOCRResult.suggestions.length > 0) {
                // Use enhanced Scryfall search with all suggestions
                const searchResult = await this.scryfallAPI.searchCardFromOCRSuggestions(
                    this.currentOCRResult.suggestions
                );

                if (searchResult && searchResult.card) {
                    // Add the found card to database
                    await this.database.addCard(searchResult.card);
                    await this.loadCards();

                    this.showSuccess(
                        `Karte "${searchResult.card.name}" wurde hinzugefügt! ` +
                        `(${searchResult.matchType} match für "${searchResult.matchedSuggestion.text}")`
                    );
                } else {
                    this.showError('Keine passende Karte für die OCR-Ergebnisse gefunden');
                }
            } else {
                this.showError('Keine OCR-Vorschläge verfügbar');
            }
        } catch (error) {
            console.error('Fehler beim Verarbeiten des OCR-Ergebnisses:', error);
            this.showError('Fehler beim Suchen der Karte: ' + error.message);
        } finally {
            this.showProcessingStatus(false);
            this.hideOCRResults();
        }
    }

    async showManualInput() {
        this.hideOCRResults();
        await this.processManually();
    }

    async retryOCR() {
        try {
            this.hideOCRResults();

            // Retry with the last captured image but with different preprocessing
            if (this.camera.canvas) {
                this.showProcessingStatus(true, 'OCR wird wiederholt...');

                // Create a copy of the canvas for different preprocessing
                const retryCanvas = document.createElement('canvas');
                retryCanvas.width = this.camera.canvas.width;
                retryCanvas.height = this.camera.canvas.height;
                const retryContext = retryCanvas.getContext('2d');
                retryContext.drawImage(this.camera.canvas, 0, 0);

                const capturedImage = { canvas: retryCanvas };
                await this.processWithOCR(capturedImage);
            } else {
                this.showError('Kein Bild zum erneuten Verarbeiten verfügbar');
            }
        } catch (error) {
            console.error('Fehler beim OCR-Retry:', error);
            this.showError('OCR-Wiederholung fehlgeschlagen: ' + error.message);
        } finally {
            this.showProcessingStatus(false);
        }
    }

    hideOCRResults() {
        const ocrResultsElement = document.getElementById('ocrResults');
        ocrResultsElement.style.display = 'none';
        this.currentOCRResult = null;
        this.selectedSuggestion = null;
    }

    async searchAndAddCard(cardName) {
        try {
            this.showProcessingStatus(true, 'Karte wird gesucht...');

            // Search for card using Scryfall
            const cardData = await this.scryfallAPI.searchCardByName(cardName);

            if (cardData) {
                // Add to database
                await this.database.addCard(cardData);

                // Reload cards display
                await this.loadCards();

                this.showSuccess(`Karte "${cardData.name}" wurde hinzugefügt!`);
            } else {
                this.showError('Karte nicht gefunden');
            }
        } catch (error) {
            console.error('Fehler beim Suchen der Karte:', error);
            this.showError('Kartennamen konnte nicht gefunden werden: ' + error.message);
        } finally {
            this.showProcessingStatus(false);
        }
    }


    showError(message) {
        // Simple error display - in production, use a proper notification system
        alert('❌ ' + message);
    }

    showSuccess(message) {
        // Simple success display - in production, use a proper notification system
        alert('✅ ' + message);
    }

    showInfo(message) {
        // Simple info display - in production, use a proper notification system
        alert('ℹ️ ' + message);
    }

    getSourceIcon(source) {
        const iconMap = {
            'line': '📝',
            'line_variation': '🔄',
            'word_combination': '🔗',
            'full_text': '📄',
            'capital_start_pattern': '🔤',
            'pattern_match': '🎯'
        };
        return iconMap[source] || '❓';
    }

    // Debug Mode Methods
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        const debugSection = document.getElementById('debugSection');
        const toggleButton = document.getElementById('toggleDebug');

        if (this.debugMode) {
            debugSection.style.display = 'block';
            toggleButton.textContent = '🔬 Debug Aktiv';
            toggleButton.style.backgroundColor = '#0891b2';
            this.addDebugLog('Debug mode activated', 'info');

            // If we have a last captured image, display it immediately
            if (this.lastCapturedImage) {
                this.updateDebugImages(this.lastCapturedImage.original, this.lastCapturedImage.processed);
            }
        } else {
            debugSection.style.display = 'none';
            toggleButton.textContent = '🔬 Debug Modus';
            toggleButton.style.backgroundColor = '';
        }
    }

    closeDebugMode() {
        this.debugMode = false;
        document.getElementById('debugSection').style.display = 'none';
        const toggleButton = document.getElementById('toggleDebug');
        toggleButton.textContent = '🔬 Debug Modus';
        toggleButton.style.backgroundColor = '';
        
        // Clean up dynamically created debug containers
        this.cleanupDebugContainers();
    }
    
    // Clean up dynamically created debug containers
    cleanupDebugContainers() {
        const containersToClean = [
            'regionExtractionResults',
            'processingStepsContainer', 
            'ocrScoreBreakdown',
            'imageAnalysisResults'
        ];
        
        containersToClean.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.remove();
            }
        });
    }

    addDebugLog(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message, level };
        this.debugLog.push(logEntry);

        // Keep only last 50 entries
        if (this.debugLog.length > 50) {
            this.debugLog = this.debugLog.slice(-50);
        }

        if (this.debugMode) {
            this.updateDebugLog();
        }

        console.log(`[DEBUG ${level.toUpperCase()}] ${message}`);
    }

    updateDebugLog() {
        const logContainer = document.getElementById('debugProcessingLog');
        if (!logContainer) return;

        logContainer.innerHTML = this.debugLog
            .slice(-20) // Show only last 20 entries
            .map(entry => `
                <div class="debug-log-entry">
                    <span class="debug-log-timestamp">${entry.timestamp}</span>
                    <span class="debug-log-message debug-log-level-${entry.level}">${entry.message}</span>
                </div>
            `).join('');

        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    updateDebugImages(originalCanvas, processedCanvas, regionExtraction = null) {
        if (!this.debugMode) return;

        const debugOriginal = document.getElementById('debugOriginalCanvas');
        const debugProcessed = document.getElementById('debugProcessedCanvas');

        if (originalCanvas && debugOriginal) {
            debugOriginal.width = originalCanvas.width;
            debugOriginal.height = originalCanvas.height;
            const ctx = debugOriginal.getContext('2d');
            ctx.drawImage(originalCanvas, 0, 0);
        }

        if (processedCanvas && debugProcessed) {
            debugProcessed.width = processedCanvas.width;
            debugProcessed.height = processedCanvas.height;
            const ctx = debugProcessed.getContext('2d');
            ctx.drawImage(processedCanvas, 0, 0);
        }
        
        // Show region extraction results if available and enabled
        if (regionExtraction && regionExtraction.debugResults && document.getElementById('showRegionExtractions')?.checked) {
            this.updateDebugRegionExtractionResults(regionExtraction);
        }
        
        // Store captured images for processing steps display
        this.lastCapturedImage = {
            original: originalCanvas,
            processed: processedCanvas
        };
    }

    updateDebugOCRResults(ocrResult) {
        if (!this.debugMode || !ocrResult) return;

        const debugResults = document.getElementById('debugOCRResults');
        if (!debugResults) return;

        let html = '';

        // Show all attempted configurations
        if (ocrResult.allResults && ocrResult.allResults.length > 0) {
            html += '<h5>🔍 Alle OCR Versuche:</h5>';
            ocrResult.allResults.forEach((result, index) => {
                const confidence = Math.round(result.confidence || 0);
                const confidenceClass = confidence > 80 ? 'high' : confidence > 50 ? 'medium' : 'low';

                html += `
                    <div class="debug-result-item">
                        <h5>Konfiguration: ${result.config}</h5>
                        <p><strong>Text:</strong> "${result.text || 'Kein Text erkannt'}"</p>
                        <p><strong>Vertrauen:</strong> <span class="confidence ${confidenceClass}">${confidence}%</span></p>
                        ${result.error ? `<p><strong>Fehler:</strong> ${result.error}</p>` : ''}
                    </div>
                `;
            });
        }

        // Show final result
        html += `
            <h5>✅ Finales Ergebnis:</h5>
            <div class="debug-result-item">
                <p><strong>Bereinigter Text:</strong> "${ocrResult.text}"</p>
                <p><strong>Vertrauen:</strong> <span class="confidence">${Math.round(ocrResult.confidence || 0)}%</span></p>
                <p><strong>Wörter erkannt:</strong> ${ocrResult.words ? ocrResult.words.length : 0}</p>
                <p><strong>Zeilen erkannt:</strong> ${ocrResult.lines ? ocrResult.lines.length : 0}</p>
            </div>
        `;

        debugResults.innerHTML = html;
    }

    downloadDebugImage(type) {
        const canvas = type === 'original'
            ? document.getElementById('debugOriginalCanvas')
            : document.getElementById('debugProcessedCanvas');

        if (!canvas) {
            this.showError('Kein Bild zum Herunterladen verfügbar');
            return;
        }

        const link = document.createElement('a');
        link.download = `mtg_debug_${type}_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL();
        link.click();

        this.addDebugLog(`Downloaded ${type} image`, 'info');
    }

    async retestOCRDebug() {
        if (!this.lastCapturedImage || !this.lastCapturedImage.original) {
            this.showError('Kein Bild für erneuten OCR-Test verfügbar');
            return;
        }

        try {
            this.addDebugLog('Starting enhanced OCR retest with region extraction analysis', 'info');

            const useAllConfigs = document.getElementById('useAllConfigs').checked;
            const showSteps = document.getElementById('showIntermediateSteps').checked;

            // Re-run preprocessing with debug mode to get detailed region extraction
            const processedCanvas = this.camera.preprocessForOCR(this.lastCapturedImage.original, true);
            const regionExtraction = this.camera.getLastRegionExtraction();
            
            // Update debug display with new region extraction results
            this.updateDebugImages(this.lastCapturedImage.original, processedCanvas, regionExtraction);
            
            // Show additional debug information based on settings
            if (document.getElementById('showIntermediateSteps')?.checked) {
                const processingSteps = this.camera.getLastProcessingSteps();
                if (processingSteps.length > 0) {
                    this.showProcessingSteps(this.lastCapturedImage.original, processingSteps);
                }
            }
            
            if (document.getElementById('showImageAnalysis')?.checked) {
                const imageAnalysis = this.camera.getLastImageAnalysis();
                if (imageAnalysis) {
                    this.showImageAnalysisResults(imageAnalysis);
                }
            }
            
            // Run OCR with debug options
            const ocrResult = await this.ocrService.recognizeText(
                processedCanvas,
                { useAllConfigs, showIntermediateSteps: showSteps }
            );

            this.addDebugLog(`Enhanced OCR retest completed. Best result: "${ocrResult.text}"`, 'info');
            this.updateDebugOCRResults(ocrResult);
            
            // Show additional debug information based on settings
            if (document.getElementById('showScoreBreakdown')?.checked) {
                this.showOCRScoreBreakdown(ocrResult);
            }
            
            // Show processing steps if available and enabled
            if (document.getElementById('showIntermediateSteps')?.checked) {
                const processingSteps = this.camera.getLastProcessingSteps();
                if (processingSteps.length > 0) {
                    this.showProcessingSteps(this.lastCapturedImage.original, processingSteps);
                }
            }
            
            // Show image analysis results if enabled
            if (document.getElementById('showImageAnalysis')?.checked) {
                const imageAnalysis = this.camera.getLastImageAnalysis();
                if (imageAnalysis) {
                    this.showImageAnalysisResults(imageAnalysis);
                }
            }

        } catch (error) {
            this.addDebugLog(`OCR retest failed: ${error.message}`, 'error');
            this.showError('OCR-Test fehlgeschlagen: ' + error.message);
        }
    }
    
    // New method to update debug region extraction results
    updateDebugRegionExtractionResults(regionExtraction) {
        if (!this.debugMode || !regionExtraction.debugResults) return;
        
        // Check if region extraction display is enabled
        if (!document.getElementById('showRegionExtractions')?.checked) return;
        
        const debugLog = document.getElementById('debugProcessingLog');
        if (!debugLog) return;
        
        // Add region extraction results to the debug log
        this.addDebugLog(`Region extraction completed using method: ${regionExtraction.method}`, 'info');
        
        if (regionExtraction.quality) {
            this.addDebugLog(`Quality score: ${(regionExtraction.quality.score * 100).toFixed(1)}% - ${regionExtraction.quality.reasons?.join(', ') || 'No details'}`, 'info');
        }
        
        // Create region extraction debug section if it doesn't exist
        let regionDebugSection = document.getElementById('regionExtractionResults');
        if (!regionDebugSection) {
            regionDebugSection = document.createElement('div');
            regionDebugSection.id = 'regionExtractionResults';
            regionDebugSection.className = 'debug-region-results';
            
            const debugResults = document.getElementById('debugOCRResults');
            if (debugResults && debugResults.parentNode) {
                debugResults.parentNode.insertBefore(regionDebugSection, debugResults);
            }
        }
        
        let html = '<h4>🎯 Region Extraction Results</h4><div class="region-extraction-grid">';
        
        // Show all attempted strategies with their extracted images
        regionExtraction.debugResults.forEach((result, index) => {
            const scoreClass = result.quality.score > 0.7 ? 'high' : result.quality.score > 0.4 ? 'medium' : 'low';
            
            html += `
                <div class="debug-result-item ${result.method === regionExtraction.method ? 'selected' : ''}">
                    <h5>Strategy ${index + 1}: ${result.method} ${result.method === regionExtraction.method ? '✅' : ''}</h5>
                    <div class="region-info">
                        <p><strong>Priority:</strong> ${result.priority}</p>
                        <p><strong>Quality Score:</strong> <span class="confidence ${scoreClass}">${(result.quality.score * 100).toFixed(1)}%</span></p>
                        ${result.quality.reasons ? `<p><strong>Reasons:</strong> ${result.quality.reasons.join(', ')}</p>` : ''}
                        ${result.quality.aspectRatio ? `<p><strong>Aspect Ratio:</strong> ${result.quality.aspectRatio.toFixed(2)}</p>` : ''}
                        ${result.quality.sizeRatio ? `<p><strong>Size Ratio:</strong> ${(result.quality.sizeRatio * 100).toFixed(1)}%</p>` : ''}
                        ${result.quality.contentScore ? `<p><strong>Content Score:</strong> ${(result.quality.contentScore * 100).toFixed(1)}%</p>` : ''}
                        ${result.canvas ? `<p><strong>Dimensions:</strong> ${result.canvas.width}x${result.canvas.height}</p>` : '<p><strong>Status:</strong> Failed</p>'}
                    </div>
                    ${result.canvas ? `
                        <div class="region-preview">
                            <canvas class="region-canvas" width="${result.canvas.width}" height="${result.canvas.height}"></canvas>
                            <button class="btn btn-small" onclick="window.mtgScanner.downloadRegionImage(${index}, '${result.method}')">💾 Download</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        regionDebugSection.innerHTML = html;
        
        // Draw the region extraction canvases
        setTimeout(() => {
            const canvases = regionDebugSection.querySelectorAll('.region-canvas');
            canvases.forEach((canvas, index) => {
                if (regionExtraction.debugResults[index] && regionExtraction.debugResults[index].canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(regionExtraction.debugResults[index].canvas, 0, 0);
                }
            });
        }, 100);
        
        // Store region results for download functionality
        this.lastRegionExtractionResults = regionExtraction.debugResults;
    }
    
    // Enhanced method to show intermediate processing steps
    showProcessingSteps(originalCanvas, steps) {
        if (!this.debugMode) return;
        
        // Create processing steps container if it doesn't exist
        let stepsContainer = document.getElementById('processingStepsContainer');
        if (!stepsContainer) {
            stepsContainer = document.createElement('div');
            stepsContainer.id = 'processingStepsContainer';
            stepsContainer.className = 'debug-processing-steps';
            
            const debugContent = document.querySelector('.debug-content');
            if (debugContent) {
                debugContent.appendChild(stepsContainer);
            }
        }
        
        let html = '<h4>🔄 Processing Steps</h4><div class="processing-steps-grid">';
        
        // Show original
        html += `
            <div class="processing-step">
                <h5>Original Image</h5>
                <canvas class="step-canvas" width="${originalCanvas.width}" height="${originalCanvas.height}"></canvas>
                <button class="btn btn-small" onclick="window.mtgScanner.downloadStepImage(this, 'original')">💾 Download</button>
            </div>
        `;
        
        // Show each processing step
        steps.forEach((step, index) => {
            html += `
                <div class="processing-step">
                    <h5>${step.name}</h5>
                    <canvas class="step-canvas" width="${step.canvas.width}" height="${step.canvas.height}"></canvas>
                    <button class="btn btn-small" onclick="window.mtgScanner.downloadStepImage(this, 'step_${index}')">💾 Download</button>
                    ${step.description ? `<p class="step-description">${step.description}</p>` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        stepsContainer.innerHTML = html;
        
        // Draw images to canvases
        const canvases = stepsContainer.querySelectorAll('.step-canvas');
        if (canvases.length > 0) {
            // Draw original
            const originalCtx = canvases[0].getContext('2d');
            originalCtx.drawImage(originalCanvas, 0, 0);
            
            // Draw steps
            steps.forEach((step, index) => {
                if (canvases[index + 1]) {
                    const ctx = canvases[index + 1].getContext('2d');
                    ctx.drawImage(step.canvas, 0, 0);
                }
            });
        }
    }
    
    // Method to download step images
    downloadStepImage(button, stepName) {
        const canvas = button.parentElement.querySelector('.step-canvas');
        if (!canvas) {
            this.showError('No canvas found for download');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `mtg_debug_${stepName}_${new Date().getTime()}.png`;
        link.href = canvas.toDataURL();
        link.click();
        
        this.addDebugLog(`Downloaded ${stepName} image`, 'info');
    }
    
    // Method to download region extraction images
    downloadRegionImage(index, methodName) {
        if (!this.lastRegionExtractionResults || !this.lastRegionExtractionResults[index]) {
            this.showError('Region extraction result not available');
            return;
        }
        
        const result = this.lastRegionExtractionResults[index];
        if (!result.canvas) {
            this.showError('Canvas not available for this region');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `mtg_debug_region_${methodName}_${new Date().getTime()}.png`;
        link.href = result.canvas.toDataURL();
        link.click();
        
        this.addDebugLog(`Downloaded region image: ${methodName}`, 'info');
    }
    
    // Enhanced method to show OCR score breakdown
    showOCRScoreBreakdown(ocrResult) {
        if (!this.debugMode || !ocrResult.allResults) return;
        
        let breakdownContainer = document.getElementById('ocrScoreBreakdown');
        if (!breakdownContainer) {
            breakdownContainer = document.createElement('div');
            breakdownContainer.id = 'ocrScoreBreakdown';
            breakdownContainer.className = 'debug-score-breakdown';
            
            const debugOCRResults = document.getElementById('debugOCRResults');
            if (debugOCRResults) {
                debugOCRResults.appendChild(breakdownContainer);
            }
        }
        
        let html = '<h5>📊 OCR Score Breakdown</h5>';
        
        // Show detailed scoring for each configuration result
        ocrResult.allResults.forEach((result, index) => {
            if (result.scoreBreakdown) {
                html += `
                    <div class="score-breakdown-item">
                        <h6>Configuration: ${result.config}</h6>
                        <div class="score-details">
                            <p><strong>Base Score:</strong> ${result.scoreBreakdown.base || 0}</p>
                            ${result.scoreBreakdown.length ? `<p><strong>Length Bonus:</strong> ${result.scoreBreakdown.length}</p>` : ''}
                            ${result.scoreBreakdown.position ? `<p><strong>Position Bonus:</strong> ${result.scoreBreakdown.position}</p>` : ''}
                            ${result.scoreBreakdown.earlyText ? `<p><strong>Early Text Bonus:</strong> ${result.scoreBreakdown.earlyText}</p>` : ''}
                            ${result.scoreBreakdown.firstLineExact ? `<p><strong>First Line Exact:</strong> ${result.scoreBreakdown.firstLineExact}</p>` : ''}
                            ${result.scoreBreakdown.wordCount ? `<p><strong>Word Count Bonus:</strong> ${result.scoreBreakdown.wordCount}</p>` : ''}
                            ${result.scoreBreakdown.source ? `<p><strong>Source Bonus:</strong> ${result.scoreBreakdown.source}</p>` : ''}
                            ${result.scoreBreakdown.letters ? `<p><strong>Letter Composition:</strong> ${result.scoreBreakdown.letters}</p>` : ''}
                        </div>
                        <p class="final-score"><strong>Final Score:</strong> ${result.finalScore || result.confidence || 0}</p>
                    </div>
                `;
            }
        });
        
        breakdownContainer.innerHTML = html;
    }
    
    // Method to show image analysis results
    showImageAnalysisResults(analysisData) {
        if (!this.debugMode || !analysisData) return;
        
        let analysisContainer = document.getElementById('imageAnalysisResults');
        if (!analysisContainer) {
            analysisContainer = document.createElement('div');
            analysisContainer.id = 'imageAnalysisResults';
            analysisContainer.className = 'debug-image-analysis';
            
            const debugContent = document.querySelector('.debug-content');
            if (debugContent) {
                // Insert after debug images section
                const debugImages = debugContent.querySelector('.debug-images');
                if (debugImages && debugImages.nextSibling) {
                    debugContent.insertBefore(analysisContainer, debugImages.nextSibling);
                } else {
                    debugContent.appendChild(analysisContainer);
                }
            }
        }
        
        let html = '<h4>🔍 Image Analysis Results</h4>';
        
        html += `
            <div class="analysis-grid">
                <div class="analysis-item">
                    <h5>Brightness Analysis</h5>
                    <p><strong>Average Brightness:</strong> ${analysisData.brightness?.toFixed(1) || 'N/A'}</p>
                    <p><strong>Is Low Light:</strong> ${analysisData.isLowLight ? '✅ Yes' : '❌ No'}</p>
                    <p><strong>Is High Light:</strong> ${analysisData.isHighLight ? '✅ Yes' : '❌ No'}</p>
                </div>
                <div class="analysis-item">
                    <h5>Color Analysis</h5>
                    <p><strong>Colorfulness:</strong> ${analysisData.colorfulness?.toFixed(1) || 'N/A'}</p>
                    <p><strong>Is Colorful:</strong> ${analysisData.isColorful ? '✅ Yes' : '❌ No'}</p>
                </div>
                <div class="analysis-item">
                    <h5>Processing Decisions</h5>
                    <p><strong>Needs Enhancement:</strong> ${analysisData.needsEnhancement ? '✅ Yes' : '❌ No'}</p>
                    <p><strong>Applied Corrections:</strong></p>
                    <ul>
                        ${analysisData.isLowLight ? '<li>Gamma correction for low light</li>' : ''}
                        ${analysisData.isHighLight ? '<li>Gamma correction for overexposure</li>' : ''}
                        ${analysisData.needsEnhancement ? '<li>Adaptive contrast enhancement</li>' : ''}
                    </ul>
                </div>
            </div>
        `;
        
        analysisContainer.innerHTML = html;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mtgScanner = new MTGScannerApp();
});

// Add service worker registration for PWA capabilities (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('SW registered'))
            .catch(error => console.log('SW registration failed'));
    });
}
