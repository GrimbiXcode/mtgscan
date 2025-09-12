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
        this.languageSelect = document.getElementById('languageSelect');
        
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
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
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

    async captureCard() {
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
            
            // Crop to name area (top 20%)
            this.updateStatus('Kartenname wird extrahiert...', 60);
            const nameCanvas = this.cropToNameArea(cardCanvas);
            
            // Simple image processing
            this.updateStatus('Bild wird optimiert...', 70);
            this.processImage(nameCanvas);
            
            // OCR
            this.updateStatus('Text wird erkannt...', 80);
            const cardName = await this.performOCR(nameCanvas);
            
            // Search card
            this.updateStatus('Karte wird gesucht...', 90);
            const cardData = await this.searchCard(cardName);
            
            this.updateStatus('Fertig!', 100);
            
            if (cardData) {
                this.showResults(cardData, cardCanvas);
            } else {
                alert(`Karte "${cardName}" wurde nicht gefunden.`);
            }
            
        } catch (error) {
            alert('Fehler beim Scannen: ' + error.message);
        } finally {
            this.isProcessing = false;
            this.showProcessing(false);
        }
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
        
        // Card frame dimensions (200x280 from CSS, centered)
        const frameWidth = 200 * scaleX;
        const frameHeight = 280 * scaleY;
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

    cropToNameArea(cardCanvas) {
        // Top 20% of the card for name
        const nameHeight = Math.floor(cardCanvas.height * 0.2);
        
        const canvas = document.createElement('canvas');
        canvas.width = cardCanvas.width;
        canvas.height = nameHeight;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
            cardCanvas,
            0, 0, cardCanvas.width, nameHeight,
            0, 0, cardCanvas.width, nameHeight
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

    async performOCR(canvas) {
        // Load Tesseract.js if not already loaded
        if (!window.Tesseract) {
            await this.loadTesseract();
        }
        
        const language = this.languageSelect.value;
        
        const result = await Tesseract.recognize(canvas, language, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = 80 + (m.progress * 10);
                    this.updateStatus(`Text wird erkannt... ${Math.round(m.progress * 100)}%`, progress);
                }
            }
        });
        
        return result.data.text.trim().split('\n')[0]; // First line only
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

    async searchCard(cardName) {
        try {
            // Clean up the card name
            const cleanName = cardName.replace(/[^\w\s]/g, '').trim();
            
            const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleanName)}`);
            
            if (response.ok) {
                const card = await response.json();
                return {
                    name: card.name,
                    set: card.set_name,
                    image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
                    id: card.id
                };
            }
        } catch (error) {
            console.error('Card search error:', error);
        }
        
        return null;
    }

    showProcessing(show) {
        this.processingSection.style.display = show ? 'block' : 'none';
        this.resultsSection.style.display = 'none';
        
        if (show) {
            this.progressBar.style.width = '0%';
        }
    }

    updateStatus(text, progress = 0) {
        this.statusText.textContent = text;
        this.progressBar.style.width = `${progress}%`;
    }

    showResults(cardData, cardImage) {
        this.processingSection.style.display = 'none';
        this.resultsSection.style.display = 'block';
        
        this.resultImage.src = cardData.image;
        this.resultName.textContent = cardData.name;
        this.resultSet.textContent = cardData.set;
        
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
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.mtgScanner = new MTGScanner();
});
