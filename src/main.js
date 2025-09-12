// Simple MTG Scanner - Main Application
class MTGScanner {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.stream = null;
        this.isProcessing = false;
        this.cards = JSON.parse(localStorage.getItem('mtg-collection') || '[]');

        this.initElements();
        this.initEventListeners();
        this.updateCardCount();
        this.renderCollection();
    }

    initElements() {
        this.startCameraBtn = document.getElementById('startCamera');
        this.captureCardBtn = document.getElementById('captureCard');
        this.stopCameraBtn = document.getElementById('stopCamera');

        this.processingSection = document.getElementById('processingSection');
        this.resultsSection = document.getElementById('resultsSection');
        this.progressBar = document.getElementById('progressBar');
        this.statusText = document.getElementById('statusText');

        this.resultImage = document.getElementById('resultImage');
        this.resultName = document.getElementById('resultName');
        this.resultSet = document.getElementById('resultSet');
        this.addCardBtn = document.getElementById('addCard');
        this.retryOcrBtn = document.getElementById('retryOcr');

        this.cardCount = document.getElementById('cardCount');
        this.cardList = document.getElementById('cardList');
        this.exportCollectionBtn = document.getElementById('exportCollection');
        this.clearCollectionBtn = document.getElementById('clearCollection');
    }

    initEventListeners() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.captureCardBtn.addEventListener('click', () => this.captureCard());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());

        this.addCardBtn.addEventListener('click', () => this.addCardToCollection());
        this.retryOcrBtn.addEventListener('click', () => this.retryOcr());

        this.exportCollectionBtn.addEventListener('click', () => this.exportCollection());
        this.clearCollectionBtn.addEventListener('click', () => this.clearCollection());
    }

    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1280 }
                }
            });

            this.video.srcObject = this.stream;

            this.startCameraBtn.disabled = true;
            this.captureCardBtn.disabled = false;
            this.stopCameraBtn.disabled = false;

        } catch (error) {
            alert('Kamera konnte nicht gestartet werden: ' + error.message);
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.startCameraBtn.disabled = false;
        this.captureCardBtn.disabled = true;
        this.stopCameraBtn.disabled = true;
    }


    async captureCardByCollectorNumber() {
        if (this.isProcessing) return;

        try {
            this.isProcessing = true;
            this.showProcessing(true);
            this.updateStatus('Bild wird aufgenommen...', 20);

            // Capture image from video
            const canvas = this.captureFromVideo();

            // Crop to card frame
            this.updateStatus('Karte wird zugeschnitten...', 40);
            const cardCanvas = this.cropToCardFrame(canvas);

            // Crop to collector number area (bottom left)
            this.updateStatus('Sammlernummer wird extrahiert...', 60);
            const collectorCanvas = this.cropToCollectorNumberArea(cardCanvas);

            // Simple image processing for collector numbers
            this.updateStatus('Bild wird optimiert...', 70);
            this.processCollectorNumberImage(collectorCanvas);

            // Store processed images for debugging
            this.lastCapturedImage = canvas.toDataURL();
            this.lastCardImage = cardCanvas.toDataURL();
            this.lastCollectorImage = collectorCanvas.toDataURL();

            // OCR for collector number with fallback strategy
            this.updateStatus('Sammlernummer wird erkannt...', 80);
            const collectorInfo = await this.performCollectorNumberOCRWithFallback(collectorCanvas);

            // Search card by collector number
            this.updateStatus('Karte wird gesucht...', 90);
            const cardData = await this.searchCardByCollectorNumber(collectorInfo);

            this.updateStatus('Fertig!', 100);

            if (cardData) {
                this.showResults(cardData, cardCanvas, `Sammlernummer: ${collectorInfo}`);
            } else {
                alert(`Karte mit Sammlernummer "${collectorInfo}" wurde nicht gefunden.`);
                // Show results anyway for debugging
                this.showResults({
                    name: `Unbekannte Karte (${collectorInfo})`,
                    set: 'Nicht gefunden',
                    image: '/assets/default-card.png'
                }, cardCanvas, collectorInfo);
            }

        } catch (error) {
            alert('Fehler beim Scannen: ' + error.message);
        } finally {
            this.isProcessing = false;
            this.showProcessing(false);
        }
    }

    async captureCard() {
        return this.captureCardByCollectorNumber();
    }

    captureFromVideo() {
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        return canvas;
    }

    cropToCardFrame(sourceCanvas) {
        // Calculate card frame position based on video dimensions
        const videoRect = this.video.getBoundingClientRect();
        const scaleX = sourceCanvas.width / videoRect.width;
        const scaleY = sourceCanvas.height / videoRect.height;

        // Card frame dimensions (300x420 from CSS, centered)
        const frameWidth = 300 * scaleX;
        const frameHeight = 420 * scaleY;
        const frameX = (sourceCanvas.width - frameWidth) / 2;
        const frameY = (sourceCanvas.height - frameHeight) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = frameWidth;
        canvas.height = frameHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(
            sourceCanvas,
            frameX, frameY, frameWidth, frameHeight,
            0, 0, frameWidth, frameHeight
        );

        return canvas;
    }


    cropToCollectorNumberArea(cardCanvas) {
        // OPTIMAL coordinates found via systematic testing: x=2%, y=85%, w=12%, h=8%
        const cropHeight = Math.floor(cardCanvas.height * 0.080);
        const cropWidth = Math.floor(cardCanvas.width * 0.200);
        const startY = Math.floor(cardCanvas.height * 0.900);
        const startX = Math.floor(cardCanvas.width * 0.001);

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(
            cardCanvas,
            startX, startY, cropWidth, cropHeight,
            0, 0, cropWidth, cropHeight
        );

        return canvas;
    }

    processImage(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Convert to grayscale and enhance contrast
        for (let i = 0; i < data.length; i += 4) {
            // Grayscale conversion
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            // Simple contrast enhancement
            const contrast = 1.5;
            const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));

            data[i] = enhanced;     // Red
            data[i + 1] = enhanced; // Green
            data[i + 2] = enhanced; // Blue
            // Alpha stays the same
        }

        ctx.putImageData(imageData, 0, 0);
    }

    processCollectorNumberImage(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // High contrast inversion processing (optimal approach from testing)
        for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            // High contrast enhancement (2.5x factor for better text separation)
            const enhanced = Math.max(0, Math.min(255, (gray - 128) * 2.5 + 128));

            // Invert colors: Tesseract works better with black text on white background
            // Most MTG collector numbers are white text on dark background
            const inverted = 255 - enhanced;

            data[i] = inverted;     // Red
            data[i + 1] = inverted; // Green
            data[i + 2] = inverted; // Blue
            // Alpha stays the same
        }

        ctx.putImageData(imageData, 0, 0);
        console.log('Applied high contrast collector number processing with color inversion');
    }


    // Clean OCR text to handle common issues like duplicated characters
    cleanOCRText(rawText) {
        if (!rawText) return '';

        let cleaned = rawText.trim().replace(/\s+/g, ' '); // Normalize whitespace

        // Handle duplicated rarity letters (Cc -> C, Uu -> U, etc.)
        cleaned = cleaned.replace(/^([CUMNR])\1+/i, '$1'); // Remove duplicates at start
        cleaned = cleaned.replace(/([CUMNR])\1+/gi, '$1');  // Remove duplicates anywhere

        // Handle duplicated digits (00100 -> 0100, but keep legitimate leading zeros)
        // Only remove duplicates that create obviously wrong patterns
        cleaned = cleaned.replace(/(\d)\1{3,}/g, '$1'); // Remove 4+ repeated digits

        // Clean up common OCR mistakes
        cleaned = cleaned.replace(/[|\\]/g, '1');     // Pipes and backslashes -> 1
        cleaned = cleaned.replace(/[O]/g, '0');        // Letter O -> number 0
        cleaned = cleaned.replace(/[Il]/g, '1');       // I, l -> 1
        cleaned = cleaned.replace(/[S]/g, '5');        // S -> 5 (sometimes)

        // Remove non-alphanumeric except spaces
        cleaned = cleaned.replace(/[^0-9A-Za-z\s]/g, '');

        // Final cleanup
        cleaned = cleaned.trim().replace(/\s+/g, ' ');

        return cleaned.toUpperCase();
    }

    // Fallback OCR strategy with multiple attempts
    async performCollectorNumberOCRWithFallback(cardCanvas) {
        const strategies = [
            {
                name: 'optimal',
                cropFunc: () => this.cropToCollectorNumberArea(cardCanvas),
                processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
            },
            {
                name: 'wider',
                cropFunc: () => this.cropToCollectorNumberAreaWider(cardCanvas),
                processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
            },
            {
                name: 'offsetRight',
                cropFunc: () => this.cropToCollectorNumberAreaOffset(cardCanvas),
                processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
            }
        ];

        let bestResult = { text: '', score: 0, strategy: 'none' };

        for (const strategy of strategies) {
            try {
                console.log(`Trying OCR strategy: ${strategy.name}`);

                const cropCanvas = strategy.cropFunc();
                const processedCanvas = strategy.processFunc(cropCanvas);
                const ocrResult = await this.performCollectorNumberOCR(processedCanvas);

                // Score the result
                const score = this.scoreCollectorNumberResult(ocrResult);

                if (score > bestResult.score) {
                    bestResult = {
                        text: ocrResult,
                        score: score,
                        strategy: strategy.name
                    };
                }

                // If we got a high-confidence result, use it immediately
                if (score >= 80) {
                    console.log(`High confidence result from ${strategy.name}: "${ocrResult}"`);
                    break;
                }

            } catch (error) {
                console.log(`Strategy ${strategy.name} failed:`, error.message);
            }
        }

        console.log(`Best OCR result: "${bestResult.text}" from ${bestResult.strategy} (score: ${bestResult.score})`);
        return bestResult.text;
    }

    // Alternative cropping methods for fallback
    cropToCollectorNumberAreaWider(cardCanvas) {
        // Slightly wider crop (20% width instead of 15%)
        const cropHeight = Math.floor(cardCanvas.height * 0.10);
        const cropWidth = Math.floor(cardCanvas.width * 0.20);
        const startY = cardCanvas.height - cropHeight;
        const startX = 0;

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(cardCanvas, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        return canvas;
    }

    cropToCollectorNumberAreaOffset(cardCanvas) {
        // Offset right by 5% in case collector number isn't at exact edge
        const cropHeight = Math.floor(cardCanvas.height * 0.10);
        const cropWidth = Math.floor(cardCanvas.width * 0.15);
        const startY = cardCanvas.height - cropHeight;
        const startX = Math.floor(cardCanvas.width * 0.05); // 5% offset

        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(cardCanvas, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        return canvas;
    }

    // Score OCR results to pick the best one
    scoreCollectorNumberResult(text) {
        if (!text) return 0;

        let score = 0;

        // Check for collector number patterns
        if (/^[A-Z]{3,4}\s+[CUMNR]\s+\d{3,4}$/.test(text)) {
            score = 100; // Perfect format: "FDN U 0125"
        } else if (/^[CUMNR]\s+\d{3,4}$/.test(text)) {
            score = 90;  // Good format: "U 0125"
        } else if (/^\d{3,4}$/.test(text)) {
            score = 80;  // Just number: "0125"
        } else if (/^[A-Z]{3,4}\s+\d{3,4}$/.test(text)) {
            score = 70;  // Set + number: "FDN 0125"
        } else if (/\d{3,4}/.test(text)) {
            score = 50;  // Contains 3-4 digits
        } else if (/[CUMNR]/.test(text) && /\d/.test(text)) {
            score = 40;  // Has rarity and some digits
        } else if (/\d{2}/.test(text)) {
            score = 30;  // At least 2 digits
        } else if (/\d/.test(text)) {
            score = 20;  // At least 1 digit
        } else if (/[CUMNR]/.test(text)) {
            score = 10;  // At least has rarity
        }

        return score;
    }

    async performCollectorNumberOCR(canvas) {
        // Load Tesseract.js if not already loaded
        if (!window.Tesseract) {
            await this.loadTesseract();
        }

        // OPTIMAL OCR configuration for collector numbers (found via systematic testing)
        const ocrConfig = {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = 80 + (m.progress * 10);
                    this.updateStatus(`Sammlernummer wird erkannt... ${Math.round(m.progress * 100)}%`, progress);
                }
            },
            tessedit_pageseg_mode: '13', // Raw line - treats image as single text line, bypassing hacks
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ' // Alphanumeric only
        };

        try {
            const result = await Tesseract.recognize(canvas, 'eng', ocrConfig); // Always use English for collector numbers
            const rawText = result.data.text || '';
            const cleanedText = this.cleanOCRText(rawText);

            console.log('Raw OCR result:', `"${rawText}"`);
            console.log('Cleaned OCR result:', `"${cleanedText}"`);

            return cleanedText;

        } catch (error) {
            console.error('Collector number OCR Error:', error);
            throw error;
        }
    }


    async loadTesseract() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/tesseract.js@v4.1.1/dist/tesseract.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async searchCardByCollectorNumber(collectorInfo) {
        try {
            // Parse collector number info (e.g., "FDN U 0125" or "U 0125")
            const parsed = this.parseCollectorNumber(collectorInfo);
            if (!parsed) {
                console.error('Could not parse collector number:', collectorInfo);
                return null;
            }

            const { setCode, collectorNumber } = parsed;

            // Use exact Scryfall lookup by set and collector number
            const response = await fetch(`https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`);

            if (response.ok) {
                const card = await response.json();
                return {
                    name: card.name,
                    set: card.set_name,
                    image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
                    id: card.id,
                    collectorNumber: card.collector_number,
                    setCode: card.set.toUpperCase()
                };
            } else if (response.status === 404) {
                console.log('Card not found with exact lookup, trying fallback search');
                // Fallback to fuzzy search if exact lookup fails
                return await this.searchCardFallback(collectorInfo);
            }
        } catch (error) {
            console.error('Card search error:', error);
        }

        return null;
    }

    parseCollectorNumber(collectorInfo) {
        // Clean the input
        const cleaned = collectorInfo.trim().toUpperCase();
        console.log('Parsing collector info:', cleaned);

        // Try different patterns for collector numbers
        const patterns = [
            // Pattern: "FDN U 0125" (set code + rarity + number)
            /^([A-Z0-9]{3,4})\s+[CUMNR]\s+(\d{1,4}[A-Z]?)$/,
            // Pattern: "U 0125" (rarity + number, no set)
            /^[CUMNR]\s+(\d{1,4}[A-Z]?)$/,
            // Pattern: "0125" (just number)
            /^(\d{1,4}[A-Z]?)$/,
            // Pattern: "FDN 125" (set + number)
            /^([A-Z0-9]{3,4})\s+(\d{1,4}[A-Z]?)$/
        ];

        for (const pattern of patterns) {
            const match = cleaned.match(pattern);
            if (match) {
                if (pattern.source.includes('([A-Z0-9]{3,4})')) {
                    // Has set code
                    return {
                        setCode: match[1],
                        collectorNumber: match[2] || match[1]
                    };
                } else {
                    // No set code, try to guess from recent sets
                    const guessedSet = this.guessRecentSet();
                    return {
                        setCode: guessedSet,
                        collectorNumber: match[1]
                    };
                }
            }
        }

        return null;
    }

    guessRecentSet() {
        // Common recent set codes - this could be made configurable
        const recentSets = ['FDN', 'DSK', 'BLB', 'OTJ', 'MKM', 'LCI', 'WOE'];
        return recentSets[0]; // Default to most recent
    }

    async searchCardFallback(collectorInfo) {
        // If exact lookup fails, we could try other approaches
        console.log('Attempting fallback search for:', collectorInfo);
        return null; // For now, just return null
    }


    showProcessing(show) {
        this.processingSection.style.display = show ? 'block' : 'none';
        //this.resultsSection.style.display = 'none';

        if (show) {
            this.progressBar.style.width = '0%';
        }
    }

    updateStatus(text, progress = 0) {
        this.statusText.textContent = text;
        this.progressBar.style.width = `${progress}%`;
    }

    showResults(cardData, cardImage, recognizedText = '') {
        this.processingSection.style.display = 'none';
        this.resultsSection.style.display = 'block';

        this.resultImage.src = cardData.image;
        this.resultName.textContent = cardData.name;
        this.resultSet.textContent = cardData.set;

        // Show recognized text for debugging
        const resultDetails = document.getElementById('resultDetails');
        if (resultDetails && recognizedText) {
            resultDetails.textContent = `Erkannter Text: "${recognizedText}"`;
        }

        this.currentCard = cardData;
        this.currentCardImage = cardImage.toDataURL();
    }

    addCardToCollection() {
        if (this.currentCard) {
            const existingCard = this.cards.find(c => c.id === this.currentCard.id);

            if (existingCard) {
                existingCard.count = (existingCard.count || 1) + 1;
            } else {
                this.cards.push({
                    ...this.currentCard,
                    count: 1,
                    addedAt: new Date().toISOString()
                });
            }

            this.saveCollection();
            this.updateCardCount();
            this.renderCollection();

            alert(`"${this.currentCard.name}" wurde zur Sammlung hinzugefügt!`);
        }
    }

    retryOcr() {
        this.captureCard();
    }



    updateCardCount() {
        this.cardCount.textContent = this.cards.length;
    }

    renderCollection() {
        this.cardList.innerHTML = '';

        this.cards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card-item';
            cardElement.innerHTML = `
                <img src="${card.image}" alt="${card.name}">
                <div class="card-item-info">
                    <h5>${card.name}</h5>
                    <p>${card.set}</p>
                    <p>Anzahl: ${card.count || 1}</p>
                    <div class="card-item-actions">
                        <button class="btn" onclick="mtgScanner.removeCard('${card.id}')">🗑️</button>
                    </div>
                </div>
            `;
            this.cardList.appendChild(cardElement);
        });
    }

    removeCard(cardId) {
        this.cards = this.cards.filter(c => c.id !== cardId);
        this.saveCollection();
        this.updateCardCount();
        this.renderCollection();
    }

    saveCollection() {
        localStorage.setItem('mtg-collection', JSON.stringify(this.cards));
    }

    exportCollection() {
        const dataStr = JSON.stringify(this.cards, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `mtg-collection-${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    clearCollection() {
        if (confirm('Wirklich alle Karten löschen?')) {
            this.cards = [];
            this.saveCollection();
            this.updateCardCount();
            this.renderCollection();
        }
    }

    // Download methods for debugging
    downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showCapturedImage() {
        if (this.lastCapturedImage) {
            this.displayDebugImage(this.lastCapturedImage, '📷 Original Image');
        } else {
            alert('Kein aufgenommenes Bild verfügbar');
        }
    }

    showCardImage() {
        if (this.lastCardImage) {
            this.displayDebugImage(this.lastCardImage, '🎴 Card Image');
        } else {
            alert('Kein Kartenbild verfügbar');
        }
    }


    showCollectorImage() {
        if (this.lastCollectorImage) {
            this.displayDebugImage(this.lastCollectorImage, '🔢 Collector Number Area');
        } else {
            alert('Kein Sammlernummernbild verfügbar');
        }
    }

    displayDebugImage(imageDataUrl, title) {
        const debugDisplay = document.getElementById('debugImageDisplay');
        const debugImage = document.getElementById('debugImage');
        const debugTitle = document.getElementById('debugImageTitle');

        debugTitle.textContent = title;
        debugImage.src = imageDataUrl;
        debugDisplay.hidden = false;

        // Scroll to the debug image
        debugDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    hideDebugImage() {
        const debugDisplay = document.getElementById('debugImageDisplay');
        debugDisplay.hidden = true;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.mtgScanner = new MTGScanner();
});
