// Simple MTG Scanner - Main Application
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

      // OCR with automatic card detection and cropping
      this.updateStatus('Karte wird automatisch erkannt...', 50);

      // Perform automatic card detection first
      const processedCanvas = this.cropToCollectorNumberArea(canvas);

      // Then perform OCR on the processed canvas
      const collectorInfo = await this.performCollectorNumberOCRWithFallback(processedCanvas);


      // Search card by collector number
      this.updateStatus('Karte wird gesucht...', 90);
      const cardData = await this.searchCardByCollectorNumber(collectorInfo);

      this.updateStatus('Fertig!', 100);

      if (cardData) {
        this.showResults(cardData, canvas, `Sammlernummer: ${collectorInfo}`);
        this.showSuccess(`Karte ${cardData.name} wurde gefunden.`)
      } else {
        this.showWarning(`Karte mit Sammlernummer "${collectorInfo}" wurde nicht gefunden.`);
        // Show results anyway for debugging
        this.showResults({
          name: `Unbekannte Karte (${collectorInfo})`,
          set: 'Nicht gefunden',
          image: '/assets/default-card.png'
        }, canvas, collectorInfo);
      }
    } catch (error) {
      throw new Error('Fehler beim Verarbeiten: ' + error.message);
    }
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

  cropToCollectorNumberArea(cardCanvas) {
    // Use automatic card detection as primary method
    console.log('Using automatic card detection...');
    const autoDetectedCanvas = this.automaticCardDetection(cardCanvas);

    if (autoDetectedCanvas) {
      console.log('Automatic card detection successful');
      return autoDetectedCanvas;
    }

    // If automatic detection fails, show error to user
    console.error('Automatic card detection failed');
    throw new Error('Kartenerkennung fehlgeschlagen. Bitte stellen Sie sicher, dass die Karte gut ausgerichtet und gut beleuchtet ist.');
  }

  // Manual crop method removed - automatic detection only

  // New automatic card detection algorithm
  automaticCardDetection(sourceCanvas) {
    const ctx = sourceCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = imageData.data;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    console.log('Starting automatic card detection on image:', { width, height });

    // Reset debug data
    this.debugData = {
      originalImage: sourceCanvas.toDataURL(),
      quadrantImage: null,
      bottomCroppedImage: null,
      leftCroppedImage: null,
      textAreaImage: null,
      finalImage: null,
      ocrResults: null,
      detectionStats: {
        originalSize: { width, height },
        steps: []
      }
    };

    // Step 1: Crop to lower left quadrant
    const quadrantCanvas = this.cropToLowerLeftQuadrant(sourceCanvas);
    this.debugData.quadrantImage = quadrantCanvas.toDataURL();
    this.debugData.detectionStats.steps.push({
      step: 1,
      name: 'Quadrant Crop',
      status: 'SUCCESS',
      size: { width: quadrantCanvas.width, height: quadrantCanvas.height }
    });
    console.log('Step 1 complete: Cropped to lower left quadrant');

    // Step 2: Find bottom card edge using black threshold on right edge
    const bottomEdge = this.findBottomCardEdge(quadrantCanvas);
    if (bottomEdge === null) {
      console.log('Step 2 failed: Could not find bottom card edge');
      this.debugData.detectionStats.steps.push({ step: 2, name: 'Bottom Edge Detection', status: 'FAILED' });
      return null;
    }
    console.log('Step 2 complete: Found bottom card edge at y =', bottomEdge);

    // Crop to bottom edge
    const bottomCroppedCanvas = this.cropToBottomEdge(quadrantCanvas, bottomEdge);
    this.debugData.bottomCroppedImage = bottomCroppedCanvas.toDataURL();
    this.debugData.detectionStats.steps.push({
      step: 2,
      name: 'Bottom Edge Detection',
      status: 'SUCCESS',
      bottomEdge,
      size: { width: bottomCroppedCanvas.width, height: bottomCroppedCanvas.height }
    });
    console.log('Cropped to bottom edge');

    // Step 3: Find left card edge using black threshold on bottom edge
    const leftEdge = this.findLeftCardEdge(bottomCroppedCanvas);
    if (leftEdge === null) {
      console.log('Step 3 failed: Could not find left card edge');
      this.debugData.detectionStats.steps.push({ step: 3, name: 'Left Edge Detection', status: 'FAILED' });
      return null;
    }
    console.log('Step 3 complete: Found left card edge at x =', leftEdge);

    // Crop to left edge
    const leftCroppedCanvas = this.cropToLeftEdge(bottomCroppedCanvas, leftEdge);
    this.debugData.leftCroppedImage = leftCroppedCanvas.toDataURL();

    // Now perform foil detection on the cropped card area
    const foilDetectionResult = this.performFoilDetection(leftCroppedCanvas);
    this.debugData.detectionStats.steps.push({
      step: 3,
      name: 'Left Edge Detection',
      status: 'SUCCESS',
      leftEdge,
      foilDetected: foilDetectionResult.isFoil,
      foilStats: foilDetectionResult.stats,
      size: { width: leftCroppedCanvas.width, height: leftCroppedCanvas.height }
    });
    console.log('Cropped to left edge and detected foil status:', foilDetectionResult.isFoil);

    // Step 4: Find text lines using brightness analysis
    const textBounds = this.findTextLineBounds(leftCroppedCanvas);
    if (!textBounds) {
      console.log('Step 4 failed: Could not find text line bounds');
      this.debugData.detectionStats.steps.push({ step: 4, name: 'Text Line Detection', status: 'FAILED' });
      return null;
    }
    console.log('Step 4 complete: Found text bounds:', textBounds);

    // Create intermediate canvas showing text area before final processing
    const textAreaCanvas = this.cropToTextArea(leftCroppedCanvas, textBounds);

    // Store text area image (before processing) for debugging
    this.debugData.textAreaImage = textAreaCanvas.toDataURL();

    // Create final canvas (copy for processing)
    const finalCanvas = this.copyCanvas(textAreaCanvas);

    // Now apply image processing optimization for OCR based on foil detection
    this.processCollectorNumberImage(finalCanvas, foilDetectionResult);
    this.debugData.finalImage = finalCanvas.toDataURL();

    this.debugData.detectionStats.steps.push({
      step: 4,
      name: 'Text Line Detection & OCR Optimization',
      status: 'SUCCESS',
      usedEnhanced: textBounds.usedEnhanced,
      textBounds,
      imageProcessingApplied: true,
      size: { width: finalCanvas.width, height: finalCanvas.height }
    });
    console.log('Automatic detection complete: Final crop and image processing applied');

    // Update debug stats display
    this.updateDebugStats();

    return finalCanvas;
  }

  // Step 1: Crop to lower left quadrant
  cropToLowerLeftQuadrant(canvas) {
    const quadrantWidth = Math.floor(canvas.width / 2);
    const quadrantHeight = Math.floor(canvas.height / 2);
    const startX = 0;
    const startY = Math.floor(canvas.height / 2);

    const quadrantCanvas = document.createElement('canvas');
    quadrantCanvas.width = quadrantWidth;
    quadrantCanvas.height = quadrantHeight;

    const ctx = quadrantCanvas.getContext('2d');
    ctx.drawImage(
      canvas,
      startX, startY, quadrantWidth, quadrantHeight,
      0, 0, quadrantWidth, quadrantHeight
    );

    return quadrantCanvas;
  }

  // Step 2: Find bottom card edge by scanning right edge for black pixels
  findBottomCardEdge(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const blackThreshold = 100; // Pixels darker than this are considered "card edge"
    const pixelSampleWidth = Math.max(3, Math.floor(width * 0.15)); // Sample 15% of width or min 3 pixels

    // Start from bottom and work up along the right edge
    for (let y = height - 1; y >= 0; y--) {
      let blackPixelCount = 0;
      let totalPixels = 0;

      // Sample multiple pixels horizontally near the right edge
      for (let x = width - pixelSampleWidth; x < width; x++) {
        if (x >= 0) {
          const pixelIndex = (y * width + x) * 4;
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;

          totalPixels++;
          if (gray < blackThreshold) {
            blackPixelCount++;
          }
        }
      }

      // If majority of sampled pixels are black, this might be the card edge
      const blackRatio = blackPixelCount / totalPixels;
      if (blackRatio > 0.6) { // 60% of pixels must be black
        return y;
      }
    }

    return null; // No edge found
  }

  // Crop image from top to bottom edge
  cropToBottomEdge(canvas, bottomEdge) {
    const croppedHeight = bottomEdge + 1;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = canvas.width;
    croppedCanvas.height = croppedHeight;

    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(
      canvas,
      0, 0, canvas.width, croppedHeight,
      0, 0, canvas.width, croppedHeight
    );

    return croppedCanvas;
  }

  // Step 3: Find left card edge by scanning bottom edge for black pixels
  findLeftCardEdge(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const blackThreshold = 100;
    const pixelSampleHeight = Math.max(3, Math.floor(height * 0.1)); // Sample bottom 10% or min 3 pixels

    // Start from left and work right along the bottom edge
    for (let x = 0; x < width; x++) {
      let blackPixelCount = 0;
      let totalPixels = 0;

      // Sample multiple pixels vertically near the bottom edge
      for (let y = height - pixelSampleHeight; y < height; y++) {
        if (y >= 0) {
          const pixelIndex = (y * width + x) * 4;
          const r = data[pixelIndex];
          const g = data[pixelIndex + 1];
          const b = data[pixelIndex + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;

          totalPixels++;
          if (gray < blackThreshold) {
            blackPixelCount++;
          }
        }
      }

      // If majority of sampled pixels are black, this might be the card edge
      const blackRatio = blackPixelCount / totalPixels;
      if (blackRatio > 0.6) { // 60% of pixels must be black
        return x;
      }
    }

    return null; // No edge found
  }

  // Crop image from left edge to right
  cropToLeftEdge(canvas, leftEdge) {
    const croppedWidth = canvas.width - leftEdge;
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = croppedWidth;
    croppedCanvas.height = canvas.height;

    const ctx = croppedCanvas.getContext('2d');
    ctx.drawImage(
      canvas,
      leftEdge, 0, croppedWidth, canvas.height,
      0, 0, croppedWidth, canvas.height
    );

    return croppedCanvas;
  }

  // Step 4: Enhanced text line detection using multiple analysis methods
  findTextLineBounds(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    console.log('Starting enhanced text line detection on image:', { width, height });

    // Method 1: Brightness profile analysis
    const brightnessProfile = this.analyzeBrightnessProfile(data, width, height);

    // Method 2: Edge density analysis
    const edgeDensityProfile = this.analyzeEdgeDensityProfile(data, width, height);

    // Method 3: Text pattern detection
    const textPatterns = this.detectTextPatterns(data, width, height);

    // Combine all methods to find the most likely text boundaries
    const textBounds = this.combineTextDetectionMethods(brightnessProfile, edgeDensityProfile, textPatterns, height);

    if (textBounds) {
      console.log('Enhanced text detection successful:', textBounds);
      return { ...textBounds, usedEnhanced: true};
    }

    // Fallback to simpler method if enhanced detection fails
    console.log('Enhanced detection failed, trying fallback method');
    const fallbackTextBounds = this.fallbackTextDetection(data, width, height);
    return { ...fallbackTextBounds, usedEnhanced: false};
  }

  // Method 1: Analyze brightness profile across horizontal lines
  analyzeBrightnessProfile(data, width, height) {
    let brightnessProfile = [];
    const sampleWidth = Math.floor(width * 0.8); // Sample 80% of width from left

    // Scan from bottom to top
    for (let y = height - 1; y >= 0; y--) {
      let totalBrightness = 0;
      let pixelCount = 0;

      // Sample across most of the width
      for (let x = 0; x < sampleWidth; x++) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        totalBrightness += gray;
        pixelCount++;
      }

      const avgBrightness = totalBrightness / pixelCount;
      brightnessProfile.push({ y, brightness: avgBrightness });
    }

    return brightnessProfile;
  }

  // Method 2: Analyze edge density to find text boundaries
  analyzeEdgeDensityProfile(data, width, height) {
    let edgeDensityProfile = [];
    const sobelThreshold = 50;

    // Scan from bottom to top
    for (let y = 1; y < height - 1; y++) {
      let edgeCount = 0;
      let totalPixels = 0;

      // Sample across width, but avoid edges
      for (let x = 1; x < width - 1; x++) {
        // Calculate Sobel operator for edge detection
        const gx = this.getSobelX(data, x, y, width);
        const gy = this.getSobelY(data, x, y, width);
        const edgeStrength = Math.sqrt(gx * gx + gy * gy);

        if (edgeStrength > sobelThreshold) {
          edgeCount++;
        }
        totalPixels++;
      }

      const edgeDensity = edgeCount / totalPixels;
      edgeDensityProfile.push({ y, edgeDensity });
    }

    return edgeDensityProfile;
  }

  // Helper function for Sobel X operator
  getSobelX(data, x, y, width) {
    const getPixel = (px, py) => {
      const idx = (py * width + px) * 4;
      return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };

    return (
      -1 * getPixel(x - 1, y - 1) + 1 * getPixel(x + 1, y - 1) +
      -2 * getPixel(x - 1, y) + 2 * getPixel(x + 1, y) +
      -1 * getPixel(x - 1, y + 1) + 1 * getPixel(x + 1, y + 1)
    );
  }

  // Helper function for Sobel Y operator
  getSobelY(data, x, y, width) {
    const getPixel = (px, py) => {
      const idx = (py * width + px) * 4;
      return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    };

    return (
      -1 * getPixel(x - 1, y - 1) + -2 * getPixel(x, y - 1) + -1 * getPixel(x + 1, y - 1) +
      1 * getPixel(x - 1, y + 1) + 2 * getPixel(x, y + 1) + 1 * getPixel(x + 1, y + 1)
    );
  }

  // Method 3: Detect text patterns by analyzing contrast and structure
  detectTextPatterns(data, width, height) {
    let textPatterns = [];
    const blockSize = 8; // Analyze in 8x8 blocks

    // Scan in blocks from bottom to top
    for (let y = height - blockSize; y >= 0; y -= blockSize) {
      let textLikelihood = 0;
      let blockCount = 0;

      // Analyze blocks across the width
      for (let x = 0; x < width - blockSize; x += blockSize) {
        const blockStats = this.analyzeBlock(data, x, y, blockSize, width, height);
        textLikelihood += blockStats.textLikelihood;
        blockCount++;
      }

      const avgTextLikelihood = textLikelihood / blockCount;
      textPatterns.push({ y, textLikelihood: avgTextLikelihood });
    }

    return textPatterns;
  }

  // Analyze a small block for text-like characteristics
  analyzeBlock(data, startX, startY, blockSize, width, height) {
    let brightPixels = 0;
    let darkPixels = 0;
    let totalVariance = 0;
    let pixelCount = 0;

    for (let y = startY; y < startY + blockSize; y++) {
      for (let x = startX; x < startX + blockSize; x++) {
        const pixelIndex = (y * width + x) * 4;
        const r = data[pixelIndex];
        const g = data[pixelIndex + 1];
        const b = data[pixelIndex + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (gray > 128) brightPixels++;
        else darkPixels++;

        // Calculate local variance (indicates structure)
        const neighbors = this.getNeighborValues(data, x, y, width, height);
        const variance = this.calculateVariance(neighbors);
        totalVariance += variance;
        pixelCount++;
      }
    }

    // Text-like blocks have good contrast ratio and moderate variance
    const contrastRatio = Math.min(brightPixels, darkPixels) / Math.max(brightPixels, darkPixels);
    const avgVariance = totalVariance / pixelCount;

    // Text likelihood based on contrast and structure
    let textLikelihood = 0;
    if (contrastRatio > 0.2 && contrastRatio < 0.8) textLikelihood += 0.5; // Good contrast
    if (avgVariance > 200 && avgVariance < 2000) textLikelihood += 0.5; // Structured but not noisy

    return { textLikelihood };
  }

  // Get neighboring pixel values for variance calculation
  getNeighborValues(data, x, y, width, height) {
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
          const idx = (ny * width + nx) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          neighbors.push(gray);
        }
      }
    }
    return neighbors;
  }

  // Calculate variance of values
  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  // Combine all detection methods to find text boundaries
  combineTextDetectionMethods(brightnessProfile, edgeDensityProfile, textPatterns, height) {
    console.log('Combining detection methods...');

    // Find regions with high text likelihood
    const textRegions = [];

    // Look for brightness transitions (text appears brighter than black border)
    const brightnessPeaks = this.findBrightnessPeaks(brightnessProfile);
    console.log('Brightness peaks:', brightnessPeaks);

    // Look for high edge density (text has many edges)
    const edgePeaks = this.findEdgeDensityPeaks(edgeDensityProfile);
    console.log('Edge density peaks:', edgePeaks);

    // Look for text pattern matches
    const textPeaks = this.findTextPatternPeaks(textPatterns);
    console.log('Text pattern peaks:', textPeaks);

    // Combine evidence from all methods
    const combinedEvidence = this.combineEvidence(brightnessPeaks, edgePeaks, textPeaks, height);

    if (combinedEvidence.textStart && combinedEvidence.textEnd) {
      return {
        startY: combinedEvidence.textStart,
        height: combinedEvidence.textEnd - combinedEvidence.textStart
      };
    }

    return null;
  }

  // Find brightness peaks that indicate text
  findBrightnessPeaks(profile) {
    const peaks = [];
    const minBrightness = 30; // Minimum brightness to consider text

    for (let i = 1; i < profile.length - 1; i++) {
      const current = profile[i];
      const prev = profile[i - 1];
      const next = profile[i + 1];

      // Look for brightness increases that indicate text on dark background
      if (current.brightness > minBrightness &&
          current.brightness > prev.brightness + 10 &&
          current.brightness > next.brightness + 10) {
        peaks.push(current.y);
      }
    }

    return peaks;
  }

  // Find edge density peaks
  findEdgeDensityPeaks(profile) {
    const peaks = [];
    const minEdgeDensity = 0.1; // Minimum edge density for text

    for (let i = 1; i < profile.length - 1; i++) {
      const current = profile[i];
      const prev = profile[i - 1];
      const next = profile[i + 1];

      if (current.edgeDensity > minEdgeDensity &&
          current.edgeDensity > prev.edgeDensity &&
          current.edgeDensity > next.edgeDensity) {
        peaks.push(current.y);
      }
    }

    return peaks;
  }

  // Find text pattern peaks
  findTextPatternPeaks(patterns) {
    const peaks = [];
    const minTextLikelihood = 0.3;

    for (let i = 0; i < patterns.length; i++) {
      const current = patterns[i];
      if (current.textLikelihood > minTextLikelihood) {
        peaks.push(current.y);
      }
    }

    return peaks;
  }

  // Combine evidence from all methods
  combineEvidence(brightnessPeaks, edgePeaks, textPeaks, height) {
    // Find consensus regions where multiple methods agree
    const consensusRegions = [];
    const tolerance = 20; // Pixels tolerance for agreement

    // Check each brightness peak against other methods
    brightnessPeaks.forEach(bPeak => {
      let score = 1; // Start with brightness evidence

      // Check if edge density supports this region
      const nearbyEdgePeak = edgePeaks.find(ePeak => Math.abs(ePeak - bPeak) < tolerance);
      if (nearbyEdgePeak) score += 1;

      // Check if text patterns support this region
      const nearbyTextPeak = textPeaks.find(tPeak => Math.abs(tPeak - bPeak) < tolerance);
      if (nearbyTextPeak) score += 1;

      consensusRegions.push({ y: bPeak, score });
    });

    // Sort by score and y position
    consensusRegions.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score; // Higher score first
      return a.y - b.y; // Lower y first (bottom of image)
    });

    console.log('Consensus regions:', consensusRegions);

    if (consensusRegions.length >= 1) {
      // Use the best consensus region as text start
      // Assume text area extends 40-60 pixels upward (typical for 2 text lines)
      const textStart = consensusRegions[0].y;
      const estimatedTextHeight = Math.min(60, Math.floor(height * 0.08));
      const textEnd = Math.min(textStart + estimatedTextHeight, height);

      return {
        textStart,
        textEnd
      };
    }

    return { textStart: null, textEnd: null };
  }

  // Fallback text detection using simple brightness analysis
  fallbackTextDetection(data, width, height) {
    console.log('Using fallback text detection');

    // Simple approach: assume text is in bottom 15% of image
    const textAreaHeight = Math.floor(height * 0.15);
    const textStart = height - textAreaHeight;

    return {
      startY: textStart,
      height: textAreaHeight
    };
  }

  // Final crop to text area
  cropToTextArea(canvas, textBounds) {
    const textCanvas = document.createElement('canvas');
    textCanvas.width = canvas.width;
    textCanvas.height = textBounds.height;

    const ctx = textCanvas.getContext('2d');
    ctx.drawImage(
      canvas,
      0, textBounds.startY, canvas.width, textBounds.height,
      0, 0, canvas.width, textBounds.height
    );

    return textCanvas;
  }

  // Helper function to copy a canvas
  copyCanvas(sourceCanvas) {
    const copyCanvas = document.createElement('canvas');
    copyCanvas.width = sourceCanvas.width;
    copyCanvas.height = sourceCanvas.height;

    const ctx = copyCanvas.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);

    return copyCanvas;
  }

  // New method to perform foil detection on card area (not just collector number)
  performFoilDetection(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Analyze image characteristics to detect foil cards
    const imageStats = this.analyzeImageCharacteristics(data);
    const isFoil = this.detectFoilCard(imageStats);

    console.log('Foil detection - Image analysis:', imageStats);
    console.log('Foil detection - Result:', isFoil);

    // Store foil detection result for later use
    this.lastDetectedFoil = isFoil;

    return {
      isFoil,
      stats: imageStats
    };
  }

  // Updated to accept foil detection result
  processCollectorNumberImage(canvas, foilDetectionResult = null) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let isFoil, imageStats;

    if (foilDetectionResult) {
      // Use provided foil detection result
      isFoil = foilDetectionResult.isFoil;
      imageStats = foilDetectionResult.stats;
      console.log('Using provided foil detection result:', isFoil);
    } else {
      // Fallback: analyze current image (for compatibility)
      imageStats = this.analyzeImageCharacteristics(data);
      isFoil = this.detectFoilCard(imageStats);
      console.log('Fallback foil detection - Image analysis:', imageStats);
      console.log('Fallback foil detection - Result:', isFoil);
    }

    if (isFoil) {
      // Enhanced processing for foil cards
      this.processFoilCollectorNumber(data, imageStats);
      console.log('Applied foil-optimized collector number processing');
    } else {
      // Standard processing for normal cards
      this.processNormalCollectorNumber(data);
      console.log('Applied standard collector number processing');
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // Analyze image characteristics to help detect foil cards
  analyzeImageCharacteristics(data) {
    let totalBrightness = 0;
    let colorVariance = 0;
    let edgeIntensity = 0;
    let pixelCount = data.length / 4;

    // Color distribution analysis
    let brightPixels = 0;
    let darkPixels = 0;
    let midtonePixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate grayscale value
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      totalBrightness += gray;

      // Classify pixels by brightness
      if (gray > 180) brightPixels++;
      else if (gray < 75) darkPixels++;
      else midtonePixels++;

      // Calculate color variance (measure of chromatic content)
      const avgRGB = (r + g + b) / 3;
      colorVariance += Math.abs(r - avgRGB) + Math.abs(g - avgRGB) + Math.abs(b - avgRGB);
    }

    return {
      averageBrightness: totalBrightness / pixelCount,
      colorVariance: colorVariance / pixelCount,
      brightPixelRatio: brightPixels / pixelCount,
      darkPixelRatio: darkPixels / pixelCount,
      midtonePixelRatio: midtonePixels / pixelCount
    };
  }

  // Detect if this is likely a foil card based on image characteristics
  detectFoilCard(stats) {
    // Foil cards typically have:
    // 1. Higher color variance due to rainbow shimmer
    // 2. More midtone pixels (less pure black/white contrast)
    // 3. Higher average brightness in some areas

    const foilIndicators = {
      highColorVariance: stats.colorVariance > 15, // Threshold may need tuning
      highMidtoneRatio: stats.midtonePixelRatio > 0.4,
      lowerContrast: stats.darkPixelRatio < 0.3 && stats.brightPixelRatio < 0.3
    };

    // Consider it foil if at least 2 indicators are present
    const foilScore = Object.values(foilIndicators).filter(Boolean).length;
    return foilScore >= 2;
  }

  // Enhanced processing specifically for foil cards
  processFoilCollectorNumber(data, stats) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Convert to grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Adaptive thresholding for foil cards
      // Use dynamic threshold based on local characteristics
      let threshold = 128; // Base threshold

      // Adjust threshold based on image characteristics
      if (stats.averageBrightness > 140) {
        threshold = 160; // Higher threshold for bright foils
      } else if (stats.averageBrightness < 100) {
        threshold = 100; // Lower threshold for dark foils
      }

      // Apply sigmoid function for smoother transitions
      const sigmoid = 1 / (1 + Math.exp(-0.1 * (gray - threshold)));

      // Enhanced contrast stretching specifically for foils
      let enhanced;
      if (gray > threshold) {
        // Bright regions: push towards white more aggressively
        enhanced = 128 + (gray - threshold) * (127 / (255 - threshold)) * 1.8;
      } else {
        // Dark regions: push towards black more aggressively
        enhanced = (gray / threshold) * 128 * 0.6;
      }

      // Clamp values
      enhanced = Math.max(0, Math.min(255, enhanced));

      // Invert for OCR (black text on white background)
      const inverted = 255 - enhanced;

      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
  }

  // Standard processing for normal (non-foil) cards
  processNormalCollectorNumber(data) {
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Standard high contrast enhancement (2.5x factor)
      const enhanced = Math.max(0, Math.min(255, (gray - 128) * 2.5 + 128));

      // Invert colors: Tesseract works better with black text on white background
      const inverted = 255 - enhanced;

      data[i] = inverted;
      data[i + 1] = inverted;
      data[i + 2] = inverted;
    }
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

    // Remove non-alphanumeric except spaces and slashes
    cleaned = cleaned.replace(/[^0-9A-Za-z\s/]/g, '');

    // Final cleanup
    cleaned = cleaned.trim().replace(/\s+/g, ' ');

    return cleaned.toUpperCase();
  }

  // Simplified OCR strategy - automatic detection handles cropping and image processing
  async performCollectorNumberOCRWithFallback(processedCanvas) {
    // The canvas we receive has already been automatically cropped and processed
    console.log('Performing OCR on automatically processed canvas');

    // Store for debugging
    this.collectorImages = [processedCanvas.toDataURL()];

    try {
      const ocrResult = await this.performCollectorNumberOCR(processedCanvas);

      // Score both raw and cleaned results
      const rawScore = this.scoreCollectorNumberResult(ocrResult.rawText);
      const cleanedScore = this.scoreCollectorNumberResult(ocrResult.cleanedText);

      console.log(`OCR Raw: "${ocrResult.rawText}" (score: ${rawScore})`);
      console.log(`OCR Cleaned: "${ocrResult.cleanedText}" (score: ${cleanedScore})`);

      // Use the better scoring result
      const finalText = rawScore > cleanedScore ? ocrResult.rawText : ocrResult.cleanedText;
      const finalScore = Math.max(rawScore, cleanedScore);

      // Store OCR results in debug data
      if (this.debugData) {
        this.debugData.ocrResults = {
          rawText: ocrResult.rawText,
          cleanedText: ocrResult.cleanedText,
          rawScore: rawScore,
          cleanedScore: cleanedScore,
          finalText: finalText,
          finalScore: finalScore,
          usedRaw: rawScore > cleanedScore
        };
      }

      console.log(`Final OCR result: "${finalText}" (score: ${finalScore})`);
      this.updateStatus(`OCR abgeschlossen`, 90);

      return finalText;

    } catch (error) {
      console.error('OCR failed:', error.message);
      throw new Error('OCR-Verarbeitung fehlgeschlagen: ' + error.message);
    }
  }

  // Alternative cropping methods removed - automatic detection handles all cropping optimally

  // Score OCR results to pick the best one
  scoreCollectorNumberResult(text) {
    if (!text) return 0;

    let score = 0;

    const hasCollectionCode = this.collectionRegex.test(text);
    const hasRarityCode = /\s[CURMBLST]\s/.test(text);
    const hasCardNumber = /\d{3,5}/.test(text);
    const hasLanguageCode = /\b(EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.test(text);

    if (hasCollectionCode) {
      score += 50;
    }

    if (hasRarityCode) {
      score += 15;
    }

    if (hasCardNumber) {
      score += 30;
    }

    if (hasLanguageCode) {
      score += 10;
    }

    if (text.length > 10) {
      score += 5;
    }

    console.log(`Score for "${text}": ${score}`);

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
      //psm: '13',
      //oem: '3',  // Default
      tessedit_pageseg_mode: '13', // Raw line - treats image as single text line, bypassing hacks
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /' // Alphanumeric only
    };

    try {
      const result = await Tesseract.recognize(canvas, 'eng', ocrConfig); // Always use English for collector numbers
      const rawText = result.data.text || '';
      const cleanedText = this.cleanOCRText(rawText);

      console.log('Raw OCR result:', `"${rawText}"`);
      console.log('Cleaned OCR result:', `"${cleanedText}"`);

      return { cleanedText, rawText };

    } catch (error) {
      console.error('Collector number OCR Error:', error);
      throw error;
    }
  }


  async loadTesseract() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
      script.crossOrigin = 'anonymous';
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

      const { setCode, collectorNumber, language } = parsed;
      console.log('Parsed collector info:', setCode, collectorNumber, language);

      // Build Scryfall URL with language parameter if detected
      let apiUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${parseInt(collectorNumber, 10)}`;

      // Add language parameter if we detected a language
      if (language) {
        const scryfallLang = this.mapLanguageCode(language);
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
          languageDisplay: this.getLanguageDisplayName(language || 'EN'),
          isFoil: this.lastDetectedFoil || false // Include foil detection result
        };
      } else if (response.status === 404) {
        console.log('Card not found with exact lookup, trying fallback search');
        // Fallback to fuzzy search if exact lookup fails
        return await this.searchCardFallback(collectorInfo, language);
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

    /* old version that only worked for a specific set
    const identificationRegex = /(?<cardCode>[CURMBLST])\s*(?<collectionNumber>\d{2,4})\s*(?<collectionCode>[A-Z0-4]{2,4})/

    const match = cleaned.match(identificationRegex);
    if (match) {
      const { cardCode, collectionNumber, collectionCode } = match.groups;
      console.log('Matched collector info:', cardCode, collectionNumber, collectionCode);

      const setCode = collectionCode;
      const collectorNumber = collectionNumber;
      return { setCode, collectorNumber };
    }
    */

    const cardInfo = {
      collectorNumber: null,
      setCode: null,
      language: null
    }

    const collectionMatch = this.collectionRegex.exec(cleaned);
    if (collectionMatch) {
      const { collection } = collectionMatch.groups;
      cardInfo.setCode = collection;
    }

    const numberMatch = /\s*(?<number>\d{3,5})\s*/.exec(cleaned);
    if (numberMatch) {
      const { number } = numberMatch.groups;
      cardInfo.collectorNumber = number;
    }

    // Extract language code - look for 2-letter language codes like EN, DE, FR, etc.
    const languageMatch = /\b(?<lang>EN|DE|FR|ES|IT|PT|JP|KO|RU|ZH)\b/.exec(cleaned);
    if (languageMatch) {
      const { lang } = languageMatch.groups;
      cardInfo.language = lang;
      console.log('Detected language:', lang);
    }

    if (cardInfo.collectorNumber && cardInfo.setCode) {
      console.log('Parsed collector info:', cardInfo.setCode, cardInfo.collectorNumber, cardInfo.language);
      return cardInfo;
    }

    console.log('Failed to parse collector info:', cleaned);
    console.log('Matched:', collectionMatch, numberMatch, languageMatch);
    return null;
  }

  // Map 2-letter language codes from OCR to Scryfall language codes
  mapLanguageCode(ocrLanguageCode) {
    const languageMap = {
      'EN': 'en',
      'DE': 'de',
      'FR': 'fr',
      'ES': 'es',
      'IT': 'it',
      'PT': 'pt',
      'JP': 'ja',
      'KO': 'ko',
      'RU': 'ru',
      'ZH': 'zhs' // Simplified Chinese for Scryfall
    };
    return languageMap[ocrLanguageCode] || 'en'; // Default to English
  }

  // Get full language name for display
  getLanguageDisplayName(languageCode) {
    const displayNames = {
      'EN': 'English',
      'DE': 'German',
      'FR': 'French',
      'ES': 'Spanish',
      'IT': 'Italian',
      'PT': 'Portuguese',
      'JP': 'Japanese',
      'KO': 'Korean',
      'RU': 'Russian',
      'ZH': 'Chinese'
    };
    return displayNames[languageCode] || 'English';
  }

  guessRecentSet() {
    // Common recent set codes - this could be made configurable
    const recentSets = ['FDN', 'DSK', 'BLB', 'OTJ', 'MKM', 'LCI', 'WOE'];
    return recentSets[0]; // Default to most recent
  }

  async searchCardFallback(collectorInfo, language = null) {
    // If exact lookup fails, we could try other approaches
    console.log('Attempting fallback search for:', collectorInfo, 'with language:', language);
    return null; // For now, just return null
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
    notification.innerHTML = `
      <div class="notification-icon">${icons[type] || icons.info}</div>
      <div class="notification-content">${message}</div>
      <button class="notification-close" aria-label="Close notification">✕</button>
    `;

    // Add to container
    this.notificationContainer.appendChild(notification);

    // Handle close button
    const closeBtn = notification.querySelector('.notification-close');
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
