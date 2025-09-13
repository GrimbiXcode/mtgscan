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
    this.updateCardCount();
    this.renderCollection();
    this.initCollectionRecognitions();
  }

  initElements() {
    this.startCameraBtn = document.getElementById('startCamera');
    this.captureCardBtn = document.getElementById('captureCard');
    this.stopCameraBtn = document.getElementById('stopCamera');
    this.uploadCardBtn = document.getElementById('uploadCard');
    this.fileInput = document.getElementById('fileInput');

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
    this.uploadCardBtn.addEventListener('click', () => this.triggerFileUpload());
    this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

    this.addCardBtn.addEventListener('click', () => this.addCardToCollection());
    this.retryOcrBtn.addEventListener('click', () => this.retryOcr());

    this.exportCollectionBtn.addEventListener('click', () => this.exportCollection());
    this.clearCollectionBtn.addEventListener('click', () => this.clearCollection());
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

  // Upload methods
  triggerFileUpload() {
    this.fileInput.click();
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Bitte wählen Sie eine Bilddatei aus.');
      return;
    }

    try {
      // Create canvas from uploaded image
      const canvas = await this.createCanvasFromFile(file);

      // Process the uploaded image using the same workflow as camera
      await this.processUploadedImage(canvas);
    } catch (error) {
      alert('Fehler beim Verarbeiten des Bildes: ' + error.message);
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

      // Crop to collector number area (bottom left)
      //this.updateStatus('Sammlernummer wird extrahiert...', 60);
      //const collectorCanvas = this.cropToCollectorNumberArea(cardCanvas);

      // Store processed images for debugging
      this.lastCapturedImage = canvas.toDataURL();
      this.lastCardImage = cardCanvas.toDataURL();

      // OCR for collector number with fallback strategy
      this.updateStatus('Sammlernummer wird erkannt...', 80);
      const collectorInfo = await this.performCollectorNumberOCRWithFallback(cardCanvas);

      //this.lastCollectorImage = collectorCanvas.toDataURL();

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
      alert('Fehler beim Verarbeiten: ' + error.message);
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

      // Crop to collector number area (bottom left)
      //this.updateStatus('Sammlernummer wird extrahiert...', 60);
      //const collectorCanvas = this.cropToCollectorNumberArea(cardCanvas);

      // THIS STEP IS MADE IN 'performCollectorNumberOCRWithFallback'
      // Simple image processing for collector numbers
      //this.updateStatus('Bild wird optimiert...', 70);
      //this.processCollectorNumberImage(collectorCanvas);

      // Store processed images for debugging
      this.lastCapturedImage = canvas.toDataURL();
      this.lastCardImage = cardCanvas.toDataURL();

      // OCR for collector number with fallback strategy
      this.updateStatus('Sammlernummer wird erkannt...', 80);
      const collectorInfo = await this.performCollectorNumberOCRWithFallback(cardCanvas);


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
    const cropWidth = Math.floor(cardCanvas.width * 0.20);   // 20% width
    const cropHeight = Math.floor(cardCanvas.height * 0.08); // 8% height
    const startX = 0;                                        // left: 0
    const startY = Math.floor(cardCanvas.height * 0.90);     // top: 90%

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

    // Remove non-alphanumeric except spaces and slashes
    cleaned = cleaned.replace(/[^0-9A-Za-z\s/]/g, '');

    // Final cleanup
    cleaned = cleaned.trim().replace(/\s+/g, ' ');

    return cleaned.toUpperCase();
  }

  // Fallback OCR strategy with multiple attempts
  async performCollectorNumberOCRWithFallback(collectorCanvas) {
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

        // If we got a high-confidence result, use it immediately
        if (score >= 80) {
          console.log(`High confidence result from ${strategy.name}: "${text}"`);
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
    const cropWidth = Math.floor(cardCanvas.width * 0.30);   // 30% width (wider)
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
    const cropWidth = Math.floor(cardCanvas.width * 0.20);   // 20% width
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

    if (hasCollectionCode) {
      score += 50;
    }

    if (hasRarityCode) {
      score += 15;
    }

    if (hasCardNumber) {
      score += 30;
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
      console.log('Parsed collector info:', setCode, collectorNumber);

      // Use exact Scryfall lookup by set and collector number
      const response = await fetch(`https://api.scryfall.com/cards/${setCode.toLowerCase()}/${parseInt(collectorNumber, 10)}`,
        {
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
      setCode: null
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

    if (cardInfo.collectorNumber && cardInfo.setCode) {
      console.log('Parsed collector info:', cardInfo.setCode, cardInfo.collectorNumber);
      return cardInfo;
    }

    console.log('Failed to parse collector info:', cleaned);
    console.log('Matched:', collectionMatch, numberMatch);
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

  async showResults(cardData, cardImage, recognizedText = '') {
    this.processingSection.style.display = 'none';
    this.resultsSection.style.display = 'block';

    // Show loading state for result image
    this.resultImage.classList.add('loading');
    this.resultImage.src = 'data:image/svg+xml;base64,' + btoa(
      '<svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="200" height="280" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>' +
      '<text x="100" y="140" text-anchor="middle" fill="#666" font-family="Arial" font-size="14">Loading image...</text>' +
      '</svg>'
    );

    // Fetch and display the card image to bypass CORS
    try {
      const imageUrl = await this.fetchCardImage(cardData.image);
      this.resultImage.src = imageUrl;
      this.resultImage.classList.remove('loading');
    } catch (error) {
      console.error('Error fetching card image:', error);
      // Show a placeholder or default image
      this.resultImage.src = 'data:image/svg+xml;base64,' + btoa(
        '<svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">' +
        '<rect width="200" height="280" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>' +
        '<text x="100" y="140" text-anchor="middle" fill="#666" font-family="Arial" font-size="16">Image not available</text>' +
        '</svg>'
      );
      this.resultImage.classList.remove('loading');
    }
    
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

  async renderCollection() {
    this.cardList.innerHTML = '';

    for (const card of this.cards) {
      const cardElement = document.createElement('div');
      cardElement.className = 'card-item';
      
      // Create the card element structure
      cardElement.innerHTML = `
                <img alt="${card.name}" data-loading="true">
                <div class="card-item-info">
                    <h5>${card.name}</h5>
                    <p>${card.set}</p>
                    <p>Anzahl: ${card.count || 1}</p>
                    <div class="card-item-actions">
                        <button class="btn" onclick="mtgScanner.removeCard('${card.id}')">🗑️</button>
                    </div>
                </div>
            `;
      
      const imgElement = cardElement.querySelector('img');
      
      // Fetch and set the image asynchronously
      try {
        const imageUrl = await this.fetchCardImage(card.image);
        imgElement.src = imageUrl;
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
        card.count || 1,                    // Count
        `"${card.name}"`,                   // Name (quoted to handle commas)
        `"${card.set || ''}"`,              // Edition (set name)
        'Near Mint',                        // Condition (default)
        'English',                          // Language (default)
        'No',                              // Foil (default)
        card.collectorNumber || ''          // Collector Number
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
    if (this.collectorImages.length > 0) {
      const lastCollectorImage = this.collectorImages[this.collectorImages.length - 1];
      this.displayDebugImage(lastCollectorImage, '🔢 Collector Number Area');
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
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  window.mtgScanner = new MTGScanner();
});
