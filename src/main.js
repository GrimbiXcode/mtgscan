// Simple MTG Scanner - Main Application
import { cleanOCRText, scoreCollectorNumberResult, parseCollectorNumber, mapLanguageCode, getLanguageDisplayName } from './recognition/parsing.js';
import { runDetectionVariants } from './recognition/pipeline.js';

class MTGScanner {
  constructor() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('canvas');
    this.stream = null;
    this.isProcessing = false;
    this.collectorImages = [];

    // Debug data for automatic detection steps
    this.debugData = {
      originalImage: null,
      quadrantImage: null,
      bottomCroppedImage: null,
      leftCroppedImage: null,
      textAreaImage: null,
      finalImage: null,
      detectionStats: null
    };

    this.initElements();
    this.initEventListeners();
    // Frame size initialization removed - using automatic detection

    // Initialize collections system after elements are ready
    this.initCollections();
    this.migrateExistingCollection();
    this.loadActiveCollection();
    this.migrateFoilStatus(); // Migrate foil status after cards are loaded
    this.updateCardCount();
    this.renderCollection();
    this.initCollectionRecognitions();

    // Initialize UI state (camera stopped by default)
    this.hideCameraUI();
  }

  initElements() {
    this.startCameraBtn = document.getElementById('startCamera');
    this.captureCardBtn = document.getElementById('captureCard');
    this.stopCameraBtn = document.getElementById('stopCamera');
    this.flashToggleBtn = document.getElementById('flashToggle');
    this.uploadCardBtn = document.getElementById('uploadCard');
    this.fileInput = document.getElementById('fileInput');

    // New UI elements for improved visibility control
    this.cameraContainer = document.getElementById('cameraContainer');
    this.cameraOperationControls = document.getElementById('cameraOperationControls');
    this.alignmentInstructions = document.getElementById('alignmentInstructions');

    this.processingSection = document.getElementById('processingSection');
    this.progressBar = document.getElementById('progressBar');
    this.statusText = document.getElementById('statusText');

    // Debug section toggle
    this.debugSection = document.getElementById('debugSection');
    this.toggleDebugBtn = document.getElementById('toggleDebug');
    this.debugStatsContent = document.getElementById('debugStatsContent');
    this.debugImageInfo = document.getElementById('debugImageInfo');
    this.debugImage = document.getElementById('debugImage');
    this.debugImageDisplay = document.getElementById('debugImageDisplay');
    this.debugImageTitle = document.getElementById('debugImageTitle');

    this.cardCount = document.getElementById('cardCount');
    this.cardList = document.getElementById('cardList');
    this.exportCollectionBtn = document.getElementById('exportCollection');
    this.clearCollectionBtn = document.getElementById('clearCollection');

    // Notification system
    this.notificationContainer = document.getElementById('notificationContainer');

    // Modal elements
    this.cardModal = document.getElementById('cardModal');
    this.modalCardName = document.getElementById('modalCardName');
    this.modalCardImage = document.getElementById('modalCardImage');
    this.modalCardSet = document.getElementById('modalCardSet');
    this.modalCardLanguage = document.getElementById('modalCardLanguage');
    this.modalLanguageText = document.getElementById('modalLanguageText');
    this.currentQuantity = document.getElementById('currentQuantity');
    this.previousQuantity = document.getElementById('previousQuantity');
    this.previousQuantityInfo = document.getElementById('previousQuantityInfo');
    this.increaseQuantityBtn = document.getElementById('increaseQuantity');
    this.decreaseQuantityBtn = document.getElementById('decreaseQuantity');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.backToScannerBtn = document.getElementById('backToScannerBtn');

    // Foil toggle elements
    this.foilToggleBtn = document.getElementById('foilToggleBtn');
    this.foilToggleText = document.getElementById('foilToggleText');

    // Confidence badge & manual correction elements
    this.modalConfidenceBadge = document.getElementById('modalConfidenceBadge');
    this.manualCorrectionSection = document.getElementById('manualCorrectionSection');
    this.manualCollectorInput = document.getElementById('manualCollectorInput');
    this.manualRetryBtn = document.getElementById('manualRetryBtn');

    // Collection management elements
    this.currentCollectionName = document.getElementById('currentCollectionName');
    this.collectionSelect = document.getElementById('collectionSelect');
    this.manageCollectionsBtn = document.getElementById('manageCollectionsBtn');

    // Collection modal elements
    this.collectionModal = document.getElementById('collectionModal');
    this.collectionModalCloseBtn = document.getElementById('collectionModalCloseBtn');
    this.newCollectionName = document.getElementById('newCollectionName');
    this.createCollectionBtn = document.getElementById('createCollectionBtn');
    this.collectionsList = document.getElementById('collectionsList');
  }

  initEventListeners() {
    this.startCameraBtn.addEventListener('click', () => this.startCamera());
    this.captureCardBtn.addEventListener('click', () => this.captureCard());
    this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
    this.flashToggleBtn.addEventListener('click', () => this.toggleFlash());
    this.uploadCardBtn.addEventListener('click', () => this.triggerFileUpload());
    this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

    // Debug toggle
    if (this.toggleDebugBtn) {
      this.toggleDebugBtn.addEventListener('click', () => this.toggleDebugSection());
    }

    this.exportCollectionBtn.addEventListener('click', () => this.exportCollection());
    this.clearCollectionBtn.addEventListener('click', () => this.clearCollection());

    // Modal event listeners
    this.increaseQuantityBtn.addEventListener('click', () => this.increaseCardQuantity());
    this.decreaseQuantityBtn.addEventListener('click', () => this.decreaseCardQuantity());
    this.modalCloseBtn.addEventListener('click', () => this.hideCardModal());
    this.backToScannerBtn.addEventListener('click', () => this.hideCardModal());
    this.foilToggleBtn.addEventListener('click', () => this.toggleFoilStatus());
    this.manualRetryBtn.addEventListener('click', () => this.retryManualCorrection());

    // Close modal when clicking overlay
    this.cardModal.addEventListener('click', (e) => {
      if (e.target === this.cardModal) {
        this.hideCardModal();
      }
    });

    // Collection management event listeners
    this.manageCollectionsBtn.addEventListener('click', () => this.showCollectionModal());
    this.collectionModalCloseBtn.addEventListener('click', () => this.hideCollectionModal());
    this.createCollectionBtn.addEventListener('click', () => this.createNewCollection());
    this.collectionSelect.addEventListener('change', (e) => this.switchToCollection(e.target.value));

    // Enter key for creating collections
    this.newCollectionName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.newCollectionName.value.trim()) {
        this.createNewCollection();
      }
    });

    // Close collection modal when clicking overlay
    this.collectionModal.addEventListener('click', (e) => {
      if (e.target === this.collectionModal) {
        this.hideCollectionModal();
      }
    });
  }

  // Remove frame size controls - no longer needed with automatic detection

  initCollectionRecognitions() {
    this.collectionRegex;

    // load collection regex from local storage
    const collectionRegexTimestamp = localStorage.getItem('collectionRegexTimestamp');
    if (collectionRegexTimestamp && Date.now() - parseInt(collectionRegexTimestamp) < 24 * 60 * 60 * 1000) {
      const collectionRegexSource = localStorage.getItem('collectionRegex');
      if (collectionRegexSource) {
        this.collectionRegex = new RegExp(collectionRegexSource);
        console.log('Collection Regex loaded from local storage.');
        console.log(this.collectionRegex);
        return
      } else {
        console.warn('Collection Regex not found in local storage.');
        console.warn('Loading collections from scryfall...');
      }
    }

    // load all collections from scryfall
    fetch('https://api.scryfall.com/sets?order=set&dir=asc&format=json')
    .then(response => response.json())
    .then(data => {
      console.log(data);
      const codes = data.data.map(set => set.code.toUpperCase());
      this.collectionRegex = new RegExp(`(?<collection>${codes.join('|')})`);
      console.log(`Collection Regex generated. Found ${codes.length} collections.`);
      console.log(this.collectionRegex);

      // save it to local storage
      localStorage.setItem('collectionRegex', this.collectionRegex.source);
      localStorage.setItem('collectionRegexTimestamp', Date.now().toString());
      console.log('Collection Regex saved to local storage.');
    })
    .catch(error => console.error('Error fetching collections:', error));

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

      // Check for flash capability
      await this.checkFlashCapability();

      // Update button states
      this.startCameraBtn.disabled = true;
      this.captureCardBtn.disabled = false;
      this.stopCameraBtn.disabled = false;

      // Show camera-related UI elements
      this.showCameraUI();

    } catch (error) {
      this.showError('Kamera konnte nicht gestartet werden: ' + error.message);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Update button states
    this.startCameraBtn.disabled = false;
    this.captureCardBtn.disabled = true;
    this.stopCameraBtn.disabled = true;

    // Hide camera-related UI elements
    this.hideCameraUI();
  }

  showCameraUI() {
    // Show camera container and controls when camera is running
    this.cameraContainer.removeAttribute('hidden');
    this.cameraOperationControls.removeAttribute('hidden');
    this.alignmentInstructions.removeAttribute('hidden');
    console.log('Camera UI elements shown with alignment grid');
  }

  hideCameraUI() {
    // Hide camera container and controls when camera is stopped
    if (this.cameraContainer) {
      this.cameraContainer.setAttribute('hidden', '');
    }
    if (this.cameraOperationControls) {
      this.cameraOperationControls.setAttribute('hidden', '');
    }
    if (this.alignmentInstructions) {
      this.alignmentInstructions.setAttribute('hidden', '');
    }
    // Hide flash button when camera is stopped
    if (this.flashToggleBtn) {
      this.flashToggleBtn.setAttribute('hidden', '');
    }
    console.log('Camera UI elements hidden');
  }

  async checkFlashCapability() {
    try {
      if (this.stream) {
        const videoTrack = this.stream.getVideoTracks()[0];
        const capabilities = videoTrack.getCapabilities();

        if (capabilities.torch) {
          // Device has flash capability, show the flash button
          this.flashToggleBtn.removeAttribute('hidden');
          this.flashEnabled = false;
          this.flashToggleBtn.textContent = '🔦 Blitz';
          console.log('Flash capability detected');
        } else {
          // No flash capability, keep button hidden
          this.flashToggleBtn.setAttribute('hidden', '');
          console.log('No flash capability detected');
        }
      }
    } catch (error) {
      console.log('Error checking flash capability:', error);
      this.flashToggleBtn.setAttribute('hidden', '');
    }
  }

  async toggleFlash() {
    try {
      if (this.stream) {
        const videoTrack = this.stream.getVideoTracks()[0];
        this.flashEnabled = !this.flashEnabled;

        await videoTrack.applyConstraints({
          advanced: [{ torch: this.flashEnabled }]
        });

        // Update button text
        this.flashToggleBtn.textContent = this.flashEnabled ? '🔦 Aus' : '🔦 Blitz';
        console.log('Flash toggled:', this.flashEnabled ? 'on' : 'off');
      }
    } catch (error) {
      console.error('Error toggling flash:', error);
      this.showError('Blitz konnte nicht umgeschaltet werden');
    }
  }

  // Upload methods
  triggerFileUpload() {
    this.fileInput.click();
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      this.showError('Bitte wählen Sie eine Bilddatei aus.');
      return;
    }

    try {
      // Create canvas from uploaded image
      const canvas = await this.createCanvasFromFile(file);

      // Process the uploaded image using the same workflow as camera
      await this.processImage(canvas);
    } catch (error) {
      this.showError('Fehler beim Verarbeiten des Bildes: ' + error.message);
    }

    // Clear the file input
    event.target.value = '';
  }

  createCanvasFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        resolve(canvas);
      };
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      img.src = URL.createObjectURL(file);
    });
  }

  async processImage(canvas) {
    try {
      this.updateStatus('Karte wird automatisch erkannt...', 50);

      // Multi-attempt detection + OCR: try several crop/binarization
      // variants and rank them by how plausible the OCR text looks.
      const rankedCandidates = await this.performCollectorNumberOCRWithFallback(canvas);
      const bestGuessText = rankedCandidates[0]?.text || '';

      // Search card by collector number, trying the next-best candidate on
      // a miss instead of giving up after the first one.
      this.updateStatus('Karte wird gesucht...', 90);
      let cardData = null;
      let usedCandidate = null;
      for (const candidate of rankedCandidates.slice(0, 3)) {
        if (!candidate.text) continue;
        cardData = await this.searchCardByCollectorNumber(candidate.text);
        if (cardData) {
          usedCandidate = candidate;
          break;
        }
      }

      this.updateStatus('Fertig!', 100);

      if (cardData) {
        cardData.confidence = this.classifyConfidence(usedCandidate.score);
        this.showResults(cardData, canvas, `Sammlernummer: ${usedCandidate.text}`);
        this.showSuccess(`Karte ${cardData.name} wurde gefunden.`)
      } else {
        this.showWarning(`Karte mit Sammlernummer "${bestGuessText}" wurde nicht gefunden.`);
        // Show results with an editable collector number so the user can
        // correct a misread digit instead of hitting a dead end.
        this.showResults({
          isUnknown: true,
          name: `Unbekannte Karte (${bestGuessText})`,
          set: 'Nicht gefunden',
          image: '/assets/default-card.png'
        }, canvas, bestGuessText);
      }
    } catch (error) {
      throw new Error('Fehler beim Verarbeiten: ' + error.message);
    }
  }

  // Confidence tiers derived from the OCR/parse score; HIGH matches the
  // short-circuit threshold used in performCollectorNumberOCRWithFallback.
  classifyConfidence(score) {
    if (score >= 80) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  async captureCardByCollectorNumber() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;
      this.showProcessing(true);
      this.updateStatus('Bild wird aufgenommen...', 20);

      // Capture full image from video - automatic detection will handle cropping
      const canvas = this.captureFromVideo();

      return this.processImage(canvas);
    } catch (error) {
      this.showError('Fehler beim Scannen: ' + error.message);
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

  // cropToCardFrame method removed - automatic detection handles all cropping

  // Debug display methods for automatic detection steps
  updateDebugStats() {
    if (!this.debugStatsContent || !this.debugData.detectionStats) return;

    const stats = this.debugData.detectionStats;
    let html = '<div class="debug-stats-content">';

    html += `<div class="debug-stat-item">`;
    html += `<span class="debug-stat-label">Original Size:</span>`;
    html += `<span class="debug-stat-value">${stats.originalSize.width}×${stats.originalSize.height}</span>`;
    html += `</div>`;

    // Show OCR results if available
    if (this.debugData.ocrResults) {
      const ocr = this.debugData.ocrResults;
      html += `<div class="debug-stat-item">`;
      html += `<span class="debug-stat-label">OCR Final Result:</span>`;
      html += `<span class="debug-stat-value">"${ocr.finalText}" (${ocr.finalScore})</span>`;
      html += `</div>`;

      html += `<div class="debug-stat-item">`;
      html += `<span class="debug-stat-label">  └─ Raw Text:</span>`;
      html += `<span class="debug-stat-value">"${ocr.rawText}" (${ocr.rawScore})</span>`;
      html += `</div>`;

      html += `<div class="debug-stat-item">`;
      html += `<span class="debug-stat-label">  └─ Cleaned Text:</span>`;
      html += `<span class="debug-stat-value">"${ocr.cleanedText}" (${ocr.cleanedScore})</span>`;
      html += `</div>`;

      html += `<div class="debug-stat-item">`;
      html += `<span class="debug-stat-label">  └─ Used Version:</span>`;
      html += `<span class="debug-stat-value">${ocr.usedRaw ? 'Raw' : 'Cleaned'}</span>`;
      html += `</div>`;

      if (ocr.usedVariant) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Winning Variant:</span>`;
        html += `<span class="debug-stat-value">${ocr.usedVariant} (${ocr.attempts?.length || 1} attempt${(ocr.attempts?.length || 1) === 1 ? '' : 's'} tried)</span>`;
        html += `</div>`;
      }
    }

    stats.steps.forEach(step => {
      html += `<div class="debug-stat-item">`;
      html += `<span class="debug-stat-label">Step ${step.step} - ${step.name}:</span>`;
      html += `<span class="debug-stat-value">${step.status}</span>`;
      html += `</div>`;

      if (step.size) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Size:</span>`;
        html += `<span class="debug-stat-value">${step.size.width}×${step.size.height}</span>`;
        html += `</div>`;
      }

      if (step.bottomEdge !== undefined) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Bottom Edge:</span>`;
        html += `<span class="debug-stat-value">${step.bottomEdge}px</span>`;
        html += `</div>`;
      }

      if (step.leftEdge !== undefined) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Left Edge:</span>`;
        html += `<span class="debug-stat-value">${step.leftEdge}px</span>`;
        html += `</div>`;
      }

      if (step.confidence) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Edge Confidence:</span>`;
        html += `<span class="debug-stat-value">${step.confidence}</span>`;
        html += `</div>`;
      }

      if (step.textBounds) {
        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Text Area:</span>`;
        html += `<span class="debug-stat-value">${step.textBounds.height}px high</span>`;
        html += `</div>`;

        html += `<div class="debug-stat-item">`;
        html += `<span class="debug-stat-label">  └─ Used enhanced:</span>`;
        html += `<span class="debug-stat-value">${step.textBounds.usedEnhanced ? 'YES' : 'NO'}</span>`;
        html += `</div>`;
      }
    });

    html += '</div>';
    this.debugStatsContent.innerHTML = html;
  }

  showQuadrantImage() {
    if (!this.debugData.quadrantImage) {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
      return;
    }
    this.displayDebugImage('Quadrant Crop (Schritt 1)', this.debugData.quadrantImage,
      'Unterer linker Quadrant des ursprünglichen Bildes');
  }

  showBottomCroppedImage() {
    if (!this.debugData.bottomCroppedImage) {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
      return;
    }
    this.displayDebugImage('Bottom Edge Detection (Schritt 2)', this.debugData.bottomCroppedImage,
      'Bild nach Erkennung des unteren Kartenrandes');
  }

  showLeftCroppedImage() {
    if (!this.debugData.leftCroppedImage) {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
      return;
    }
    this.displayDebugImage('Left Edge Detection (Schritt 3)', this.debugData.leftCroppedImage,
      'Bild nach Erkennung des linken Kartenrandes');
  }

  showTextAreaImage() {
    if (!this.debugData.textAreaImage) {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
      return;
    }
    this.displayDebugImage('Text Area Detection (Schritt 4)', this.debugData.textAreaImage,
      'Bild vor der finalen Textbereich-Erkennung');
  }

  showFinalImage() {
    if (!this.debugData.finalImage) {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
      return;
    }
    this.displayDebugImage('Final Result', this.debugData.finalImage,
      'Finales Bild nach automatischer Kartenerkennung - bereit für OCR');
  }

  displayDebugImage(title, imageDataUrl, description) {
    this.debugImageTitle.textContent = title;
    this.debugImage.src = imageDataUrl;

    // Support HTML in description for OCR results
    if (description.includes('<')) {
      this.debugImageInfo.innerHTML = description;
    } else {
      this.debugImageInfo.textContent = description;
    }

    this.debugImageDisplay.hidden = false;
  }

  hideDebugImage() {
    this.debugImageDisplay.hidden = true;
  }

  // Runs detection + OCR against a small set of crop/binarization variants
  // (see runDetectionVariants), scoring each result and returning every
  // attempt ranked best-first so the caller can retry the next-best
  // candidate if the top one doesn't resolve to a real card.
  async performCollectorNumberOCRWithFallback(sourceCanvas) {
    const variants = runDetectionVariants(sourceCanvas);
    const primaryDebug = variants[0].result.debug;

    this.debugData = {
      originalImage: sourceCanvas.toDataURL(),
      quadrantImage: primaryDebug.quadrantImage.toDataURL(),
      bottomCroppedImage: primaryDebug.bottomCroppedImage.toDataURL(),
      leftCroppedImage: primaryDebug.leftCroppedImage.toDataURL(),
      textAreaImage: primaryDebug.textAreaImage.toDataURL(),
      finalImage: primaryDebug.finalImage.toDataURL(),
      ocrResults: null,
      detectionStats: {
        originalSize: { width: sourceCanvas.width, height: sourceCanvas.height },
        steps: primaryDebug.steps
      }
    };

    this.lastDetectedFoil = variants[0].result.foilDetected;
    this.collectorImages = [];

    const attempts = [];
    let best = null;

    for (const variant of variants) {
      this.collectorImages.push(variant.result.canvas.toDataURL());

      let ocrResult;
      try {
        ocrResult = await this.performCollectorNumberOCR(variant.result.canvas);
      } catch (error) {
        console.error(`OCR failed for variant "${variant.name}":`, error.message);
        continue;
      }

      const rawScore = scoreCollectorNumberResult(ocrResult.rawText, this.collectionRegex);
      const cleanedScore = scoreCollectorNumberResult(ocrResult.cleanedText, this.collectionRegex);
      const usedRaw = rawScore > cleanedScore;
      const text = usedRaw ? ocrResult.rawText : ocrResult.cleanedText;
      const score = Math.max(rawScore, cleanedScore);

      console.log(`[${variant.name}] OCR Raw: "${ocrResult.rawText}" (${rawScore}) / Cleaned: "${ocrResult.cleanedText}" (${cleanedScore})`);

      attempts.push({
        variant: variant.name,
        rawText: ocrResult.rawText,
        cleanedText: ocrResult.cleanedText,
        rawScore,
        cleanedScore,
        usedRaw,
        text,
        score
      });

      if (!best || score > best.score) {
        best = attempts[attempts.length - 1];
        this.lastDetectedFoil = variant.result.foilDetected;
        this.debugData.finalImage = variant.result.canvas.toDataURL();
      }

      if (score >= 80) break; // High confidence, stop trying more variants
    }

    if (!best) {
      throw new Error('OCR-Verarbeitung fehlgeschlagen: kein Ergebnis für alle Varianten');
    }

    this.debugData.ocrResults = {
      rawText: best.rawText,
      cleanedText: best.cleanedText,
      rawScore: best.rawScore,
      cleanedScore: best.cleanedScore,
      finalText: best.text,
      finalScore: best.score,
      usedRaw: best.usedRaw,
      usedVariant: best.variant,
      attempts
    };

    console.log(`Final OCR result: "${best.text}" (score: ${best.score}, variant: ${best.variant})`);
    this.updateStatus('OCR abgeschlossen', 90);
    this.updateDebugStats();

    return attempts.slice().sort((a, b) => b.score - a.score);
  }

  async performCollectorNumberOCR(canvas) {
    // Loaded on demand so the Tesseract.js chunk isn't fetched until OCR actually runs
    const { default: Tesseract } = await import('tesseract.js');

    // OPTIMAL OCR configuration for collector numbers (found via systematic testing)
    const ocrConfig = {
      // Self-hosted (same-origin) worker/core assets: the CDN defaults are
      // blocked by COEP: require-corp once cross-origin isolation is enabled.
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = 80 + (m.progress * 10);
          this.updateStatus(`Sammlernummer wird erkannt... ${Math.round(m.progress * 100)}%`, progress);
        }
      },
      tessedit_pageseg_mode: '13', // Raw line - treats image as single text line, bypassing hacks
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /*' // Alphanumeric + promo star proxy
    };

    try {
      const result = await Tesseract.recognize(canvas, 'eng', ocrConfig); // Always use English for collector numbers
      const rawText = result.data.text || '';
      const cleanedText = cleanOCRText(rawText);

      console.log('Raw OCR result:', `"${rawText}"`);
      console.log('Cleaned OCR result:', `"${cleanedText}"`);

      return { cleanedText, rawText };

    } catch (error) {
      console.error('Collector number OCR Error:', error);
      throw error;
    }
  }

  async searchCardByCollectorNumber(collectorInfo) {
    try {
      // Parse collector number info (e.g., "FDN U 0125" or "U 0125")
      const parsed = parseCollectorNumber(collectorInfo, this.collectionRegex);
      if (!parsed) {
        console.error('Could not parse collector number:', collectorInfo);
        return null;
      }

      const { setCode, collectorNumber, language } = parsed;
      console.log('Parsed collector info:', setCode, collectorNumber, language);

      // Build Scryfall URL with language parameter if detected. The
      // collector number is a string (may include a letter suffix or a
      // promo star), so it's URL-encoded rather than parsed as an integer.
      let apiUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${encodeURIComponent(collectorNumber)}`;

      if (language) {
        const scryfallLang = mapLanguageCode(language);
        apiUrl += `?lang=${scryfallLang}`;
        console.log('Using language-specific API URL:', apiUrl);
      }

      // Use exact Scryfall lookup by set and collector number
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const card = await response.json();
        return {
          name: card.name,
          set: card.set_name,
          image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
          id: card.id,
          collectorNumber: card.collector_number,
          setCode: card.set.toUpperCase(),
          language: language || 'EN', // Store the original detected language code or default to EN
          languageDisplay: getLanguageDisplayName(language || 'EN'),
          isFoil: this.lastDetectedFoil || false // Include foil detection result
        };
      }
    } catch (error) {
      console.error('Card search error:', error);
    }

    return null;
  }

  toggleDebugSection() {
    if (!this.debugSection) return;
    const isHidden = this.debugSection.hasAttribute('hidden');
    if (isHidden) {
      this.debugSection.removeAttribute('hidden');
      this.showInfo('Debug-Bereich aktiviert', 2500);
    } else {
      this.debugSection.setAttribute('hidden', '');
      this.showInfo('Debug-Bereich deaktiviert', 2500);
    }
  }

  showProcessing(show) {
    this.processingSection.style.display = show ? 'block' : 'none';

    if (show) {
      this.progressBar.style.width = '0%';
    }
  }

  updateStatus(text, progress = 0) {
    this.statusText.textContent = text;
    this.progressBar.style.width = `${progress}%`;
  }

  async showResults(cardData, cardImage, recognizedText = '') {
    // Hide processing section
    this.processingSection.style.display = 'none';

    // Store current card data
    this.currentCard = cardData;
    this.currentCardImage = cardImage.toDataURL();

    // Show the card modal instead of inline results
    await this.showCardModal(cardData, recognizedText);
  }

  // Modal Management Methods
  async showCardModal(cardData, recognizedText = '') {
    // Store the previous quantities for both foil and normal versions
    const normalVersion = { ...cardData, isFoil: false };
    const foilVersion = { ...cardData, isFoil: true };

    cardData.previousQuantityNormal = this.getCardQuantity(normalVersion);
    cardData.previousQuantityFoil = this.getCardQuantity(foilVersion);

    // Set the initial previous quantity based on current foil status
    cardData.previousQuantity = cardData.isFoil ? cardData.previousQuantityFoil : cardData.previousQuantityNormal;

    // Set modal content
    this.modalCardName.textContent = cardData.name;
    this.modalCardSet.textContent = cardData.set;

    // Initialize foil toggle button and apply effects
    this.updateFoilToggleButton(cardData.isFoil);
    this.applyFoilEffectToModal(cardData.isFoil);

    // Display language information
    if (cardData.languageDisplay) {
      this.modalLanguageText.textContent = cardData.languageDisplay;
      this.modalCardLanguage.style.display = 'block';
    } else {
      this.modalCardLanguage.style.display = 'none';
    }

    // Confidence badge: shown for MEDIUM/LOW confidence matches only, as a
    // non-blocking hint - it never gates adding the card to the collection.
    if (cardData.confidence && cardData.confidence !== 'HIGH') {
      this.modalConfidenceBadge.textContent = cardData.confidence === 'MEDIUM'
        ? '⚠️ Mittlere Erkennungssicherheit – bitte prüfen'
        : '⚠️ Niedrige Erkennungssicherheit – bitte prüfen';
      this.modalConfidenceBadge.className = `modal-confidence-badge ${cardData.confidence.toLowerCase()}`;
      this.modalConfidenceBadge.removeAttribute('hidden');
    } else {
      this.modalConfidenceBadge.setAttribute('hidden', '');
    }

    // Manual correction UI for unresolved scans - lets the user fix a
    // misread collector number instead of hitting a dead end.
    if (cardData.isUnknown) {
      this.manualCorrectionSection.removeAttribute('hidden');
      this.manualCollectorInput.value = recognizedText || '';
    } else {
      this.manualCorrectionSection.setAttribute('hidden', '');
    }

    // Show loading state for modal image
    this.modalCardImage.classList.add('loading');
    this.modalCardImage.src = 'data:image/svg+xml;base64,' + btoa(
      '<svg width="150" height="210" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="150" height="210" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>' +
      '<text x="75" y="105" text-anchor="middle" fill="#666" font-family="Arial" font-size="12">Loading...</text>' +
      '</svg>'
    );

    // Load and display the card image
    try {
      this.modalCardImage.src = await this.fetchCardImage(cardData.image);
      this.modalCardImage.classList.remove('loading');
    } catch (error) {
      console.error('Error fetching card image for modal:', error);
      this.modalCardImage.src = 'data:image/svg+xml;base64,' + btoa(
        '<svg width="150" height="210" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="150" height="210" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>' +
        '<text x="75" y="105" text-anchor="middle" fill="#666" font-family="Arial" font-size="10">No image</text>' +
        '</svg>'
      );
      this.modalCardImage.classList.remove('loading');
    }

    // Update quantity display
    this.updateModalQuantityDisplay(cardData);

    // Show the modal
    this.cardModal.removeAttribute('hidden');

    // Focus management for accessibility
    setTimeout(() => {
      this.modalCloseBtn.focus();
    }, 100);
  }

  hideCardModal() {
    this.cardModal.setAttribute('hidden', '');
  }

  // Re-runs the Scryfall lookup against a user-edited collector number,
  // replacing the "Unbekannte Karte" dead end with a real recovery path.
  async retryManualCorrection() {
    const value = this.manualCollectorInput.value.trim();
    if (!value) {
      this.showWarning('Bitte eine Sammlernummer eingeben.');
      return;
    }

    this.showInfo('Suche...', 1500);
    const cardData = await this.searchCardByCollectorNumber(value);

    if (cardData) {
      cardData.confidence = 'HIGH'; // user-confirmed value
      this.currentCard = cardData;
      await this.showCardModal(cardData, `Sammlernummer: ${value}`);
      this.showSuccess(`Karte ${cardData.name} wurde gefunden.`);
    } else {
      this.showWarning(`Karte mit Sammlernummer "${value}" wurde nicht gefunden.`);
    }
  }

  toggleFoilStatus() {
    if (!this.currentCard) return;

    // Store the current foil status before toggling
    const wasInitiallyFoil = this.currentCard.isFoil;

    // Toggle the foil status
    this.currentCard.isFoil = !this.currentCard.isFoil;

    console.log(`Toggled foil status from ${wasInitiallyFoil} to: ${this.currentCard.isFoil}`);

    // Update the modal UI
    this.updateFoilToggleButton(this.currentCard.isFoil);
    this.applyFoilEffectToModal(this.currentCard.isFoil);

    // Update the previous quantity based on the new foil status
    this.currentCard.previousQuantity = this.currentCard.isFoil ?
      this.currentCard.previousQuantityFoil :
      this.currentCard.previousQuantityNormal;

    // Update the quantity display to reflect the new foil status
    this.updateModalQuantityDisplay(this.currentCard);

    // Show info about what will happen
    const newStatusText = this.currentCard.isFoil ? 'Foil' : 'Normal';
    const currentQuantity = this.getCardQuantity(this.currentCard);

    if (currentQuantity > 0) {
      this.showInfo(`Switching to ${newStatusText} version. Current quantity: ${currentQuantity}`);
    } else {
      this.showInfo(`Switched to ${newStatusText} version. Will be added as new entry.`);
    }
  }

  updateFoilToggleButton(isFoil) {
    if (isFoil) {
      this.foilToggleBtn.classList.add('foil');
      this.foilToggleText.textContent = 'Foil Card';
    } else {
      this.foilToggleBtn.classList.remove('foil');
      this.foilToggleText.textContent = 'Normal Card';
    }
  }

  applyFoilEffectToModal(isFoil) {
    const modalContent = this.cardModal.querySelector('.modal-content');

    if (isFoil) {
      modalContent.classList.add('foil');

      // Add foil indicator to card name if not already present
      if (!this.modalCardName.querySelector('.foil-indicator')) {
        const foilIndicator = document.createElement('span');
        foilIndicator.className = 'foil-indicator';
        foilIndicator.textContent = '✨ FOIL';
        this.modalCardName.appendChild(foilIndicator);
      }
    } else {
      modalContent.classList.remove('foil');

      // Remove foil indicator if present
      const existingIndicator = this.modalCardName.querySelector('.foil-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
    }
  }

  // Generate unique identifier for card including foil status
  getUniqueCardId(card) {
    const baseId = card.id || card.cardId;
    if (!baseId) {
      console.error('Card has no valid ID:', card);
      return null;
    }
    const foilSuffix = card.isFoil ? '_foil' : '_normal';
    return `${baseId}${foilSuffix}`;
  }

  updateModalQuantityDisplay(cardData) {
    const quantity = this.getCardQuantity(cardData);
    this.currentQuantity.textContent = quantity;

    // Show previous quantity (stored when modal was first opened)
    const previousQuantity = cardData.previousQuantity || 0;
    this.previousQuantity.textContent = previousQuantity;

    // Enable/disable decrease button based on quantity
    this.decreaseQuantityBtn.disabled = quantity === 0;
  }

  getCardQuantity(cardData) {
    const uniqueId = this.getUniqueCardId(cardData);
    if (!uniqueId) return 0;
    const existingCard = this.cards.find(c => this.getUniqueCardId(c) === uniqueId);
    return existingCard ? (existingCard.count || 1) : 0;
  }

  increaseCardQuantity() {
    if (!this.currentCard) return;

    const uniqueId = this.getUniqueCardId(this.currentCard);
    if (!uniqueId) {
      this.showError(`Could not generate ID for card: ${this.currentCard.name}`);
      return;
    }
    const existingCard = this.cards.find(c => this.getUniqueCardId(c) === uniqueId);

    if (existingCard) {
      existingCard.count = (existingCard.count || 1) + 1;
      const cardType = this.currentCard.isFoil ? 'foil' : 'normal';
      this.showSuccess(`Added another copy. You now have ${existingCard.count} ${cardType} copies of "${this.currentCard.name}".`);
    } else {
        this.cards.push({
          ...this.currentCard,
          count: 1,
          addedAt: new Date().toISOString(),
          // Ensure language and foil fields are preserved
          language: this.currentCard.language || 'EN',
          languageDisplay: this.currentCard.languageDisplay || 'English',
          isFoil: this.currentCard.isFoil || false
        });
      const cardType = this.currentCard.isFoil ? 'foil' : 'normal';
      this.showSuccess(`"${this.currentCard.name}" (${cardType}) wurde zur Sammlung hinzugefügt!`);
    }

    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
    this.updateModalQuantityDisplay(this.currentCard);
  }

  decreaseCardQuantity() {
    if (!this.currentCard) return;

    const uniqueId = this.getUniqueCardId(this.currentCard);
    if (!uniqueId) {
      this.showError(`Could not generate ID for card: ${this.currentCard.name}`);
      return;
    }
    const existingCard = this.cards.find(c => this.getUniqueCardId(c) === uniqueId);

    if (!existingCard || existingCard.count <= 1) {
      // Remove the card entirely
      this.cards = this.cards.filter(c => this.getUniqueCardId(c) !== uniqueId);
      const cardType = this.currentCard.isFoil ? 'foil' : 'normal';
      this.showWarning(`"${this.currentCard.name}" (${cardType}) wurde aus der Sammlung entfernt.`);
    } else {
      existingCard.count -= 1;
      const cardType = this.currentCard.isFoil ? 'foil' : 'normal';
      this.showInfo(`Reduced quantity. You now have ${existingCard.count} ${cardType} copies of "${this.currentCard.name}".`);
    }

    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
    this.updateModalQuantityDisplay(this.currentCard);
  }

  updateCardCount() {
    // Calculate total cards including quantities
    const totalCards = this.cards.reduce((sum, card) => sum + (card.count || 1), 0);
    const uniqueCards = this.cards.length;

    // Display both unique cards and total quantity
    this.cardCount.textContent = `${uniqueCards} (${totalCards} total)`;
  }

  async renderCollection() {
    this.cardList.innerHTML = '';

    for (const card of this.cards) {
      const cardElement = document.createElement('div');
      cardElement.className = 'card-item';

      // Create the card element structure
      const languageDisplay = card.languageDisplay ? `<p class="card-language">🌍 ${card.languageDisplay}</p>` : '';
      const foilIndicator = card.isFoil ? `<span class="foil-indicator">✨ FOIL</span>` : '';
      const uniqueCardId = this.getUniqueCardId(card);

      if (!uniqueCardId) {
        console.error('Could not generate unique ID for card:', card);
        continue;
      }
      cardElement.innerHTML = `
                <img alt="${card.name}" data-loading="true">
                <div class="card-item-info">
                    <h5>${card.name} ${foilIndicator}</h5>
                    <p>${card.set}</p>
                    ${languageDisplay}
                    <div class="card-quantity-section">
                        <span class="quantity-label">Anzahl:</span>
                        <div class="quantity-controls-inline">
                            <button class="quantity-btn-small decrease" onclick="mtgScanner.decreaseCardQuantityInCollection('${uniqueCardId}')" aria-label="Anzahl verringern">−</button>
                            <span class="quantity-display-inline">${card.count || 1}</span>
                            <button class="quantity-btn-small increase" onclick="mtgScanner.increaseCardQuantityInCollection('${uniqueCardId}')" aria-label="Anzahl erhöhen">+</button>
                        </div>
                    </div>
                    <div class="card-item-actions">
                        <button class="btn danger" onclick="mtgScanner.removeCard('${uniqueCardId}')">🗑️</button>
                    </div>
                </div>
            `;

      const imgElement = cardElement.querySelector('img');

      // Fetch and set the image asynchronously
      try {
        imgElement.src = await this.fetchCardImage(card.image);
        imgElement.removeAttribute('data-loading');
      } catch (error) {
        console.error(`Error fetching image for ${card.name}:`, error);
        // Show placeholder image
        imgElement.src = 'data:image/svg+xml;base64,' + btoa(
          '<svg width="100" height="140" xmlns="http://www.w3.org/2000/svg">' +
          '<rect width="100" height="140" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>' +
          '<text x="50" y="70" text-anchor="middle" fill="#666" font-family="Arial" font-size="10">No image</text>' +
          '</svg>'
        );
        imgElement.removeAttribute('data-loading');
      }

      this.cardList.appendChild(cardElement);
    }
  }

  removeCard(uniqueCardId) {
    this.cards = this.cards.filter(c => this.getUniqueCardId(c) !== uniqueCardId);
    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
  }

  // Increase card quantity directly from collection
  increaseCardQuantityInCollection(uniqueCardId) {
    const card = this.cards.find(c => this.getUniqueCardId(c) === uniqueCardId);
    if (card) {
      card.count = (card.count || 1) + 1;
      this.saveCollection();
      this.updateCardCount();
      this.renderCollection();
      const cardType = card.isFoil ? 'foil' : 'normal';
      this.showSuccess(`Anzahl von "${card.name}" (${cardType}) erhöht auf ${card.count}.`);
    }
  }

  // Decrease card quantity directly from collection
  decreaseCardQuantityInCollection(uniqueCardId) {
    const card = this.cards.find(c => this.getUniqueCardId(c) === uniqueCardId);
    if (card) {
      if (card.count <= 1) {
        // Remove card entirely if count would be 0
        this.cards = this.cards.filter(c => this.getUniqueCardId(c) !== uniqueCardId);
        const cardType = card.isFoil ? 'foil' : 'normal';
        this.showWarning(`"${card.name}" (${cardType}) wurde aus der Sammlung entfernt.`);
      } else {
        card.count -= 1;
        const cardType = card.isFoil ? 'foil' : 'normal';
        this.showInfo(`Anzahl von "${card.name}" (${cardType}) verringert auf ${card.count}.`);
      }
      this.saveCollection();
      this.updateCardCount();
      this.renderCollection();
    }
  }

  exportCollection() {
    // Generate Moxfield-compatible CSV format
    const csvHeaders = ['Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Collector Number'];
    const csvRows = [csvHeaders];

    // Add each card to CSV
    for (const card of this.cards) {
      const row = [
        card.count || 1,                                    // Count
        `"${card.name}"`,                                   // Name (quoted to handle commas)
        `"${card.set || ''}"`,                              // Edition (set name)
        'Near Mint',                                        // Condition (default)
        card.languageDisplay || 'English',                 // Language (use detected language)
        card.isFoil ? 'Yes' : 'No',                        // Foil (based on detection)
        card.collectorNumber || ''                          // Collector Number
      ];
      csvRows.push(row);
    }

    // Convert to CSV string
    const csvContent = csvRows.map(row => row.join(',')).join('\n');

    // Create and download CSV file
    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `mtg-collection-${new Date().toISOString().split('T')[0]}.csv`;
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
    if (this.debugData.originalImage) {
      this.displayDebugImage('📷 Original Image', this.debugData.originalImage,
        'Ursprüngliches Bild vom Kamera-Stream oder hochgeladene Datei');
    } else {
      alert('Führen Sie zuerst einen Scan durch, um Debug-Bilder zu generieren.');
    }
  }

  showCardImage() {
    // Legacy method - redirect to original image since we no longer do manual card cropping
    this.showCapturedImage();
  }

  showCollectorImage() {
    // Legacy method - redirect to final image since this shows the OCR-ready crop
    this.showFinalImage();
  }

  showOCRResults() {
    if (!this.debugData.ocrResults) {
      alert('Führen Sie zuerst einen Scan durch, um OCR-Resultate zu generieren.');
      return;
    }

    const ocr = this.debugData.ocrResults;
    const description = `
<strong>OCR-Verarbeitung Details:</strong><br><br>
<strong>Rohtext (Tesseract):</strong><br>
"${ocr.rawText}"<br>
<em>Bewertung: ${ocr.rawScore} Punkte</em><br><br>
<strong>Bereinigter Text:</strong><br>
"${ocr.cleanedText}"<br>
<em>Bewertung: ${ocr.cleanedScore} Punkte</em><br><br>
<strong>Verwendetes Ergebnis:</strong><br>
"${ocr.finalText}" (${ocr.usedRaw ? 'Rohtext' : 'Bereinigt'})<br>
<em>Finale Bewertung: ${ocr.finalScore} Punkte</em><br><br>
<strong>Bewertungskriterien:</strong><br>
• Set-Code erkannt: +50 Punkte<br>
• Seltenheitscode erkannt: +15 Punkte<br>
• Kartennummer erkannt: +30 Punkte<br>
• Sprachcode erkannt: +10 Punkte<br>
• Ausreichende Länge: +5 Punkte
    `;

    this.displayDebugImage('OCR-Resultate & Bewertung', this.debugData.finalImage, description);
  }

  // Fetch card image to bypass CORS restrictions
  async fetchCardImage(imageUrl) {
    if (!imageUrl) {
      throw new Error('No image URL provided');
    }

    // Check if we already have this image cached
    const cacheKey = `card-image-${btoa(imageUrl)}`;
    const cachedImage = localStorage.getItem(cacheKey);
    const cachedTimestamp = localStorage.getItem(`${cacheKey}-timestamp`);

    // Use cached image if it exists and is less than 24 hours old
    if (cachedImage && cachedTimestamp) {
      const ageInHours = (Date.now() - parseInt(cachedTimestamp)) / (1000 * 60 * 60);
      if (ageInHours < 24) {
        console.log('Using cached image for:', imageUrl);
        return cachedImage;
      }
    }

    try {
      console.log('Fetching image:', imageUrl);

      // Fetch the image
      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: {
          'Accept': 'image/*'
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Convert to blob
      const blob = await response.blob();

      // Convert blob to data URL
      const dataUrl = await this.blobToDataUrl(blob);

      // Cache the result (but limit cache size to prevent storage issues)
      try {
        localStorage.setItem(cacheKey, dataUrl);
        localStorage.setItem(`${cacheKey}-timestamp`, Date.now().toString());
        console.log('Cached image for:', imageUrl);
      } catch (cacheError) {
        console.warn('Could not cache image (storage full?):', cacheError);
        // Clear old cached images if storage is full
        this.clearOldImageCache();
      }

      return dataUrl;

    } catch (error) {
      console.error('Error fetching image:', error);
      throw error;
    }
  }

  // Convert blob to data URL
  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Clear old cached images to free up storage space
  clearOldImageCache() {
    const keys = Object.keys(localStorage);
    const imageKeys = keys.filter(key => key.startsWith('card-image-'));
    const timestampKeys = keys.filter(key => key.includes('-timestamp'));

    // Sort by timestamp and remove oldest entries
    const entries = timestampKeys
      .map(key => ({
        key: key.replace('-timestamp', ''),
        timestamp: parseInt(localStorage.getItem(key) || '0')
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest 25% of cached images
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      const entry = entries[i];
      localStorage.removeItem(entry.key);
      localStorage.removeItem(`${entry.key}-timestamp`);
      console.log('Removed old cached image:', entry.key);
    }
  }

  // Notification system methods
  showNotification(message, type = 'info', duration = 5000) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    // Icon comes from the hardcoded set above
    const iconElem = document.createElement('div');
    iconElem.className = 'notification-icon';
    iconElem.textContent = icons[type] || icons.info;

    // Message may contain untrusted text (API data, error messages) —
    // textContent so it is never reinterpreted as HTML
    const messageElem = document.createElement('div');
    messageElem.className = 'notification-content';
    messageElem.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.textContent = '✕';

    notification.appendChild(iconElem);
    notification.appendChild(messageElem);
    notification.appendChild(closeBtn);

    // Add to container
    this.notificationContainer.appendChild(notification);

    // Handle close button
    closeBtn.addEventListener('click', () => this.hideNotification(notification));

    // Show with animation
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        this.hideNotification(notification);
      }, duration);
    }

    return notification;
  }

  hideNotification(notification) {
    if (!notification || !notification.parentNode) return;

    notification.classList.add('hide');
    notification.classList.remove('show');

    // Remove from DOM after animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }

  // Convenience methods for different notification types
  showSuccess(message, duration = 4000) {
    return this.showNotification(message, 'success', duration);
  }

  showError(message, duration = 6000) {
    return this.showNotification(message, 'error', duration);
  }

  showWarning(message, duration = 5000) {
    return this.showNotification(message, 'warning', duration);
  }

  showInfo(message, duration = 4000) {
    return this.showNotification(message, 'info', duration);
  }

  // Collection Management Methods

  initCollections() {
    // Initialize the collections system
    const collectionsData = this.getCollectionsData();

    // If no collections exist, create default one
    if (Object.keys(collectionsData.collections).length === 0) {
      const defaultId = this.generateCollectionId();
      collectionsData.collections[defaultId] = {
        id: defaultId,
        name: 'Meine Sammlung',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        cardCount: 0
      };
      collectionsData.activeCollection = defaultId;
      this.saveCollectionsData(collectionsData);
    }

    this.collectionsData = collectionsData;
    this.populateCollectionSelector();
  }

  getCollectionsData() {
    const stored = localStorage.getItem('mtg-collections-meta');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing collections data:', e);
      }
    }

    return {
      collections: {},
      activeCollection: null
    };
  }

  saveCollectionsData(data) {
    try {
      localStorage.setItem('mtg-collections-meta', JSON.stringify(data));
      this.collectionsData = data;
    } catch (e) {
      console.error('Error saving collections data:', e);
      this.showError('Fehler beim Speichern der Sammlungsdaten');
    }
  }

  generateCollectionId() {
    return 'coll_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getCollectionStorageKey(collectionId) {
    return `mtg-collection-${collectionId}`;
  }

  loadActiveCollection() {
    const activeId = this.collectionsData.activeCollection;
    if (activeId && this.collectionsData.collections[activeId]) {
      const storageKey = this.getCollectionStorageKey(activeId);
      this.cards = JSON.parse(localStorage.getItem(storageKey) || '[]');
      this.updateCollectionDisplay();
    } else {
      this.cards = [];
    }
  }

  populateCollectionSelector() {
    if (!this.collectionSelect) {
      console.warn('Collection select element not found');
      return;
    }

    this.collectionSelect.innerHTML = '';

    Object.values(this.collectionsData.collections).forEach(collection => {
      const option = document.createElement('option');
      option.value = collection.id;
      option.textContent = collection.name;

      if (collection.id === this.collectionsData.activeCollection) {
        option.selected = true;
      }

      this.collectionSelect.appendChild(option);
    });

    // Force the select to update its display
    this.collectionSelect.value = this.collectionsData.activeCollection;
  }

  updateCollectionDisplay() {
    const activeCollection = this.collectionsData.collections[this.collectionsData.activeCollection];
    if (activeCollection) {
      this.currentCollectionName.textContent = activeCollection.name;
    }
  }

  switchToCollection(collectionId) {
    if (collectionId === this.collectionsData.activeCollection) {
      return;
    }

    // Save current collection first
    this.saveCollection();

    // Switch to new collection
    this.collectionsData.activeCollection = collectionId;
    this.saveCollectionsData(this.collectionsData);

    // Load new collection and update UI
    this.loadActiveCollection();
    this.populateCollectionSelector(); // Explicitly update selector
    this.updateCardCount();
    this.renderCollection();

    const collection = this.collectionsData.collections[collectionId];
    this.showInfo(`Zu Sammlung "${collection.name}" gewechselt`);
  }

  showCollectionModal() {
    this.renderCollectionsList();
    this.collectionModal.removeAttribute('hidden');

    // Focus on new collection input
    setTimeout(() => {
      this.newCollectionName.focus();
    }, 100);
  }

  hideCollectionModal() {
    this.collectionModal.setAttribute('hidden', '');
    this.newCollectionName.value = '';
  }

  createNewCollection() {
    const name = this.newCollectionName.value.trim();
    if (!name) {
      this.showWarning('Bitte geben Sie einen Namen für die Sammlung ein');
      return;
    }

    // Check for duplicate names
    const existingNames = Object.values(this.collectionsData.collections)
      .map(c => c.name.toLowerCase());
    if (existingNames.includes(name.toLowerCase())) {
      this.showWarning('Eine Sammlung mit diesem Namen existiert bereits');
      return;
    }

    const newId = this.generateCollectionId();
    const newCollection = {
      id: newId,
      name: name,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      cardCount: 0
    };

    this.collectionsData.collections[newId] = newCollection;
    this.saveCollectionsData(this.collectionsData);

    // Create empty collection in storage
    const storageKey = this.getCollectionStorageKey(newId);
    localStorage.setItem(storageKey, JSON.stringify([]));

    // Update UI
    this.populateCollectionSelector();
    this.renderCollectionsList();

    this.showSuccess(`Sammlung "${name}" wurde erstellt`);
    this.newCollectionName.value = '';
  }

  renderCollectionsList() {
    this.collectionsList.innerHTML = '';

    const collections = Object.values(this.collectionsData.collections)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    collections.forEach(collection => {
      const isActive = collection.id === this.collectionsData.activeCollection;
      const collectionElement = this.createCollectionListItem(collection, isActive);
      this.collectionsList.appendChild(collectionElement);
    });
  }

  createCollectionListItem(collection, isActive) {
    const div = document.createElement('div');
    div.className = `collection-item ${isActive ? 'active' : ''}`;

    const createdDate = new Date(collection.createdAt).toLocaleDateString('de-DE');
    const lastModifiedDate = new Date(collection.lastModified).toLocaleDateString('de-DE');

    div.innerHTML = `
      <div class="collection-item-header">
        <h5 class="collection-name">${this.escapeHtml(collection.name)}</h5>
        ${isActive ? '<span class="collection-active-badge">Aktiv</span>' : ''}
      </div>
      <div class="collection-metadata">
        <div class="collection-stat">
          <span>🗓️ Erstellt:</span>
          <span>${createdDate}</span>
        </div>
        <div class="collection-stat">
          <span>📝 Bearbeitet:</span>
          <span>${lastModifiedDate}</span>
        </div>
        <div class="collection-stat">
          <span>🎴 Karten:</span>
          <span>${collection.cardCount}</span>
        </div>
        <div class="collection-stat">
          <span>🆔 ID:</span>
          <span>${collection.id}</span>
        </div>
      </div>
      <div class="collection-actions">
        <button class="btn small secondary" onclick="mtgScanner.selectCollection('${collection.id}')">Auswählen</button>
        <button class="btn small" onclick="mtgScanner.renameCollection('${collection.id}')">Umbenennen</button>
        <button class="btn small danger" onclick="mtgScanner.deleteCollection('${collection.id}')">Löschen</button>
      </div>
    `;

    return div;
  }

  selectCollection(collectionId) {
    this.switchToCollection(collectionId);
    this.hideCollectionModal();
  }

  renameCollection(collectionId) {
    const collection = this.collectionsData.collections[collectionId];
    if (!collection) {
      this.showError('Sammlung nicht gefunden');
      return;
    }

    const newName = prompt('Neuer Name der Sammlung:', collection.name);
    if (!newName || newName.trim() === '') {
      return;
    }

    const trimmedName = newName.trim();

    // Check for duplicate names (excluding current collection)
    const existingNames = Object.values(this.collectionsData.collections)
      .filter(c => c.id !== collectionId)
      .map(c => c.name.toLowerCase());
    if (existingNames.includes(trimmedName.toLowerCase())) {
      this.showWarning('Eine Sammlung mit diesem Namen existiert bereits');
      return;
    }

    collection.name = trimmedName;
    collection.lastModified = new Date().toISOString();
    this.saveCollectionsData(this.collectionsData);

    // Update UI
    this.populateCollectionSelector();
    this.updateCollectionDisplay();
    this.renderCollectionsList();

    this.showSuccess(`Sammlung wurde umbenannt zu "${trimmedName}"`);
  }

  deleteCollection(collectionId) {
    const collection = this.collectionsData.collections[collectionId];
    if (!collection) {
      this.showError('Sammlung nicht gefunden');
      return;
    }

    // Prevent deletion of the last collection
    if (Object.keys(this.collectionsData.collections).length === 1) {
      this.showWarning('Die letzte Sammlung kann nicht gelöscht werden');
      return;
    }

    const confirmText = `Sind Sie sicher, dass Sie die Sammlung "${collection.name}" mit ${collection.cardCount} Karten löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.`;
    if (!confirm(confirmText)) {
      return;
    }

    // Remove from collections metadata
    delete this.collectionsData.collections[collectionId];

    // Remove collection data from localStorage
    const storageKey = this.getCollectionStorageKey(collectionId);
    localStorage.removeItem(storageKey);

    // If this was the active collection, switch to another one
    if (this.collectionsData.activeCollection === collectionId) {
      const remainingCollections = Object.keys(this.collectionsData.collections);
      if (remainingCollections.length > 0) {
        this.collectionsData.activeCollection = remainingCollections[0];
      }
    }

    this.saveCollectionsData(this.collectionsData);

    // Update UI
    this.populateCollectionSelector();
    this.loadActiveCollection();
    this.updateCardCount();
    this.renderCollection();
    this.updateCollectionDisplay();
    this.renderCollectionsList();

    this.showSuccess(`Sammlung "${collection.name}" wurde gelöscht`);
  }

  // Update existing save method to work with active collection
  saveCollection() {
    const activeId = this.collectionsData.activeCollection;
    if (!activeId) return;

    const storageKey = this.getCollectionStorageKey(activeId);
    localStorage.setItem(storageKey, JSON.stringify(this.cards));

    // Update collection metadata
    const collection = this.collectionsData.collections[activeId];
    if (collection) {
      collection.lastModified = new Date().toISOString();
      collection.cardCount = this.cards.reduce((sum, card) => sum + (card.count || 1), 0);
      this.saveCollectionsData(this.collectionsData);
    }
  }

  // Migrate existing single collection to multi-collection system
  migrateExistingCollection() {
    const oldCollection = localStorage.getItem('mtg-collection');
    if (oldCollection && oldCollection !== '[]') {
      try {
        const cards = JSON.parse(oldCollection);
        if (cards.length > 0) {
          console.log('Migrating existing collection to new system...');

          // Find the default collection or create one
          const collectionsData = this.getCollectionsData();
          let defaultCollection = Object.values(collectionsData.collections)[0];

          if (!defaultCollection) {
            const defaultId = this.generateCollectionId();
            defaultCollection = {
              id: defaultId,
              name: 'Meine Sammlung',
              createdAt: new Date().toISOString(),
              lastModified: new Date().toISOString(),
              cardCount: 0
            };
            collectionsData.collections[defaultId] = defaultCollection;
            collectionsData.activeCollection = defaultId;
          }

          // Migrate cards to new collection
          const newStorageKey = this.getCollectionStorageKey(defaultCollection.id);
          localStorage.setItem(newStorageKey, oldCollection);

          // Update collection metadata
          defaultCollection.cardCount = cards.reduce((sum, card) => sum + (card.count || 1), 0);
          defaultCollection.lastModified = new Date().toISOString();

          this.saveCollectionsData(collectionsData);

          // Remove old storage
          localStorage.removeItem('mtg-collection');

          this.showSuccess('Ihre bestehende Sammlung wurde erfolgreich migriert!');
          console.log('Collection migration completed');
        }
      } catch (e) {
        console.error('Error migrating collection:', e);
      }
    }

  }

  // Migrate existing cards to include foil status
  migrateFoilStatus() {
    if (!this.cards || !Array.isArray(this.cards)) {
      return;
    }

    let migrationNeeded = false;

    this.cards.forEach(card => {
      if (card.isFoil === undefined) {
        card.isFoil = false; // Default existing cards to normal (non-foil)
        migrationNeeded = true;
      }
    });

    if (migrationNeeded) {
      console.log('Migrated existing collection to include foil status');
      this.saveCollection();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  window.mtgScanner = new MTGScanner();
});
