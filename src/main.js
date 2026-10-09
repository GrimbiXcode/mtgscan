// Simple MTG Scanner - Main Application
import { cleanOCRText, scoreCollectorNumberResult, parseCollectorNumber, mapLanguageCode, getLanguageDisplayName } from './recognition/parsing.js';
import { generateDetectionVariants, drawLocatorOverview, MAX_CANDIDATES } from './recognition/pipeline.js';
import { locateCollectorTextBlocks } from './recognition/textLocator.js';

// UI language names. `languageDisplay` on stored cards stays English
// ("German"), because the Moxfield CSV export expects English names.
const LANGUAGE_NAMES_DE = {
  EN: 'Englisch',
  DE: 'Deutsch',
  FR: 'Französisch',
  ES: 'Spanisch',
  IT: 'Italienisch',
  PT: 'Portugiesisch',
  JP: 'Japanisch',
  KO: 'Koreanisch',
  RU: 'Russisch',
  ZH: 'Chinesisch'
};

const NOTIFICATION_ICONS = {
  success: 'i-check-circle',
  error: 'i-x-circle',
  warning: 'i-alert',
  info: 'i-info'
};

const PROCESSING_STEPS = ['locate', 'ocr', 'lookup'];

// Confidence gauge: how far the arc is filled (see index.html's .gauge path)
const GAUGE_PATHS = {
  MEDIUM: 'M4 28A22 22 0 0 1 26 6',
  LOW: 'M4 28A22 22 0 0 1 10.4 12.4'
};

const DEFAULT_CARD_IMAGE = '/assets/default-card.png';
const CAMERA_PREF_KEY = 'mtg-camera-enabled';
const DEBUG_PREF_KEY = 'mtg-debug-enabled';
const SET_REGEX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 3;

// Lets the browser paint (e.g. the "processing" panel) before a synchronous,
// CPU-heavy step like the text locator blocks the main thread.
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

function createIcon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.appendChild(use);
  return svg;
}

function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function displayName(card) {
  return card.printedName || card.name;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

class MTGScanner {
  constructor() {
    this.stream = null;
    this.isProcessing = false;
    this.ocrWorkerPromise = null;
    this.flashEnabled = false;
    this.currentView = 'scan';
    this.resumeCameraOnScan = false;
    this.currentCard = null;
    this.lastScan = null;
    this.sheetChanged = false;
    this.searchQuery = '';
    this.previewScale = 1;
    this.lastLookupError = null;

    // Debug data of the last scan (see performCollectorNumberOCRWithFallback)
    this.debugData = {
      source: null,
      candidates: [],
      winner: null,
      ocrResults: null,
      durationMs: 0
    };

    this.initElements();
    this.initEventListeners();

    this.initCollections();
    this.migrateExistingCollection();
    this.loadActiveCollection();
    this.migrateFoilStatus();
    this.purgeLegacyImageCache();
    this.updateCollectionDisplay();
    this.updateCardCount();
    this.renderCollection();
    this.renderCollectionsList();
    this.collectionRegexReady = this.initCollectionRecognitions();

    this.restoreDebugPreference();
    this.setStageState('idle');
    this.updateCaptureButton();
    this.autoStartCamera();
  }

  initElements() {
    const $ = id => document.getElementById(id);

    // Navigation
    this.views = {
      scan: $('scanView'),
      collection: $('collectionView'),
      workshop: $('workshopView')
    };
    this.tabs = [...document.querySelectorAll('.tab[data-view]')];

    // Scan view
    this.video = $('video');
    this.stage = $('stage');
    this.stagePreview = $('stagePreview');
    this.captureCardBtn = $('captureCard');
    this.captureLabel = $('captureLabel');
    this.stopCameraBtn = $('stopCamera');
    this.flashToggleBtn = $('flashToggle');
    this.uploadCardBtn = $('uploadCard');
    this.fileInput = $('fileInput');
    this.manualEntryBtn = $('manualEntry');

    this.processingSection = $('processingSection');
    this.progressBar = $('progressBar');
    this.progressTrack = this.progressBar.parentElement;
    this.statusText = $('statusText');
    this.stepItems = [...this.processingSection.querySelectorAll('.step')];

    this.lastScanPanel = $('lastScan');
    this.lastScanImage = $('lastScanImage');
    this.lastScanName = $('lastScanName');
    this.lastScanMeta = $('lastScanMeta');
    this.lastScanOpenBtn = $('lastScanOpen');

    // Collection view
    this.currentCollectionName = $('currentCollectionName');
    this.cardCount = $('cardCount');
    this.cardList = $('cardList');
    this.collectionSearch = $('collectionSearch');
    this.collectionToolbar = this.collectionSearch.closest('.toolbar');
    this.collectionEmpty = $('collectionEmpty');
    this.searchEmpty = $('searchEmpty');
    this.exportCollectionBtn = $('exportCollection');
    this.clearCollectionBtn = $('clearCollection');

    // Header collection switcher
    this.collectionSelect = $('collectionSelect');

    // Workshop view
    this.createCollectionForm = $('createCollectionForm');
    this.newCollectionName = $('newCollectionName');
    this.collectionsList = $('collectionsList');
    this.toggleDebugBtn = $('toggleDebug');
    this.debugSection = $('debugSection');
    this.debugStatsContent = $('debugStatsContent');
    this.debugImageDisplay = $('debugImageDisplay');
    this.debugImageTitle = $('debugImageTitle');
    this.debugImageInfo = $('debugImageInfo');
    this.debugImage = $('debugImage');
    this.debugImageCloseBtn = $('debugImageClose');

    // Notifications
    this.notificationContainer = $('notificationContainer');

    // Card sheet
    this.cardModal = $('cardModal');
    this.modalCloseBtn = $('modalCloseBtn');
    this.sheetFound = $('sheetFound');
    this.modalCardImage = $('modalCardImage');
    this.modalCardName = $('sheetTitle');
    this.modalCardSet = $('modalCardSet');
    this.modalCardLanguage = $('modalCardLanguage');
    this.modalCollectorNumber = $('modalCollectorNumber');
    this.modalConfidenceBadge = $('modalConfidenceBadge');
    this.confidenceTitle = $('confidenceTitle');
    this.confidenceGauge = $('confidenceGauge');
    this.confidenceFixBtn = $('confidenceFix');
    this.finishNormalBtn = $('finishNormal');
    this.finishFoilBtn = $('finishFoil');
    this.currentQuantity = $('currentQuantity');
    this.previousQuantity = $('previousQuantity');
    this.quantityDelta = $('quantityDelta');
    this.increaseQuantityBtn = $('increaseQuantity');
    this.decreaseQuantityBtn = $('decreaseQuantity');
    this.sheetPrimaryBtn = $('backToScannerBtn');
    this.sheetPrimaryLabel = $('sheetPrimaryLabel');

    // Correction (inside the card sheet)
    this.manualCorrectionSection = $('manualCorrectionSection');
    this.correctionTitle = $('correctionTitle');
    this.correctionText = $('correctionText');
    this.correctionPreview = $('correctionPreview');
    this.correctionPreviewImage = $('correctionPreviewImage');
    this.correctionTried = $('correctionTried');
    this.manualCorrectionForm = $('manualCorrectionForm');
    this.manualCollectorInput = $('manualCollectorInput');
    this.manualError = $('manualError');
    this.manualRetryBtn = $('manualRetryBtn');
    this.correctionRescanBtn = $('correctionRescan');

    // Confirm dialog
    this.confirmDialog = $('confirmDialog');
    this.confirmTitle = $('confirmTitle');
    this.confirmMessage = $('confirmMessage');
    this.confirmInputWrap = $('confirmInputWrap');
    this.confirmInputLabel = $('confirmInputLabel');
    this.confirmInput = $('confirmInput');
    this.confirmOkBtn = $('confirmOk');
  }

  initEventListeners() {
    // Navigation
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.showView(tab.dataset.view));
    }
    document.querySelectorAll('[data-goto]').forEach(button => {
      button.addEventListener('click', () => this.showView(button.dataset.goto));
    });

    // Scanning
    this.captureCardBtn.addEventListener('click', () => {
      if (this.stream) {
        this.captureCard();
      } else {
        this.startCamera();
      }
    });
    this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
    this.flashToggleBtn.addEventListener('click', () => this.toggleFlash());
    this.uploadCardBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.manualEntryBtn.addEventListener('click', () => this.showCorrection({ mode: 'manual' }));
    this.lastScanOpenBtn.addEventListener('click', () => {
      if (this.lastScan) this.openCardSheet(this.lastScan, { reopened: true });
    });

    // Don't keep the camera (and its light) running in a background tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.stream) {
        this.stopCamera({ remember: false });
        this.resumeCameraOnScan = true;
      } else if (!document.hidden && this.resumeCameraOnScan && this.currentView === 'scan') {
        this.resumeCameraOnScan = false;
        this.startCamera();
      }
    });

    // Collection view
    this.collectionSearch.addEventListener('input', () => {
      this.searchQuery = this.collectionSearch.value;
      this.renderCollection();
    });
    this.cardList.addEventListener('click', (e) => this.onCardListClick(e));
    this.exportCollectionBtn.addEventListener('click', () => this.exportCollection());
    this.clearCollectionBtn.addEventListener('click', () => this.clearCollection());
    this.collectionSelect.addEventListener('change', (e) => this.switchToCollection(e.target.value));

    // Workshop view
    this.createCollectionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.createNewCollection();
    });
    this.collectionsList.addEventListener('click', (e) => this.onCollectionsListClick(e));
    this.toggleDebugBtn.addEventListener('click', () => this.toggleDebugSection());
    this.debugSection.addEventListener('click', (e) => {
      const button = e.target.closest('[data-debug]');
      if (button) this.showDebugView(button.dataset.debug);
    });
    this.debugImageCloseBtn.addEventListener('click', () => this.hideDebugImage());

    // Card sheet
    this.modalCloseBtn.addEventListener('click', () => this.hideCardModal());
    this.sheetPrimaryBtn.addEventListener('click', () => this.confirmCardSheet());
    this.finishNormalBtn.addEventListener('click', () => this.setFoilStatus(false));
    this.finishFoilBtn.addEventListener('click', () => this.setFoilStatus(true));
    this.increaseQuantityBtn.addEventListener('click', () => this.increaseCardQuantity());
    this.decreaseQuantityBtn.addEventListener('click', () => this.decreaseCardQuantity());
    this.confidenceFixBtn.addEventListener('click', () => {
      if (!this.currentCard) return;
      this.showCorrection({
        mode: 'fix',
        text: this.currentCard.recognizedText || '',
        region: this.currentCard.scanRegion
      });
    });
    this.manualCorrectionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.retryManualCorrection();
    });
    this.correctionRescanBtn.addEventListener('click', () => {
      this.hideCardModal();
      if (!this.stream) this.startCamera();
    });
    this.modalCardImage.addEventListener('error', () => {
      if (!this.modalCardImage.src.endsWith(DEFAULT_CARD_IMAGE)) this.modalCardImage.src = DEFAULT_CARD_IMAGE;
    });
    this.cardModal.addEventListener('close', () => this.onCardSheetClosed());

    // Clicking the dimmed backdrop closes a dialog
    for (const dialog of [this.cardModal, this.confirmDialog]) {
      dialog.addEventListener('click', (e) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
        if (outside) dialog.close('cancel');
      });
    }
  }

  // ---------- Preferences ----------

  loadPreference(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  savePreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Preferences are a convenience - ignore a full or blocked storage
    }
  }

  // ---------- Navigation ----------

  showView(name) {
    if (!this.views[name]) return;

    for (const [viewName, element] of Object.entries(this.views)) {
      element.hidden = viewName !== name;
    }
    for (const tab of this.tabs) {
      if (tab.dataset.view === name) {
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.removeAttribute('aria-current');
      }
    }

    // The camera only runs while the scanner is visible
    if (name !== 'scan' && this.stream) {
      this.stopCamera({ remember: false });
      this.resumeCameraOnScan = true;
    } else if (name === 'scan' && this.resumeCameraOnScan) {
      this.resumeCameraOnScan = false;
      this.startCamera();
    }

    if (name === 'workshop') this.renderCollectionsList();

    this.currentView = name;
    window.scrollTo(0, 0);
  }

  // ---------- Set list (for parsing set codes) ----------

  // Resolves once the Scryfall set-code regex is available. Uses a cached
  // copy (refreshed daily) and falls back to a stale one when offline.
  async initCollectionRecognitions() {
    const cachedSource = this.loadPreference('collectionRegex');
    const cachedAt = parseInt(this.loadPreference('collectionRegexTimestamp') || '0', 10);

    if (cachedSource && Date.now() - cachedAt < SET_REGEX_MAX_AGE_MS) {
      this.collectionRegex = new RegExp(cachedSource);
      return;
    }

    try {
      const response = await fetch('https://api.scryfall.com/sets?order=set&dir=asc&format=json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const codes = data.data.map(set => set.code.toUpperCase());
      this.collectionRegex = new RegExp(`(?<collection>${codes.join('|')})`);
      console.log(`Set regex generated from ${codes.length} sets.`);
      this.savePreference('collectionRegex', this.collectionRegex.source);
      this.savePreference('collectionRegexTimestamp', Date.now().toString());
    } catch (error) {
      console.error('Error fetching sets:', error);
      if (cachedSource) {
        this.collectionRegex = new RegExp(cachedSource);
      }
    }
  }

  // ---------- Camera ----------

  setStageState(state) {
    this.stage.dataset.state = state;
  }

  updateCaptureButton() {
    const live = Boolean(this.stream);
    const label = live ? 'Scannen' : 'Kamera starten';
    this.captureCardBtn.setAttribute('aria-label', live ? 'Karte scannen' : 'Kamera starten');
    this.captureCardBtn.querySelector('.icon use').setAttribute('href', live ? '#i-scan' : '#i-camera');
    this.captureLabel.textContent = label;

    const busy = this.isProcessing;
    this.captureCardBtn.disabled = busy;
    this.uploadCardBtn.disabled = busy;
    this.manualEntryBtn.disabled = busy;
  }

  async autoStartCamera() {
    // Only if the user had the camera on last time and the browser already
    // granted access - never trigger a permission prompt on page load.
    if (this.loadPreference(CAMERA_PREF_KEY) !== '1' || !navigator.permissions?.query) return;
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      if (status.state === 'granted' && this.currentView === 'scan') {
        await this.startCamera();
      }
    } catch {
      // Permissions API without "camera" (e.g. Firefox) - user starts it manually
    }
  }

  async startCamera() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showError('Dieser Browser erlaubt keinen Kamerazugriff. Lade stattdessen ein Foto hoch.');
      return;
    }

    this.captureCardBtn.disabled = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1280 }
        }
      });

      // The user may have left the scanner while the permission prompt was open
      if (this.currentView !== 'scan') {
        this.stopCamera({ remember: false });
        this.resumeCameraOnScan = true;
        return;
      }

      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.setStageState('live');
      this.savePreference(CAMERA_PREF_KEY, '1');
      await this.checkFlashCapability();
    } catch (error) {
      this.stream = null;
      if (error.name === 'NotAllowedError') {
        this.savePreference(CAMERA_PREF_KEY, '0');
        this.showError('Kamerazugriff wurde verweigert. Erlaube ihn in den Browser-Einstellungen oder lade ein Foto hoch.', 8000);
      } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
        this.showError('Keine passende Kamera gefunden. Lade stattdessen ein Foto hoch.');
      } else {
        this.showError('Kamera konnte nicht gestartet werden: ' + error.message);
      }
    } finally {
      this.updateCaptureButton();
    }
  }

  stopCamera({ remember = true } = {}) {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.flashEnabled = false;
    this.flashToggleBtn.hidden = true;
    this.updateFlashButton();

    if (this.stage.dataset.state === 'live') this.setStageState('idle');
    if (remember) this.savePreference(CAMERA_PREF_KEY, '0');
    this.updateCaptureButton();
  }

  async checkFlashCapability() {
    try {
      const videoTrack = this.stream?.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.() || {};
      this.flashEnabled = false;
      this.flashToggleBtn.hidden = !capabilities.torch;
      this.updateFlashButton();
    } catch (error) {
      console.log('Error checking flash capability:', error);
      this.flashToggleBtn.hidden = true;
    }
  }

  updateFlashButton() {
    this.flashToggleBtn.setAttribute('aria-pressed', String(this.flashEnabled));
    this.flashToggleBtn.setAttribute('aria-label', this.flashEnabled ? 'Licht ausschalten' : 'Licht einschalten');
  }

  async toggleFlash() {
    const videoTrack = this.stream?.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const enabled = !this.flashEnabled;
      await videoTrack.applyConstraints({ advanced: [{ torch: enabled }] });
      this.flashEnabled = enabled;
      this.updateFlashButton();
    } catch (error) {
      console.error('Error toggling flash:', error);
      this.showError('Licht konnte nicht umgeschaltet werden.');
    }
  }

  // ---------- Capture & upload ----------

  async captureCard() {
    if (this.isProcessing || !this.stream || !this.video.videoWidth) return;
    await this.runScan(this.captureFromVideo());
  }

  captureFromVideo() {
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext('2d').drawImage(this.video, 0, 0);
    return canvas;
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    event.target.value = ''; // allow picking the same file again
    if (!file || this.isProcessing) return;

    if (!file.type.startsWith('image/')) {
      this.showError('Bitte wähle eine Bilddatei aus.');
      return;
    }

    let canvas;
    try {
      canvas = await this.createCanvasFromFile(file);
    } catch (error) {
      this.showError(error.message);
      return;
    }
    await this.runScan(canvas);
  }

  createCanvasFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Das Bild konnte nicht geladen werden.'));
      };
      img.src = url;
    });
  }

  // Shared by camera capture and upload: shows the frozen photo and the
  // processing steps while recognition runs, then opens the result sheet.
  async runScan(canvas) {
    this.isProcessing = true;
    this.updateCaptureButton();
    this.showStagePreview(canvas);
    this.showProcessing(true);

    try {
      await this.processImage(canvas);
    } catch (error) {
      console.error('Scan failed:', error);
      this.showError('Beim Verarbeiten ist ein Fehler aufgetreten: ' + error.message);
    } finally {
      this.isProcessing = false;
      this.showProcessing(false);
      this.setStageState(this.stream ? 'live' : 'idle');
      this.updateCaptureButton();
    }
  }

  showStagePreview(source) {
    const scale = Math.min(1, 1000 / source.width);
    this.stagePreview.width = Math.max(1, Math.round(source.width * scale));
    this.stagePreview.height = Math.max(1, Math.round(source.height * scale));
    this.stagePreview.getContext('2d').drawImage(source, 0, 0, this.stagePreview.width, this.stagePreview.height);
    this.previewScale = scale;
    this.setStageState('frozen');
  }

  highlightOnPreview(candidate) {
    if (!candidate) return;
    const ctx = this.stagePreview.getContext('2d');
    const s = this.previewScale;
    const pad = 6;
    const { x, y, width, height } = candidate.bounds;
    ctx.lineWidth = Math.max(3, this.stagePreview.width / 250);
    ctx.strokeStyle = '#E0AD62';
    ctx.strokeRect(x * s - pad, y * s - pad, width * s + pad * 2, height * s + pad * 2);
  }

  async processImage(canvas) {
    this.setStep('locate', 5, 'Sammlernummer wird gesucht …');
    await nextFrame();

    const rankedCandidates = await this.performCollectorNumberOCRWithFallback(canvas);
    const bestGuessText = rankedCandidates[0]?.text?.trim() || '';

    // Try the next-best OCR candidate on a miss instead of giving up
    this.setStep('lookup', 92, 'Karte wird bei Scryfall gesucht …');
    await this.collectionRegexReady;
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
    this.setStep(null, 100, 'Fertig');

    if (cardData) {
      cardData.confidence = this.classifyConfidence(usedCandidate.score);
      cardData.recognizedText = usedCandidate.text.trim();
      cardData.scanRegion = this.debugData.winner?.region || null;
      this.openCardSheet(cardData);
      return;
    }

    if (this.lastLookupError === 'network') {
      this.showError('Scryfall ist gerade nicht erreichbar. Prüfe die Internetverbindung.');
    }
    this.showCorrection({
      mode: bestGuessText ? 'notFound' : 'noText',
      text: bestGuessText,
      tried: rankedCandidates.map(c => c.text.trim()).filter(Boolean),
      region: this.debugData.winner?.region
    });
  }

  // Confidence tiers derived from the OCR/parse score; HIGH matches the
  // short-circuit threshold used in performCollectorNumberOCRWithFallback.
  classifyConfidence(score) {
    if (score >= 80) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  // ---------- Processing panel ----------

  showProcessing(show) {
    this.processingSection.hidden = !show;
    if (show) {
      this.lastScanPanel.hidden = true;
      this.setProgress(0);
      this.processingSection.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      this.renderLastScan();
    }
  }

  // Marks the given step as active and all earlier ones as done; `null`
  // marks every step as done.
  setStep(stepName, progress, statusText) {
    const activeIndex = stepName ? PROCESSING_STEPS.indexOf(stepName) : PROCESSING_STEPS.length;
    this.stepItems.forEach((item, index) => {
      item.classList.toggle('is-done', index < activeIndex);
      item.classList.toggle('is-active', index === activeIndex);
    });
    this.setProgress(progress);
    if (statusText !== undefined) this.statusText.textContent = statusText;
  }

  setProgress(progress) {
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    this.progressBar.style.width = `${value}%`;
    this.progressTrack.setAttribute('aria-valuenow', String(value));
  }

  updateStatus(text, progress) {
    this.statusText.textContent = text;
    if (progress !== undefined) this.setProgress(progress);
  }

  // ---------- Recognition ----------

  // Locates collector-text candidates and OCRs them best-first, stopping at
  // the first convincing result. Returns every attempt ranked best-first so
  // the caller can retry the next-best one if the top one doesn't resolve
  // to a real card; an empty list means no text block was found at all.
  async performCollectorNumberOCRWithFallback(sourceCanvas) {
    const startedAt = performance.now();
    const candidates = locateCollectorTextBlocks(sourceCanvas, { maxCandidates: MAX_CANDIDATES });
    this.debugData = {
      source: sourceCanvas,
      candidates,
      winner: null,
      ocrResults: null,
      durationMs: 0
    };

    this.highlightOnPreview(candidates[0]);
    this.setStep('ocr', 20, candidates.length ? 'Text wird gelesen …' : 'Keine Sammlernummer gefunden');
    await nextFrame();

    const attempts = [];
    let best = null;

    for (const variant of generateDetectionVariants(sourceCanvas, undefined, candidates)) {
      let ocrResult;
      try {
        ocrResult = await this.performCollectorNumberOCR(variant.canvas);
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
        this.debugData.winner = variant;
      }

      if (score >= 80) break; // High confidence, stop trying more candidates
    }

    this.debugData.durationMs = Math.round(performance.now() - startedAt);
    if (best) {
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
    } else {
      console.warn('No collector text block found in the image');
    }

    this.updateDebugStats();

    return attempts.slice().sort((a, b) => b.score - a.score);
  }

  // One Tesseract worker for the whole session: creating a worker loads
  // and initializes the language model, which used to happen again for
  // every single OCR attempt. Tesseract's default settings are used on
  // purpose - they read the two-line collector block reliably (see
  // sandbox/benchmark.js).
  getOcrWorker() {
    if (!this.ocrWorkerPromise) {
      this.ocrWorkerPromise = import('tesseract.js')
        .then(({ default: Tesseract }) => Tesseract.createWorker('eng', 1, {
          // Self-hosted (same-origin) worker/core assets: the CDN defaults are
          // blocked by COEP: require-corp once cross-origin isolation is enabled.
          workerPath: '/tesseract/worker.min.js',
          corePath: '/tesseract/core',
          logger: m => {
            if (m.status === 'recognizing text') {
              this.updateStatus('Text wird gelesen …', 20 + m.progress * 70);
            } else if (/loading|initializ/.test(m.status)) {
              this.updateStatus('Texterkennung wird beim ersten Scan geladen …');
            }
          }
        }))
        .catch(error => {
          this.ocrWorkerPromise = null; // let the next scan retry
          throw error;
        });
    }
    return this.ocrWorkerPromise;
  }

  async performCollectorNumberOCR(canvas) {
    const worker = await this.getOcrWorker();
    const result = await worker.recognize(canvas);
    const rawText = result.data.text || '';
    return { rawText, cleanedText: cleanOCRText(rawText) };
  }

  // Returns the card or null; `this.lastLookupError` says why it's null
  // ('parse', 'notFound' or 'network') so the UI can explain it.
  async searchCardByCollectorNumber(collectorInfo) {
    this.lastLookupError = null;

    // Parse collector number info (e.g., "FDN U 0125" or "U 0125")
    const parsed = parseCollectorNumber(collectorInfo, this.collectionRegex);
    if (!parsed) {
      console.error('Could not parse collector number:', collectorInfo);
      this.lastLookupError = 'parse';
      return null;
    }

    const { setCode, collectorNumber, language } = parsed;
    console.log('Parsed collector info:', setCode, collectorNumber, language);

    // The collector number is a string (may include a letter suffix or a
    // promo star), so it's URL-encoded rather than parsed as an integer.
    let apiUrl = `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${encodeURIComponent(collectorNumber)}`;
    if (language) {
      apiUrl += `?lang=${mapLanguageCode(language)}`;
    }

    let response;
    try {
      response = await fetch(apiUrl, { headers: { 'Accept': 'application/json' } });
    } catch (error) {
      console.error('Card search error:', error);
      this.lastLookupError = 'network';
      return null;
    }

    if (!response.ok) {
      this.lastLookupError = response.status === 404 ? 'notFound' : 'network';
      return null;
    }

    const card = await response.json();
    return {
      // `name` stays English (Moxfield export); the localized name is for display
      name: card.name,
      printedName: card.printed_name || null,
      set: card.set_name,
      image: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
      id: card.id,
      collectorNumber: card.collector_number,
      setCode: card.set.toUpperCase(),
      language: language || 'EN', // Store the original detected language code or default to EN
      languageDisplay: getLanguageDisplayName(language || 'EN'),
      isFoil: false // Foil isn't detectable from the photo; the sheet has a toggle
    };
  }

  // ---------- Card sheet ----------

  openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  hideCardModal() {
    if (this.cardModal.open) this.cardModal.close();
  }

  languageName(card) {
    return LANGUAGE_NAMES_DE[card.language] || card.languageDisplay || '';
  }

  collectorLabel(card) {
    return [card.setCode, card.collectorNumber].filter(Boolean).join(' ') + (card.language ? ` · ${card.language}` : '');
  }

  openCardSheet(cardData, { reopened = false } = {}) {
    // Previous quantities of both versions, so toggling foil shows the right one
    cardData.previousQuantityNormal = this.getCardQuantity({ ...cardData, isFoil: false });
    cardData.previousQuantityFoil = this.getCardQuantity({ ...cardData, isFoil: true });
    cardData.previousQuantity = cardData.isFoil ? cardData.previousQuantityFoil : cardData.previousQuantityNormal;

    this.currentCard = cardData;
    // A reopened card was already handled - the primary button just closes
    this.sheetChanged = reopened;

    this.modalCardName.textContent = displayName(cardData);
    this.modalCardSet.textContent = cardData.set || '';
    this.modalCardLanguage.textContent = this.languageName(cardData);
    this.modalCollectorNumber.textContent = this.collectorLabel(cardData);
    this.modalCardImage.alt = displayName(cardData);
    this.modalCardImage.src = cardData.image || DEFAULT_CARD_IMAGE;

    // Medium/low confidence: a non-blocking hint with a shortcut to correct
    if (cardData.confidence && cardData.confidence !== 'HIGH') {
      this.confidenceTitle.textContent = cardData.confidence === 'MEDIUM'
        ? 'Mittlere Erkennungssicherheit'
        : 'Niedrige Erkennungssicherheit';
      this.confidenceGauge.setAttribute('d', GAUGE_PATHS[cardData.confidence]);
      this.modalConfidenceBadge.hidden = false;
    } else {
      this.modalConfidenceBadge.hidden = true;
    }

    this.updateFoilUI(cardData.isFoil);
    this.updateModalQuantityDisplay(cardData);

    this.manualCorrectionSection.hidden = true;
    this.sheetFound.hidden = false;
    this.openDialog(this.cardModal);
    this.cardModal.scrollTop = 0;
    this.sheetPrimaryBtn.focus();
  }

  // "Hinzufügen" adds one copy and closes; once the quantity was changed in
  // the sheet the same button just closes ("Fertig").
  confirmCardSheet() {
    if (!this.sheetChanged) {
      this.increaseCardQuantity();
    }
    this.hideCardModal();
  }

  onCardSheetClosed() {
    if (this.currentCard && !this.sheetFound.hidden) {
      this.lastScan = this.currentCard;
    }
    this.renderLastScan();
    if (this.stream && this.currentView === 'scan') {
      this.captureCardBtn.focus();
    }
  }

  setFoilStatus(isFoil) {
    if (!this.currentCard || this.currentCard.isFoil === isFoil) return;
    this.currentCard.isFoil = isFoil;
    this.currentCard.previousQuantity = isFoil
      ? this.currentCard.previousQuantityFoil
      : this.currentCard.previousQuantityNormal;
    this.updateFoilUI(isFoil);
    this.updateModalQuantityDisplay(this.currentCard);
  }

  updateFoilUI(isFoil) {
    this.finishNormalBtn.setAttribute('aria-pressed', String(!isFoil));
    this.finishFoilBtn.setAttribute('aria-pressed', String(isFoil));
    this.cardModal.classList.toggle('is-foil', isFoil);
  }

  updateModalQuantityDisplay(cardData) {
    const quantity = this.getCardQuantity(cardData);
    const previousQuantity = cardData.previousQuantity || 0;
    const delta = quantity - previousQuantity;

    this.currentQuantity.textContent = quantity;
    this.previousQuantity.textContent = previousQuantity;
    this.quantityDelta.textContent = delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '';
    this.decreaseQuantityBtn.disabled = quantity === 0;
    this.sheetPrimaryLabel.textContent = this.sheetChanged ? 'Fertig' : 'Hinzufügen';
  }

  renderLastScan() {
    const card = this.lastScan;
    if (!card || this.isProcessing) {
      this.lastScanPanel.hidden = true;
      return;
    }
    const quantity = this.getCardQuantity(card);
    this.lastScanName.textContent = displayName(card);
    this.lastScanMeta.textContent = `${card.isFoil ? 'Foil · ' : ''}${quantity}× in der Sammlung`;
    if (this.lastScanImage.dataset.src !== card.image) {
      this.lastScanImage.dataset.src = card.image || '';
      this.lastScanImage.src = card.image || DEFAULT_CARD_IMAGE;
    }
    this.lastScanPanel.hidden = false;
  }

  // ---------- Collector-number correction ----------

  showCorrection({ mode, text = '', tried = [], region = null }) {
    const copy = {
      notFound: ['Karte nicht gefunden', 'Die Sammlernummer war nicht eindeutig lesbar. Prüfe sie und suche erneut.'],
      noText: ['Keine Sammlernummer gefunden', 'Im Foto war keine Sammlernummer zu erkennen. Halte die Karte näher, gerader oder heller – oder gib die Nummer selbst ein.'],
      manual: ['Sammlernummer eingeben', 'Sie steht unten links auf der Karte.'],
      fix: ['Sammlernummer korrigieren', 'Prüfe die gelesene Nummer und suche erneut.']
    }[mode];
    this.correctionTitle.textContent = copy[0];
    this.correctionText.textContent = copy[1];

    if (region && mode !== 'manual') {
      this.correctionPreviewImage.src = region.toDataURL();
      const uniqueTried = [...new Set(tried)].slice(0, 3);
      this.correctionTried.replaceChildren();
      if (uniqueTried.length) {
        this.correctionTried.append('Gelesen: ');
        uniqueTried.forEach((value, index) => {
          if (index) this.correctionTried.append(', ');
          this.correctionTried.append(createElement('span', 'mono', value.replace(/\s+/g, ' ')));
        });
      }
      this.correctionPreview.hidden = false;
    } else {
      this.correctionPreview.hidden = true;
    }

    this.manualCollectorInput.value = text.replace(/\s+/g, ' ');
    this.manualError.hidden = true;
    this.sheetFound.hidden = true;
    this.manualCorrectionSection.hidden = false;
    this.openDialog(this.cardModal);
    this.cardModal.scrollTop = 0;
    this.manualCollectorInput.focus();
    this.manualCollectorInput.select();
  }

  async retryManualCorrection() {
    const value = this.manualCollectorInput.value.trim();
    if (!value) {
      this.showManualError('Bitte eine Sammlernummer eingeben.');
      return;
    }

    this.manualRetryBtn.disabled = true;
    this.manualError.hidden = true;
    try {
      await this.collectionRegexReady;
      const cardData = await this.searchCardByCollectorNumber(value);
      if (cardData) {
        cardData.confidence = 'HIGH'; // user-confirmed value
        cardData.recognizedText = value;
        this.openCardSheet(cardData);
        return;
      }
      const messages = {
        parse: 'Set-Code oder Nummer nicht erkannt. Beispiel: FDN 125',
        notFound: `Keine Karte mit „${value}“ gefunden.`,
        network: 'Scryfall ist gerade nicht erreichbar. Prüfe die Internetverbindung.'
      };
      this.showManualError(messages[this.lastLookupError] || messages.notFound);
    } finally {
      this.manualRetryBtn.disabled = false;
    }
  }

  showManualError(message) {
    this.manualError.textContent = message;
    this.manualError.hidden = false;
    this.manualCollectorInput.focus();
  }

  // ---------- Quantities ----------

  // Generate unique identifier for card including foil status
  getUniqueCardId(card) {
    const baseId = card.id || card.cardId;
    if (!baseId) {
      console.error('Card has no valid ID:', card);
      return null;
    }
    return `${baseId}${card.isFoil ? '_foil' : '_normal'}`;
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
    if (!uniqueId) return;

    const existingCard = this.cards.find(c => this.getUniqueCardId(c) === uniqueId);
    if (existingCard) {
      existingCard.count = (existingCard.count || 1) + 1;
    } else {
      const {
        previousQuantity, previousQuantityNormal, previousQuantityFoil,
        confidence, recognizedText, scanRegion, ...card
      } = this.currentCard;
      this.cards.push({
        ...card,
        count: 1,
        addedAt: new Date().toISOString(),
        language: card.language || 'EN',
        languageDisplay: card.languageDisplay || 'English',
        isFoil: card.isFoil || false
      });
    }

    this.sheetChanged = true;
    this.commitCollectionChange();
    this.updateModalQuantityDisplay(this.currentCard);
  }

  decreaseCardQuantity() {
    if (!this.currentCard) return;
    const uniqueId = this.getUniqueCardId(this.currentCard);
    if (!uniqueId) return;

    const existingCard = this.cards.find(c => this.getUniqueCardId(c) === uniqueId);
    if (!existingCard) return;
    if ((existingCard.count || 1) <= 1) {
      this.cards = this.cards.filter(c => this.getUniqueCardId(c) !== uniqueId);
    } else {
      existingCard.count -= 1;
    }

    this.sheetChanged = true;
    this.commitCollectionChange();
    this.updateModalQuantityDisplay(this.currentCard);
  }

  // Saves the active collection and refreshes everything that shows it
  commitCollectionChange() {
    this.saveCollection();
    this.updateCardCount();
    this.renderCollection();
    this.renderCollectionsList();
    if (!this.cardModal.open) this.renderLastScan();
  }

  // ---------- Collection view ----------

  updateCardCount() {
    const totalCards = this.cards.reduce((sum, card) => sum + (card.count || 1), 0);
    this.cardCount.textContent = `${plural(this.cards.length, 'Karte', 'Karten')} · ${plural(totalCards, 'Exemplar', 'Exemplare')}`;
  }

  renderCollection() {
    const query = this.searchQuery.trim().toLowerCase();
    const matches = card => !query
      || (card.name || '').toLowerCase().includes(query)
      || (card.printedName || '').toLowerCase().includes(query)
      || (card.set || '').toLowerCase().includes(query)
      || (card.setCode || '').toLowerCase() === query;

    const isEmpty = this.cards.length === 0;
    this.collectionEmpty.hidden = !isEmpty;
    this.collectionToolbar.hidden = isEmpty;

    const fragment = document.createDocumentFragment();
    let shown = 0;
    // Newest first: the card you just scanned is at the top
    for (let i = this.cards.length - 1; i >= 0; i--) {
      const card = this.cards[i];
      if (!matches(card)) continue;
      const uniqueId = this.getUniqueCardId(card);
      if (!uniqueId) continue;
      fragment.appendChild(this.createCardTile(card, uniqueId));
      shown++;
    }

    this.searchEmpty.hidden = isEmpty || shown > 0;
    this.cardList.replaceChildren(fragment);
  }

  createCardTile(card, uniqueId) {
    const tile = createElement('li', `card-tile${card.isFoil ? ' is-foil' : ''}`);
    const name = displayName(card);
    tile.dataset.id = uniqueId;

    const imageWrap = createElement('div', 'tile-image-wrap');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.src = card.image || DEFAULT_CARD_IMAGE;
    img.addEventListener('error', () => {
      if (!img.src.endsWith(DEFAULT_CARD_IMAGE)) img.src = DEFAULT_CARD_IMAGE;
    }, { once: true });
    imageWrap.appendChild(img);

    if (card.isFoil) {
      const foilTag = createElement('span', 'foil-tag');
      foilTag.append(createIcon('i-sparkle'), 'Foil');
      imageWrap.appendChild(foilTag);
    }

    const removeBtn = createElement('button', 'tile-remove');
    removeBtn.dataset.action = 'remove';
    removeBtn.dataset.id = uniqueId;
    removeBtn.setAttribute('aria-label', `${name} entfernen`);
    const removeInner = document.createElement('span');
    removeInner.appendChild(createIcon('i-trash'));
    removeBtn.appendChild(removeInner);
    imageWrap.appendChild(removeBtn);

    const info = createElement('div', 'tile-info');
    const nameEl = createElement('span', 'tile-name', name);
    nameEl.title = name;
    const meta = createElement('span', 'tile-meta',
      [card.set, card.language].filter(Boolean).join(' · '));
    info.append(nameEl, meta);

    const stepper = createElement('div', 'tile-stepper');
    const dec = createElement('button', '', '−');
    dec.dataset.action = 'dec';
    dec.dataset.id = uniqueId;
    dec.setAttribute('aria-label', `Ein Exemplar von ${name} entfernen`);
    const count = createElement('span', 'tile-count', String(card.count || 1));
    count.setAttribute('aria-label', `${card.count || 1} Exemplare`);
    const inc = createElement('button', '', '+');
    inc.dataset.action = 'inc';
    inc.dataset.id = uniqueId;
    inc.setAttribute('aria-label', `Ein Exemplar von ${name} hinzufügen`);
    stepper.append(dec, count, inc);

    tile.append(imageWrap, info, stepper);
    return tile;
  }

  onCardListClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'inc') this.changeCardCount(id, 1);
    else if (action === 'dec') this.changeCardCount(id, -1);
    else if (action === 'remove') this.removeCard(id);
  }

  changeCardCount(uniqueCardId, delta) {
    const card = this.cards.find(c => this.getUniqueCardId(c) === uniqueCardId);
    if (!card) return;
    const newCount = (card.count || 1) + delta;
    if (newCount <= 0) {
      this.removeCard(uniqueCardId);
      return;
    }
    card.count = newCount;
    this.saveCollection();
    this.updateCardCount();
    this.renderCollectionsList();

    // Update the tile in place so keyboard focus stays on the button
    const tile = this.cardList.querySelector(`.card-tile[data-id="${CSS.escape(uniqueCardId)}"]`);
    const countEl = tile?.querySelector('.tile-count');
    if (countEl) {
      countEl.textContent = String(newCount);
      countEl.setAttribute('aria-label', `${newCount} Exemplare`);
    } else {
      this.renderCollection();
    }
  }

  // Removes a card entry right away and offers an undo instead of asking first
  removeCard(uniqueCardId) {
    const index = this.cards.findIndex(c => this.getUniqueCardId(c) === uniqueCardId);
    if (index === -1) return;
    const [removed] = this.cards.splice(index, 1);
    this.commitCollectionChange();

    const collectionId = this.collectionsData.activeCollection;
    this.showNotification(`„${displayName(removed)}“ entfernt.`, 'info', 6000, {
      label: 'Rückgängig',
      onClick: () => {
        if (this.collectionsData.activeCollection !== collectionId) return;
        this.cards.splice(Math.min(index, this.cards.length), 0, removed);
        this.commitCollectionChange();
      }
    });
  }

  exportCollection() {
    if (this.cards.length === 0) {
      this.showWarning('Die Sammlung ist leer – es gibt nichts zu exportieren.');
      return;
    }

    // Moxfield-compatible CSV
    const rows = [['Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Collector Number']];
    for (const card of this.cards) {
      rows.push([
        card.count || 1,
        card.name,
        card.set || '',
        'Near Mint',
        card.languageDisplay || 'English',
        card.isFoil ? 'Yes' : 'No',
        card.collectorNumber || ''
      ]);
    }
    const csvContent = rows.map(row => row.map(csvCell).join(',')).join('\n');

    const collection = this.collectionsData.collections[this.collectionsData.activeCollection];
    const slug = (collection?.name || 'sammlung')
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sammlung';

    const url = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mtg-${slug}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    this.showSuccess('Export gespeichert (CSV im Moxfield-Format).');
  }

  async clearCollection() {
    if (this.cards.length === 0) return;
    const collection = this.collectionsData.collections[this.collectionsData.activeCollection];
    const total = this.cards.reduce((sum, card) => sum + (card.count || 1), 0);
    const confirmed = await this.confirmAction({
      title: `„${collection?.name || 'Sammlung'}“ leeren?`,
      message: `${plural(total, 'Exemplar wird', 'Exemplare werden')} aus der Sammlung entfernt.`,
      confirmLabel: 'Leeren',
      danger: true
    });
    if (!confirmed) return;

    const previousCards = this.cards;
    const collectionId = this.collectionsData.activeCollection;
    this.cards = [];
    this.searchQuery = '';
    this.collectionSearch.value = '';
    this.commitCollectionChange();
    this.showNotification('Sammlung geleert.', 'info', 8000, {
      label: 'Rückgängig',
      onClick: () => {
        if (this.collectionsData.activeCollection !== collectionId) return;
        this.cards = previousCards.concat(this.cards);
        this.commitCollectionChange();
      }
    });
  }

  // Card images used to be fetched and stored as data URLs in localStorage,
  // which filled the ~5MB quota after a few dozen cards (and could then
  // break saving the collection itself). They are now plain <img> URLs that
  // the browser caches; this frees the space the old cache took.
  purgeLegacyImageCache() {
    try {
      Object.keys(localStorage)
        .filter(key => key.startsWith('card-image-'))
        .forEach(key => localStorage.removeItem(key));
    } catch {
      // Storage not accessible - nothing to clean up
    }
  }

  // ---------- Dialog helper ----------

  // Styled replacement for confirm()/prompt(). Resolves to true/false, or -
  // with `input` - to the entered text (null when cancelled).
  confirmAction({ title, message = '', confirmLabel = 'OK', danger = false, input = null }) {
    this.confirmTitle.textContent = title;
    this.confirmMessage.textContent = message;
    this.confirmOkBtn.textContent = confirmLabel;
    this.confirmOkBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    this.confirmInputWrap.hidden = !input;
    if (input) {
      this.confirmInputLabel.textContent = input.label;
      this.confirmInput.value = input.value || '';
    }

    this.confirmDialog.returnValue = '';
    this.confirmDialog.showModal();
    if (input) {
      this.confirmInput.focus();
      this.confirmInput.select();
    } else if (danger) {
      // Destructive: start on "Abbrechen"
      this.confirmDialog.querySelector('button[value="cancel"]').focus();
    }

    return new Promise(resolve => {
      this.confirmDialog.addEventListener('close', () => {
        const ok = this.confirmDialog.returnValue === 'ok';
        resolve(input ? (ok ? this.confirmInput.value.trim() : null) : ok);
      }, { once: true });
    });
  }

  // ---------- Debug tools ----------

  restoreDebugPreference() {
    this.setDebugVisible(this.loadPreference(DEBUG_PREF_KEY) === '1');
  }

  toggleDebugSection() {
    const visible = this.debugSection.hidden;
    this.setDebugVisible(visible);
    this.savePreference(DEBUG_PREF_KEY, visible ? '1' : '0');
  }

  setDebugVisible(visible) {
    this.debugSection.hidden = !visible;
    this.toggleDebugBtn.setAttribute('aria-checked', String(visible));
  }

  showDebugView(name) {
    const views = {
      captured: () => this.showCapturedImage(),
      locator: () => this.showLocatorImage(),
      textarea: () => this.showTextAreaImage(),
      final: () => this.showFinalImage(),
      ocr: () => this.showOCRResults()
    };
    views[name]?.();
  }

  updateDebugStats() {
    if (!this.debugStatsContent || !this.debugData.source) return;

    const { source, candidates, ocrResults, durationMs } = this.debugData;
    const rows = [
      ['Originalgröße', `${source.width}×${source.height}`],
      ['Gefundene Textblöcke', `${candidates.length}`],
      ['Dauer Erkennung', `${durationMs} ms`],
    ];
    if (ocrResults) {
      rows.push(['OCR-Ergebnis', `"${ocrResults.finalText}" (${ocrResults.finalScore})`]);
      rows.push(['  └─ Rohtext', `"${ocrResults.rawText}" (${ocrResults.rawScore})`]);
      rows.push(['  └─ Bereinigt', `"${ocrResults.cleanedText}" (${ocrResults.cleanedScore})`]);
      rows.push(['  └─ Variante', `${ocrResults.usedVariant} (${ocrResults.attempts.length} OCR-Lauf/Läufe)`]);
    }

    // textContent instead of innerHTML: OCR text is untrusted input.
    const container = document.createElement('div');
    for (const [label, value] of rows) {
      const item = createElement('div', 'debug-stat-item');
      item.append(createElement('span', 'debug-stat-label', `${label}:`), createElement('span', 'debug-stat-value', value));
      container.append(item);
    }
    this.debugStatsContent.replaceChildren(container);
  }

  // Debug images are kept as canvases and only encoded when viewed:
  // toDataURL() on a 12MP photo costs hundreds of milliseconds per scan.
  showDebugCanvas(title, canvas, description) {
    if (!canvas) {
      this.showInfo('Führe zuerst einen Scan durch, um Debug-Bilder zu sehen.');
      return;
    }
    this.displayDebugImage(title, canvas.toDataURL(), description);
  }

  showCapturedImage() {
    this.showDebugCanvas('Original', this.debugData.source,
      'Ursprüngliches Bild vom Kamera-Stream oder hochgeladene Datei');
  }

  showLocatorImage() {
    const { source, candidates } = this.debugData;
    this.showDebugCanvas('Textsuche', source && drawLocatorOverview(source, candidates),
      'Gefundene Sammlernummer-Kandidaten (rot = bester, gelb = Ausweichkandidaten)');
  }

  showTextAreaImage() {
    this.showDebugCanvas('Textbereich', this.debugData.winner?.region,
      'Ausschnitt des verwendeten Kandidaten aus dem Originalbild');
  }

  showFinalImage() {
    this.showDebugCanvas('Final', this.debugData.winner?.canvas,
      'Binarisiertes Bild, das an die OCR geht');
  }

  displayDebugImage(title, imageDataUrl, description) {
    this.debugImageTitle.textContent = title;
    this.debugImage.src = imageDataUrl;

    // Support HTML in description for OCR results (escaped by the caller)
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

  showOCRResults() {
    const ocr = this.debugData.ocrResults;
    if (!ocr) {
      this.showInfo('Führe zuerst einen Scan durch, um OCR-Resultate zu sehen.');
      return;
    }

    const attemptLines = ocr.attempts
      .map(a => `${this.escapeHtml(a.variant)}: "${this.escapeHtml(a.text)}" (${a.score})`)
      .join('<br>');
    const description = `
<strong>Rohtext (Tesseract):</strong><br>
"${this.escapeHtml(ocr.rawText)}"<br>
<em>Bewertung: ${ocr.rawScore} Punkte</em><br><br>
<strong>Bereinigter Text:</strong><br>
"${this.escapeHtml(ocr.cleanedText)}"<br>
<em>Bewertung: ${ocr.cleanedScore} Punkte</em><br><br>
<strong>Verwendetes Ergebnis:</strong><br>
"${this.escapeHtml(ocr.finalText)}" (${ocr.usedRaw ? 'Rohtext' : 'Bereinigt'}, ${this.escapeHtml(ocr.usedVariant)})<br>
<em>Finale Bewertung: ${ocr.finalScore} Punkte</em><br><br>
<strong>Alle Versuche:</strong><br>
${attemptLines}<br><br>
<strong>Bewertungskriterien:</strong><br>
• Set-Code vor dem Sprachcode: +50 (korrigiert +45, anderswo +40, nur als Teilstring +20)<br>
• Kartennummer erkannt: +30 Punkte<br>
• Seltenheitscode erkannt: +15 Punkte<br>
• Sprachcode erkannt: +10 Punkte<br>
• Ausreichende Länge: +5 Punkte
    `;

    this.showDebugCanvas('OCR-Resultate & Bewertung', this.debugData.winner?.canvas, description);
  }

  // ---------- Notifications ----------

  // `action` ({ label, onClick }) adds a button, e.g. "Rückgängig"
  showNotification(message, type = 'info', duration = 5000, action = null) {
    const notification = createElement('div', `notification ${type}`);
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');

    notification.appendChild(createIcon(NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info, 'icon notification-icon'));
    // Message may contain untrusted text (API data, error messages) —
    // textContent so it is never reinterpreted as HTML
    notification.appendChild(createElement('div', 'notification-content', message));

    if (action) {
      const actionBtn = createElement('button', 'notification-action', action.label);
      actionBtn.addEventListener('click', () => {
        action.onClick();
        this.hideNotification(notification);
      });
      notification.appendChild(actionBtn);
    }

    const closeBtn = createElement('button', 'icon-btn');
    closeBtn.setAttribute('aria-label', 'Hinweis schließen');
    closeBtn.appendChild(createIcon('i-close'));
    closeBtn.addEventListener('click', () => this.hideNotification(notification));
    notification.appendChild(closeBtn);

    // Keep the stack short - drop the oldest
    const visible = [...this.notificationContainer.querySelectorAll('.notification:not(.hide)')];
    visible.slice(0, Math.max(0, visible.length - MAX_NOTIFICATIONS + 1)).forEach(n => this.hideNotification(n));

    this.notificationContainer.appendChild(notification);
    requestAnimationFrame(() => notification.classList.add('show'));

    if (duration > 0) {
      setTimeout(() => this.hideNotification(notification), duration);
    }
    return notification;
  }

  hideNotification(notification) {
    if (!notification || !notification.parentNode) return;
    notification.classList.add('hide');
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }

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

  // ---------- Collections ----------

  initCollections() {
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
    try {
      const stored = localStorage.getItem('mtg-collections-meta');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Error parsing collections data:', e);
    }
    return { collections: {}, activeCollection: null };
  }

  saveCollectionsData(data) {
    try {
      localStorage.setItem('mtg-collections-meta', JSON.stringify(data));
      this.collectionsData = data;
    } catch (e) {
      console.error('Error saving collections data:', e);
      this.showError('Die Sammlungsdaten konnten nicht gespeichert werden – der Browser-Speicher ist voll oder gesperrt.');
    }
  }

  generateCollectionId() {
    return 'coll_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  getCollectionStorageKey(collectionId) {
    return `mtg-collection-${collectionId}`;
  }

  loadActiveCollection() {
    const activeId = this.collectionsData.activeCollection;
    this.cards = [];
    if (activeId && this.collectionsData.collections[activeId]) {
      try {
        this.cards = JSON.parse(localStorage.getItem(this.getCollectionStorageKey(activeId)) || '[]');
      } catch (e) {
        console.error('Error loading collection:', e);
        this.showError('Die Sammlung konnte nicht geladen werden.');
      }
    }
  }

  populateCollectionSelector() {
    this.collectionSelect.replaceChildren(...this.sortedCollections().map(collection => {
      const option = document.createElement('option');
      option.value = collection.id;
      option.textContent = collection.name;
      return option;
    }));
    this.collectionSelect.value = this.collectionsData.activeCollection;
  }

  sortedCollections() {
    return Object.values(this.collectionsData.collections)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  updateCollectionDisplay() {
    const activeCollection = this.collectionsData.collections[this.collectionsData.activeCollection];
    if (activeCollection) {
      this.currentCollectionName.textContent = activeCollection.name;
    }
  }

  switchToCollection(collectionId, { silent = false } = {}) {
    if (collectionId === this.collectionsData.activeCollection || !this.collectionsData.collections[collectionId]) {
      return;
    }

    this.saveCollection();
    this.collectionsData.activeCollection = collectionId;
    this.saveCollectionsData(this.collectionsData);

    this.loadActiveCollection();
    this.lastScan = null;
    this.searchQuery = '';
    this.collectionSearch.value = '';
    this.populateCollectionSelector();
    this.updateCollectionDisplay();
    this.updateCardCount();
    this.renderCollection();
    this.renderCollectionsList();
    this.renderLastScan();

    if (!silent) {
      const collection = this.collectionsData.collections[collectionId];
      this.showInfo(`Aktive Sammlung: „${collection.name}“`, 2500);
    }
  }

  isDuplicateCollectionName(name, exceptId = null) {
    return Object.values(this.collectionsData.collections)
      .some(c => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
  }

  createNewCollection() {
    const name = this.newCollectionName.value.trim();
    if (!name) {
      this.showWarning('Bitte gib einen Namen für die Sammlung ein.');
      this.newCollectionName.focus();
      return;
    }
    if (this.isDuplicateCollectionName(name)) {
      this.showWarning('Eine Sammlung mit diesem Namen gibt es bereits.');
      this.newCollectionName.focus();
      return;
    }

    const newId = this.generateCollectionId();
    this.collectionsData.collections[newId] = {
      id: newId,
      name,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      cardCount: 0
    };
    this.saveCollectionsData(this.collectionsData);
    try {
      localStorage.setItem(this.getCollectionStorageKey(newId), JSON.stringify([]));
    } catch (e) {
      console.error('Error creating collection storage:', e);
    }

    this.newCollectionName.value = '';
    // A new collection is almost always created to scan into it right away
    this.switchToCollection(newId, { silent: true });
    this.showSuccess(`Sammlung „${name}“ erstellt und aktiviert.`);
  }

  renderCollectionsList() {
    const collections = this.sortedCollections();
    const onlyOne = collections.length === 1;

    this.collectionsList.replaceChildren(...collections.map(collection => {
      const isActive = collection.id === this.collectionsData.activeCollection;
      const row = createElement('li', `collection-row${isActive ? ' is-active' : ''}`);

      const selectBtn = createElement('button', 'icon-btn');
      selectBtn.dataset.action = 'select';
      selectBtn.dataset.id = collection.id;
      selectBtn.setAttribute('aria-label', `${collection.name} auswählen`);
      selectBtn.setAttribute('aria-pressed', String(isActive));
      selectBtn.appendChild(createElement('span', 'select-dot'));

      const info = createElement('div', 'collection-info');
      const nameLine = createElement('div', 'collection-name-line');
      nameLine.appendChild(createElement('span', 'collection-name', collection.name));
      if (isActive) nameLine.appendChild(createElement('span', 'active-tag', 'Aktiv'));
      const count = collection.cardCount || 0;
      const modified = new Date(collection.lastModified).toLocaleDateString('de-DE');
      info.append(nameLine, createElement('span', 'collection-meta',
        `${count ? plural(count, 'Exemplar', 'Exemplare') : 'Noch leer'} · bearbeitet ${modified}`));

      const renameBtn = createElement('button', 'icon-btn');
      renameBtn.dataset.action = 'rename';
      renameBtn.dataset.id = collection.id;
      renameBtn.setAttribute('aria-label', `${collection.name} umbenennen`);
      renameBtn.appendChild(createIcon('i-pencil'));

      const deleteBtn = createElement('button', 'icon-btn is-danger');
      deleteBtn.dataset.action = 'delete';
      deleteBtn.dataset.id = collection.id;
      deleteBtn.setAttribute('aria-label', `${collection.name} löschen`);
      deleteBtn.appendChild(createIcon('i-trash'));
      if (onlyOne) {
        deleteBtn.disabled = true;
        deleteBtn.title = 'Die letzte Sammlung kann nicht gelöscht werden';
      }

      row.append(selectBtn, info, renameBtn, deleteBtn);
      return row;
    }));
  }

  onCollectionsListClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === 'select') this.switchToCollection(id);
    else if (action === 'rename') this.renameCollection(id);
    else if (action === 'delete') this.deleteCollection(id);
  }

  async renameCollection(collectionId) {
    const collection = this.collectionsData.collections[collectionId];
    if (!collection) return;

    const newName = await this.confirmAction({
      title: 'Sammlung umbenennen',
      confirmLabel: 'Speichern',
      input: { label: 'Name', value: collection.name }
    });
    if (!newName || newName === collection.name) return;

    if (this.isDuplicateCollectionName(newName, collectionId)) {
      this.showWarning('Eine Sammlung mit diesem Namen gibt es bereits.');
      return;
    }

    collection.name = newName;
    collection.lastModified = new Date().toISOString();
    this.saveCollectionsData(this.collectionsData);

    this.populateCollectionSelector();
    this.updateCollectionDisplay();
    this.renderCollectionsList();
    this.showSuccess(`Sammlung heißt jetzt „${newName}“.`);
  }

  async deleteCollection(collectionId) {
    const collection = this.collectionsData.collections[collectionId];
    if (!collection) return;

    if (Object.keys(this.collectionsData.collections).length === 1) {
      this.showWarning('Die letzte Sammlung kann nicht gelöscht werden.');
      return;
    }

    const count = collection.cardCount || 0;
    const confirmed = await this.confirmAction({
      title: `„${collection.name}“ löschen?`,
      message: count
        ? `Die Sammlung mit ${plural(count, 'Exemplar', 'Exemplaren')} wird endgültig gelöscht.`
        : 'Die leere Sammlung wird gelöscht.',
      confirmLabel: 'Löschen',
      danger: true
    });
    if (!confirmed) return;

    delete this.collectionsData.collections[collectionId];
    try {
      localStorage.removeItem(this.getCollectionStorageKey(collectionId));
    } catch (e) {
      console.error('Error removing collection storage:', e);
    }

    if (this.collectionsData.activeCollection === collectionId) {
      this.collectionsData.activeCollection = this.sortedCollections()[0].id;
      this.lastScan = null;
    }
    this.saveCollectionsData(this.collectionsData);

    this.loadActiveCollection();
    this.populateCollectionSelector();
    this.updateCollectionDisplay();
    this.updateCardCount();
    this.renderCollection();
    this.renderCollectionsList();
    this.renderLastScan();

    this.showSuccess(`Sammlung „${collection.name}“ wurde gelöscht.`);
  }

  saveCollection() {
    const activeId = this.collectionsData.activeCollection;
    if (!activeId) return;

    try {
      localStorage.setItem(this.getCollectionStorageKey(activeId), JSON.stringify(this.cards));
    } catch (e) {
      console.error('Error saving collection:', e);
      this.showError('Die Sammlung konnte nicht gespeichert werden – der Browser-Speicher ist voll oder gesperrt.');
      return;
    }

    const collection = this.collectionsData.collections[activeId];
    if (collection) {
      collection.lastModified = new Date().toISOString();
      collection.cardCount = this.cards.reduce((sum, card) => sum + (card.count || 1), 0);
      this.saveCollectionsData(this.collectionsData);
    }
  }

  // Migrate existing single collection to multi-collection system
  migrateExistingCollection() {
    let oldCollection;
    try {
      oldCollection = localStorage.getItem('mtg-collection');
    } catch {
      return;
    }
    if (!oldCollection || oldCollection === '[]') return;

    try {
      const cards = JSON.parse(oldCollection);
      if (cards.length === 0) return;

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

      localStorage.setItem(this.getCollectionStorageKey(defaultCollection.id), oldCollection);
      defaultCollection.cardCount = cards.reduce((sum, card) => sum + (card.count || 1), 0);
      defaultCollection.lastModified = new Date().toISOString();
      this.saveCollectionsData(collectionsData);
      localStorage.removeItem('mtg-collection');

      this.showSuccess('Deine bestehende Sammlung wurde übernommen.');
    } catch (e) {
      console.error('Error migrating collection:', e);
    }
  }

  // Migrate existing cards to include foil status
  migrateFoilStatus() {
    if (!Array.isArray(this.cards)) return;

    let migrationNeeded = false;
    this.cards.forEach(card => {
      if (card.isFoil === undefined) {
        card.isFoil = false;
        migrationNeeded = true;
      }
    });
    if (migrationNeeded) this.saveCollection();
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
