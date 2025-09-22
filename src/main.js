// Simple MTG Scanner - Main Application
class MTGScanner {
  constructor() {
    this.video = document.getElementById('video');
    this.canvas = document.getElementById('canvas');
    this.stream = null;
    this.isProcessing = false;
    this.cards = JSON.parse(localStorage.getItem('mtg-collection') || '[]');
    this.collectorImages = [];

    this.initElements();
    this.initEventListeners();
    this.initFrameSize();
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
    this.frameSizeControls = document.getElementById('frameSizeControls');

    this.processingSection = document.getElementById('processingSection');
    this.progressBar = document.getElementById('progressBar');
    this.statusText = document.getElementById('statusText');

    // Debug section toggle
    this.debugSection = document.getElementById('debugSection');
    this.toggleDebugBtn = document.getElementById('toggleDebug');

    this.cardCount = document.getElementById('cardCount');
    this.cardList = document.getElementById('cardList');
    this.exportCollectionBtn = document.getElementById('exportCollection');
    this.clearCollectionBtn = document.getElementById('clearCollection');

    // Frame size controls
    this.frameSizeSlider = document.getElementById('frameSizeSlider');
    this.frameSizeValue = document.getElementById('frameSizeValue');

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
    this.increaseQuantityBtn = document.getElementById('increaseQuantity');
    this.decreaseQuantityBtn = document.getElementById('decreaseQuantity');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.backToScannerBtn = document.getElementById('backToScannerBtn');
    
    // Foil toggle elements
    this.foilToggleBtn = document.getElementById('foilToggleBtn');
    this.foilToggleText = document.getElementById('foilToggleText');
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

    // Frame size control
    this.frameSizeSlider.addEventListener('input', (e) => this.updateFrameSize(parseFloat(e.target.value)));

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
  }

  initFrameSize() {
    // Load saved frame size from localStorage or use default
    const savedFrameSize = localStorage.getItem('mtg-scanner-frame-size');
    const frameSize = savedFrameSize ? parseFloat(savedFrameSize) : 1.0;

    this.frameSizeSlider.value = frameSize;
    this.updateFrameSize(frameSize);
  }

  updateFrameSize(scale) {
    // Update CSS variable for frame scale
    document.documentElement.style.setProperty('--frame-scale', scale);

    // Update the display value
    let sizeText;
    if (scale <= 0.7) {
      sizeText = 'Klein';
    } else if (scale <= 0.9) {
      sizeText = 'Klein-Medium';
    } else if (scale <= 1.1) {
      sizeText = 'Medium';
    } else if (scale <= 1.4) {
      sizeText = 'Medium-Groß';
    } else {
      sizeText = 'Groß';
    }

    this.frameSizeValue.textContent = `${sizeText} (${scale.toFixed(1)}x)`;

    // Save to localStorage
    localStorage.setItem('mtg-scanner-frame-size', scale.toString());

    console.log('Frame size updated:', scale);
  }

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
    this.frameSizeControls.removeAttribute('hidden');
    console.log('Camera UI elements shown');
  }

  hideCameraUI() {
    // Hide camera container and controls when camera is stopped
    if (this.cameraContainer) {
      this.cameraContainer.setAttribute('hidden', '');
    }
    if (this.cameraOperationControls) {
      this.cameraOperationControls.setAttribute('hidden', '');
    }
    if (this.frameSizeControls) {
      this.frameSizeControls.setAttribute('hidden', '');
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
      await this.processUploadedImage(canvas);
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

  async processUploadedImage(canvas) {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;
      this.showProcessing(true);
      this.updateStatus('Hochgeladenes Bild wird verarbeitet...', 20);

      // For uploaded images, we assume they are already cropped to show the card
      // or we use the full image and try to find collector number area
      const cardCanvas = this.smartCropUploadedImage(canvas);

      // Store processed images for debugging
      this.lastCapturedImage = canvas.toDataURL();
      this.lastCardImage = cardCanvas.toDataURL();

      // OCR for collector number with fallback strategy
      this.updateStatus('Sammlernummer wird erkannt...', 50);
      const collectorInfo = await this.performCollectorNumberOCRWithFallback(cardCanvas);

      // Search card by collector number
      this.updateStatus('Karte wird gesucht...', 90);
      const cardData = await this.searchCardByCollectorNumber(collectorInfo);

      this.updateStatus('Fertig!', 100);

      if (cardData) {
        this.showResults(cardData, cardCanvas, `Sammlernummer: ${collectorInfo}`);
        this.showSuccess(`Karte ${cardData.name} wurde gefunden.`)
      } else {
        this.showWarning(`Karte mit Sammlernummer "${collectorInfo}" wurde nicht gefunden.`);
        // Show results anyway for debugging
        this.showResults({
          name: `Unbekannte Karte (${collectorInfo})`,
          set: 'Nicht gefunden',
          image: '/assets/default-card.png'
        }, cardCanvas, collectorInfo);
      }

    } catch (error) {
      this.showError('Fehler beim Verarbeiten: ' + error.message);
    } finally {
      this.isProcessing = false;
      this.showProcessing(false);
    }
  }

  smartCropUploadedImage(canvas) {
    // For uploaded images, we handle different scenarios:
    // 1. Image is already a close-up of a card
    // 2. Image contains a card among other things
    //
    // We use a simple heuristic: if the image has a roughly card-like aspect ratio
    // (around 2.5:3.5 or 0.71:1), we assume it's already a card image.
    // Otherwise, we try to crop to center assuming the card is centered.

    const aspectRatio = canvas.width / canvas.height;
    const cardAspectRatio = 0.71; // Standard MTG card ratio

    // If already close to card aspect ratio (within 20% tolerance), use as-is
    if (Math.abs(aspectRatio - cardAspectRatio) / cardAspectRatio < 0.3) {
      console.log('Image appears to be already cropped to card, using as-is');
      return canvas;
    }

    // Otherwise, try to crop to center with card proportions
    console.log('Image appears to contain more than just card, cropping to center');
    return this.cropToCardProportions(canvas);
  }

  cropToCardProportions(sourceCanvas) {
    // Crop to center of image with card proportions
    const cardAspectRatio = 0.71; // width/height for MTG cards

    let cropWidth, cropHeight;

    // Determine crop dimensions based on source aspect ratio
    if (sourceCanvas.width / sourceCanvas.height > cardAspectRatio) {
      // Source is wider than card ratio - crop width
      cropHeight = sourceCanvas.height;
      cropWidth = cropHeight * cardAspectRatio;
    } else {
      // Source is taller than card ratio - crop height
      cropWidth = sourceCanvas.width;
      cropHeight = cropWidth / cardAspectRatio;
    }

    // Center the crop
    const cropX = (sourceCanvas.width - cropWidth) / 2;
    const cropY = (sourceCanvas.height - cropHeight) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      sourceCanvas,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, cropWidth, cropHeight
    );

    return canvas;
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

      // Store processed images for debugging
      this.lastCapturedImage = canvas.toDataURL();
      this.lastCardImage = cardCanvas.toDataURL();

      // OCR for collector number with fallback strategy
      this.updateStatus('Sammlernummer wird erkannt...', 50);
      const collectorInfo = await this.performCollectorNumberOCRWithFallback(cardCanvas);


      // Search card by collector number
      this.updateStatus('Karte wird gesucht...', 90);
      const cardData = await this.searchCardByCollectorNumber(collectorInfo);

      this.updateStatus('Fertig!', 100);

      if (cardData) {
        this.showResults(cardData, cardCanvas, `Sammlernummer: ${collectorInfo}`);
        this.showSuccess(`Karte ${cardData.name} wurde gefunden.`)
      } else {
        this.showWarning(`Karte mit Sammlernummer "${collectorInfo}" wurde nicht gefunden.`);
        // Show results anyway for debugging
        this.showResults({
          name: `Unbekannte Karte (${collectorInfo})`,
          set: 'Nicht gefunden',
          image: '/assets/default-card.png'
        }, cardCanvas, collectorInfo);
      }

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

  cropToCardFrame(sourceCanvas) {
    // Get actual video and frame border elements for precise measurements
    const videoRect = this.video.getBoundingClientRect();
    const frameElement = document.querySelector('.frame-border');
    const frameRect = frameElement.getBoundingClientRect();

    // Calculate the position of the frame relative to the video
    const frameX = frameRect.left - videoRect.left;
    const frameY = frameRect.top - videoRect.top;
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;

    // Calculate scaling factors from video display size to actual video resolution
    const scaleX = sourceCanvas.width / videoRect.width;
    const scaleY = sourceCanvas.height / videoRect.height;

    // Apply scaling to get actual crop coordinates in the source canvas
    const cropX = frameX * scaleX;
    const cropY = frameY * scaleY;
    const cropWidth = frameWidth * scaleX;
    const cropHeight = frameHeight * scaleY;

    // Ensure crop coordinates are within bounds
    const safeCropX = Math.max(0, Math.min(cropX, sourceCanvas.width - cropWidth));
    const safeCropY = Math.max(0, Math.min(cropY, sourceCanvas.height - cropHeight));
    const safeCropWidth = Math.min(cropWidth, sourceCanvas.width - safeCropX);
    const safeCropHeight = Math.min(cropHeight, sourceCanvas.height - safeCropY);

    console.log('Crop coordinates:', {
      frameRect: { x: frameRect.left, y: frameRect.top, w: frameRect.width, h: frameRect.height },
      videoRect: { x: videoRect.left, y: videoRect.top, w: videoRect.width, h: videoRect.height },
      sourceCanvas: { w: sourceCanvas.width, h: sourceCanvas.height },
      crop: { x: safeCropX, y: safeCropY, w: safeCropWidth, h: safeCropHeight },
      scale: { x: scaleX, y: scaleY }
    });

    const canvas = document.createElement('canvas');
    canvas.width = safeCropWidth;
    canvas.height = safeCropHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      sourceCanvas,
      safeCropX, safeCropY, safeCropWidth, safeCropHeight,
      0, 0, safeCropWidth, safeCropHeight
    );

    return canvas;
  }

  cropToCollectorNumberArea(cardCanvas) {
    // Match the CSS positioning: left: 0, top: 90%, width: 20%, height: 8%
    const cropWidth = Math.floor(cardCanvas.width * 0.30);   // 30% width
    const cropHeight = Math.floor(cardCanvas.height * 0.08); // 8% height
    const startX = 0;                                        // left: 0
    const startY = Math.floor(cardCanvas.height * 0.92);     // top: 92%

    // Ensure we don't go outside canvas bounds
    const safeStartY = Math.min(startY, cardCanvas.height - cropHeight);
    const safeWidth = Math.min(cropWidth, cardCanvas.width);
    const safeHeight = Math.min(cropHeight, cardCanvas.height - safeStartY);

    console.log('Collector number crop:', {
      cardCanvas: { w: cardCanvas.width, h: cardCanvas.height },
      crop: { x: startX, y: safeStartY, w: safeWidth, h: safeHeight }
    });

    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      cardCanvas,
      startX, safeStartY, safeWidth, safeHeight,
      0, 0, safeWidth, safeHeight
    );

    return canvas;
  }

  processCollectorNumberImage(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Analyze image characteristics to detect foil cards
    const imageStats = this.analyzeImageCharacteristics(data);
    const isFoil = this.detectFoilCard(imageStats);
    
    console.log('Image analysis:', imageStats);
    console.log('Foil detected:', isFoil);

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

  // Fallback OCR strategy with multiple attempts
  async performCollectorNumberOCRWithFallback(collectorCanvas) {
    // First, analyze the image and detect if it's a foil card
    const ctx = collectorCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, collectorCanvas.width, collectorCanvas.height);
    const imageStats = this.analyzeImageCharacteristics(imageData.data);
    const isFoil = this.detectFoilCard(imageStats);
    
    // Store foil detection result for later use
    this.lastDetectedFoil = isFoil;
    console.log('Foil card detected:', isFoil);
    
    this.processCollectorNumberImage(collectorCanvas);
    const strategies = [
      {
        name: 'optimal',
        cropFunc: () => this.cropToCollectorNumberArea(collectorCanvas),
        //processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
      },
      {
        name: 'wider',
        cropFunc: () => this.cropToCollectorNumberAreaWider(collectorCanvas),
        //processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
      },
      {
        name: 'offsetRight',
        cropFunc: () => this.cropToCollectorNumberAreaOffset(collectorCanvas),
        //processFunc: (canvas) => { this.processCollectorNumberImage(canvas); return canvas; }
      }
    ];

    let bestResult = { text: '', score: 0, strategy: 'none' };
    let statusOffset = 0;

    for (const strategy of strategies) {
      try {
        console.log(`Trying OCR strategy: ${strategy.name}`);

        const cropCanvas = strategy.cropFunc();
        this.collectorImages.push(cropCanvas.toDataURL());

        //const processedCanvas = strategy.processFunc(cropCanvas);
        const ocrResult = await this.performCollectorNumberOCR(cropCanvas);

        // Score the result
        const rawScore = this.scoreCollectorNumberResult(ocrResult.rawText);
        console.log(`Score for "${ocrResult.rawText}": ${rawScore}`);
        const cleanedScore = this.scoreCollectorNumberResult(ocrResult.cleanedText);
        console.log(`Score for "${ocrResult.cleanedText}": ${cleanedScore}`);

        let text = ocrResult.cleanedText;
        let score = cleanedScore;

        if (rawScore > cleanedScore) {
          text = ocrResult.rawText;
          score = rawScore;
          console.log(`Using raw text "${ocrResult.rawText}" with score ${rawScore}`);
        }

        if (score > bestResult.score) {
          bestResult = {
            text,
            score: score,
            strategy: strategy.name
          };
        }

        statusOffset += 10;
        this.updateStatus(`Sammlernummer wird erkannt... %`, 50 + statusOffset);

        // If we got a high-confidence result, use it immediately
        if (score >= 80) {
          console.log(`High confidence result from ${strategy.name}: "${text}"`);
          this.updateStatus(`Sammelnummer mit hoher wahrscheinlichkeit gefunden %`, 80);
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
    // Slightly wider crop: 30% width, 10% height
    const cropWidth = Math.floor(cardCanvas.width * 0.40);   // 40% width (wider)
    const cropHeight = Math.floor(cardCanvas.height * 0.10); // 10% height (taller)
    const startX = 0;                                        // left: 0
    const startY = Math.floor(cardCanvas.height * 0.88);     // top: 88% (slightly higher)

    const safeStartY = Math.min(startY, cardCanvas.height - cropHeight);
    const safeWidth = Math.min(cropWidth, cardCanvas.width);
    const safeHeight = Math.min(cropHeight, cardCanvas.height - safeStartY);

    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(cardCanvas, startX, safeStartY, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
    return canvas;
  }

  cropToCollectorNumberAreaOffset(cardCanvas) {
    // Offset right by 5% in case collector number isn't at exact left edge
    const cropWidth = Math.floor(cardCanvas.width * 0.30);   // 30% width
    const cropHeight = Math.floor(cardCanvas.height * 0.08); // 8% height
    const startX = Math.floor(cardCanvas.width * 0.05);      // 5% offset right
    const startY = Math.floor(cardCanvas.height * 0.90);     // top: 90%

    const safeStartX = Math.min(startX, cardCanvas.width - cropWidth);
    const safeStartY = Math.min(startY, cardCanvas.height - cropHeight);
    const safeWidth = Math.min(cropWidth, cardCanvas.width - safeStartX);
    const safeHeight = Math.min(cropHeight, cardCanvas.height - safeStartY);

    const canvas = document.createElement('canvas');
    canvas.width = safeWidth;
    canvas.height = safeHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(cardCanvas, safeStartX, safeStartY, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
    return canvas;
  }

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

    // Toggle the foil status
    this.currentCard.isFoil = !this.currentCard.isFoil;
    
    console.log(`Toggled foil status to: ${this.currentCard.isFoil}`);

    // Update the modal UI
    this.updateFoilToggleButton(this.currentCard.isFoil);
    this.applyFoilEffectToModal(this.currentCard.isFoil);
    
    // Update the card in collection if it exists
    const existingCard = this.cards.find(c => c.id === this.currentCard.id);
    if (existingCard) {
      existingCard.isFoil = this.currentCard.isFoil;
      this.saveCollection();
      this.renderCollection();
      
      const statusText = this.currentCard.isFoil ? 'Foil' : 'Normal';
      this.showSuccess(`"${this.currentCard.name}" updated to ${statusText} version.`);
    } else {
      const statusText = this.currentCard.isFoil ? 'Foil' : 'Normal';
      this.showInfo(`"${this.currentCard.name}" will be added as ${statusText} version.`);
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

  updateModalQuantityDisplay(cardData) {
    const quantity = this.getCardQuantity(cardData.id);
    this.currentQuantity.textContent = quantity;

    // Enable/disable decrease button based on quantity
    this.decreaseQuantityBtn.disabled = quantity === 0;
  }

  getCardQuantity(cardId) {
    const existingCard = this.cards.find(c => c.id === cardId);
    return existingCard ? (existingCard.count || 1) : 0;
  }

  increaseCardQuantity() {
    if (!this.currentCard) return;

    const existingCard = this.cards.find(c => c.id === this.currentCard.id);

    if (existingCard) {
      existingCard.count = (existingCard.count || 1) + 1;
      this.showSuccess(`Added another copy. You now have ${existingCard.count} copies of "${this.currentCard.name}".`);
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
      this.showSuccess(`"${this.currentCard.name}" wurde zur Sammlung hinzugefügt!`);
    }

    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
    this.updateModalQuantityDisplay(this.currentCard);
  }

  decreaseCardQuantity() {
    if (!this.currentCard) return;

    const existingCard = this.cards.find(c => c.id === this.currentCard.id);

    if (!existingCard || existingCard.count <= 1) {
      // Remove the card entirely
      this.cards = this.cards.filter(c => c.id !== this.currentCard.id);
      this.showWarning(`"${this.currentCard.name}" wurde aus der Sammlung entfernt.`);
    } else {
      existingCard.count -= 1;
      this.showInfo(`Reduced quantity. You now have ${existingCard.count} copies of "${this.currentCard.name}".`);
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
      cardElement.innerHTML = `
                <img alt="${card.name}" data-loading="true">
                <div class="card-item-info">
                    <h5>${card.name} ${foilIndicator}</h5>
                    <p>${card.set}</p>
                    ${languageDisplay}
                    <div class="card-quantity-section">
                        <span class="quantity-label">Anzahl:</span>
                        <div class="quantity-controls-inline">
                            <button class="quantity-btn-small decrease" onclick="mtgScanner.decreaseCardQuantityInCollection('${card.id}')" aria-label="Anzahl verringern">−</button>
                            <span class="quantity-display-inline">${card.count || 1}</span>
                            <button class="quantity-btn-small increase" onclick="mtgScanner.increaseCardQuantityInCollection('${card.id}')" aria-label="Anzahl erhöhen">+</button>
                        </div>
                    </div>
                    <div class="card-item-actions">
                        <button class="btn danger" onclick="mtgScanner.removeCard('${card.id}')">🗑️</button>
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

  removeCard(cardId) {
    this.cards = this.cards.filter(c => c.id !== cardId);
    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
  }

  // Increase card quantity directly from collection
  increaseCardQuantityInCollection(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      card.count = (card.count || 1) + 1;
      this.saveCollection();
      this.updateCardCount();
      this.renderCollection();
      this.showSuccess(`Anzahl von "${card.name}" erhöht auf ${card.count}.`);
    }
  }

  // Decrease card quantity directly from collection
  decreaseCardQuantityInCollection(cardId) {
    const card = this.cards.find(c => c.id === cardId);
    if (card) {
      if (card.count <= 1) {
        // Remove card entirely if count would be 0
        this.cards = this.cards.filter(c => c.id !== cardId);
        this.showWarning(`"${card.name}" wurde aus der Sammlung entfernt.`);
      } else {
        card.count -= 1;
        this.showInfo(`Anzahl von "${card.name}" verringert auf ${card.count}.`);
      }
      this.saveCollection();
      this.updateCardCount();
      this.renderCollection();
    }
  }

  saveCollection() {
    localStorage.setItem('mtg-collection', JSON.stringify(this.cards));
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
    if (this.lastCapturedImage) {
      this.displayDebugImage(this.lastCapturedImage, '📷 Original Image');
    } else {
      this.showInfo('Kein aufgenommenes Bild verfügbar');
    }
  }

  showCardImage() {
    if (this.lastCardImage) {
      this.displayDebugImage(this.lastCardImage, '🏄 Card Image');
    } else {
      this.showInfo('Kein Kartenbild verfügbar');
    }
  }


  showCollectorImage() {
    if (this.collectorImages.length > 0) {
      const lastCollectorImage = this.collectorImages[this.collectorImages.length - 1];
      this.displayDebugImage(lastCollectorImage, '🔢 Collector Number Area');
    } else {
      this.showInfo('Kein Sammlernummernbild verfügbar');
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
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  window.mtgScanner = new MTGScanner();
});
