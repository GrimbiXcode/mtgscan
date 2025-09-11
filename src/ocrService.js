// OCR Service using Tesseract.js for automatic card text recognition
import { createWorker } from 'tesseract.js';

class OCRService {
    constructor() {
        this.worker = null;
        this.isInitialized = false;
        this.isProcessing = false;
        this.currentLanguage = 'eng'; // Default language

        // OCR configuration optimized for MTG cards
        this.ocrConfigs = {
            // Primary config for card names (single line)
            cardName: {
                lang: 'eng', // Will be updated dynamically
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()[]{}',
                tessedit_pageseg_mode: '7', // Single text line
                preserve_interword_spaces: '1',
                tessedit_do_invert: '0',
                tessedit_create_hocr: '1'
            },
            // Secondary config for general text blocks
            textBlock: {
                lang: 'eng', // Will be updated dynamically
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()[]{}',
                tessedit_pageseg_mode: '6', // Uniform block of text
                preserve_interword_spaces: '1',
                tessedit_do_invert: '0'
            },
            // Aggressive config for difficult images
            aggressive: {
                lang: 'eng', // Will be updated dynamically
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789 \'-.,/:()[]{}',
                tessedit_pageseg_mode: '8', // Single word
                preserve_interword_spaces: '1',
                tessedit_do_invert: '1',
                tessedit_create_hocr: '1',
                classify_bln_numeric_mode: '0'
            }
        };

        this.currentConfig = 'cardName';

        // Progress callback for UI updates
        this.onProgress = null;
        this.onStatusUpdate = null;
    }

    async init(onProgress = null, onStatusUpdate = null, language = 'eng') {
        if (this.isInitialized && this.currentLanguage === language) return;

        try {
            this.onProgress = onProgress;
            this.onStatusUpdate = onStatusUpdate;

            if (this.onStatusUpdate) {
                this.onStatusUpdate('OCR wird initialisiert...');
            }

            // If we need to change language or initialize for the first time
            if (!this.isInitialized || this.currentLanguage !== language) {
                // Terminate existing worker if language changed
                if (this.worker && this.currentLanguage !== language) {
                    await this.worker.terminate();
                    this.worker = null;
                    this.isInitialized = false;
                }

                // Create Tesseract worker if needed
                if (!this.worker) {
                    this.worker = await createWorker();
                }

                // Update current language
                this.currentLanguage = language;

                // Update all configurations with the new language
                this.updateConfigLanguages(language);

                // Load language data
                await this.worker.loadLanguage(language);
                await this.worker.initialize(language);

                // Set initial parameters for card text recognition
                await this.worker.setParameters(this.ocrConfigs[this.currentConfig]);

                this.isInitialized = true;
            }

            if (this.onStatusUpdate) {
                this.onStatusUpdate('OCR bereit');
            }

            console.log(`OCR Service erfolgreich initialisiert (Sprache: ${language})`);
        } catch (error) {
            console.error('Fehler bei OCR Initialisierung:', error);
            throw new Error('OCR konnte nicht initialisiert werden: ' + error.message);
        }
    }

    // Update language in all OCR configurations
    updateConfigLanguages(language) {
        Object.keys(this.ocrConfigs).forEach(configKey => {
            this.ocrConfigs[configKey].lang = language;
        });
    }

    // Set new language for OCR
    async setLanguage(language) {
        if (this.currentLanguage === language) return;

        await this.init(this.onProgress, this.onStatusUpdate, language);
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    async recognizeText(imageData, options = {}) {
        if (!this.isInitialized) {
            throw new Error('OCR Service muss zuerst initialisiert werden');
        }

        if (this.isProcessing) {
            throw new Error('OCR verarbeitet bereits ein Bild');
        }

        try {
            this.isProcessing = true;

            if (this.onStatusUpdate) {
                this.onStatusUpdate('Text wird erkannt...');
            }

            // Try multiple OCR configurations for best results
            const results = await this.recognizeWithMultipleConfigs(imageData, options);

            // Select the best result based on confidence and text quality
            const bestResult = this.selectBestResult(results);

            // Extract and clean text
            const extractedText = this.cleanOCRText(bestResult.text);

            if (this.onStatusUpdate) {
                this.onStatusUpdate('Texterkennung abgeschlossen');
            }

            return {
                text: extractedText,
                confidence: bestResult.confidence,
                words: bestResult.words || [],
                lines: bestResult.lines || [],
                rawResult: bestResult,
                allResults: results // Include all results for debugging
            };

        } catch (error) {
            console.error('OCR Fehler:', error);
            throw new Error('Texterkennung fehlgeschlagen: ' + error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async recognizeWithMultipleConfigs(imageData, options = {}) {
        const results = [];
        const configsToTry = options.useAllConfigs ?
            Object.keys(this.ocrConfigs) :
            ['cardName', 'textBlock']; // Default to trying primary configs

        for (const configName of configsToTry) {
            try {
                if (this.onStatusUpdate) {
                    this.onStatusUpdate(`Versuche ${configName} Konfiguration...`);
                }

                // Set the configuration
                await this.worker.setParameters(this.ocrConfigs[configName]);

                // Perform OCR recognition
                const result = await this.worker.recognize(imageData);

                results.push({
                    config: configName,
                    text: result.data.text || '',
                    confidence: result.data.confidence || 0,
                    words: result.data.words || [],
                    lines: result.data.lines || [],
                    rawResult: result.data
                });

                console.log(`OCR ${configName} result:`, {
                    text: result.data.text?.substring(0, 50) + '...',
                    confidence: result.data.confidence
                });

            } catch (error) {
                console.warn(`OCR config ${configName} failed:`, error);
                results.push({
                    config: configName,
                    text: '',
                    confidence: 0,
                    error: error.message
                });
            }
        }

        return results;
    }

    selectBestResult(results) {
        if (results.length === 0) {
            return { text: '', confidence: 0, words: [], lines: [] };
        }

        // Filter out failed results
        const validResults = results.filter(r => !r.error && r.text && r.text.trim().length > 0);

        if (validResults.length === 0) {
            // Return the first result even if it failed
            return results[0];
        }

        // Score results based on multiple factors
        const scoredResults = validResults.map(result => {
            let score = result.confidence || 0;

            // Bonus for reasonable text length (card names are usually 2-30 chars)
            const textLength = result.text.trim().length;
            if (textLength >= 2 && textLength <= 50) {
                score += 10;
            }

            // Bonus for containing common MTG patterns
            const text = result.text.toLowerCase();
            if (/^[a-z\s\-']+$/i.test(result.text.trim())) {
                score += 15; // Bonus for clean text (letters, spaces, hyphens, apostrophes only)
            }

            // Penalty for excessive special characters or numbers at start
            if (/^[0-9\W]/.test(result.text.trim())) {
                score -= 5;
            }

            return { ...result, score };
        });

        // Sort by score and return the best one
        scoredResults.sort((a, b) => b.score - a.score);

        console.log('OCR result scores:', scoredResults.map(r => ({
            config: r.config,
            text: r.text.substring(0, 30),
            confidence: r.confidence,
            score: r.score
        })));

        return scoredResults[0];
    }

    cleanOCRText(text) {
        if (!text) return '';

        return text
            // Remove extra whitespace
            .replace(/\s+/g, ' ')
            // Remove common OCR artifacts and unwanted characters
            .replace(/[|\\\/\[\]{}()<>"]/g, '')
            .replace(/[~`!@#$%^&*+=_]/g, '') // Remove special symbols
            // Fix common OCR mistakes for MTG card names
            .replace(/\b0(?=[a-zA-Z])/g, 'O')  // Zero to O when followed by letter
            .replace(/\b1(?=[a-zA-Z])/g, 'I')  // One to I when followed by letter
            .replace(/\b5(?=[a-zA-Z])/g, 'S')  // Five to S when followed by letter
            .replace(/\b8(?=[a-zA-Z])/g, 'B')  // Eight to B when followed by letter
            .replace(/rn/g, 'm')    // rn to m
            .replace(/vv/g, 'w')    // vv to w
            .replace(/ii/g, 'll')   // ii to ll
            .replace(/cl/g, 'd')    // cl to d
            .replace(/fi/g, 'h')    // fi to h
            .replace(/\b6(?=\s|$)/g, 'G')  // 6 to G at word boundaries
            .replace(/\b9(?=\s|$)/g, 'g')  // 9 to g at word boundaries
            // Clean up punctuation
            .replace(/[.,;:!?]+$/, '') // Remove trailing punctuation
            // Remove non-printable characters but keep basic punctuation and German umlauts
            .replace(/[^\x20-\x7EäöüßÄÖÜ]/g, '')
            .replace(/\s*-\s*/g, '-') // Normalize hyphens
            .replace(/\s*'\s*/g, "'") // Normalize apostrophes
            .trim();
    }

    extractCardNames(ocrResult) {
        const { text, lines, words } = ocrResult;
        const possibleNames = [];

        // Strategy 1: Process each line as potential card name
        if (lines && lines.length > 0) {
            for (const line of lines) {
                const lineText = line.text ? line.text.trim() : '';
                const cleanedLine = this.cleanOCRText(lineText);

                if (this.isValidCardName(cleanedLine)) {
                    possibleNames.push({
                        text: cleanedLine,
                        confidence: line.confidence || 0,
                        source: 'line'
                    });
                }

                // Also try variations of the line
                const variations = this.generateNameVariations(cleanedLine);
                for (const variation of variations) {
                    if (this.isValidCardName(variation) && variation !== cleanedLine) {
                        possibleNames.push({
                            text: variation,
                            confidence: (line.confidence || 0) * 0.8, // Slightly lower confidence for variations
                            source: 'line_variation'
                        });
                    }
                }
            }
        }

        // Strategy 2: Combine high-confidence words intelligently
        if (words && words.length > 0) {
            const filteredWords = words
                .filter(word => word.confidence > 60 && word.text && word.text.length > 1)
                .filter(word => /[a-zA-ZäöüßÄÖÜ]/.test(word.text)) // Must contain at least one letter (including German)
                .map(word => ({
                    text: word.text.replace(/[^a-zA-ZäöüßÄÖÜ0-9\s\-']/g, '').trim(),
                    confidence: word.confidence
                }))
                .filter(word => word.text.length > 0);

            // Try combinations of 1-5 consecutive words
            for (let i = 0; i < filteredWords.length; i++) {
                for (let length = 1; length <= Math.min(5, filteredWords.length - i); length++) {
                    const wordSlice = filteredWords.slice(i, i + length);
                    const combination = wordSlice.map(w => w.text).join(' ');

                    if (this.isValidCardName(combination)) {
                        const avgConfidence = wordSlice.reduce((sum, word) => sum + word.confidence, 0) / length;

                        possibleNames.push({
                            text: combination,
                            confidence: avgConfidence,
                            source: 'word_combination'
                        });
                    }
                }
            }
        }

        // Strategy 3: Use cleaned full text and its variations
        const cleanedText = this.cleanOCRText(text);
        if (this.isValidCardName(cleanedText)) {
            possibleNames.push({
                text: cleanedText,
                confidence: ocrResult.confidence || 0,
                source: 'full_text'
            });
        }

        // Strategy 4: Extract potential names from specific regions/patterns
        const patternBasedNames = this.extractPatternBasedNames(text);
        possibleNames.push(...patternBasedNames);

        // Remove duplicates and apply enhanced scoring
        const uniqueNames = this.removeDuplicateNames(possibleNames);
        const scoredNames = this.enhanceCardNameScoring(uniqueNames, text);
        return scoredNames.sort((a, b) => b.finalScore - a.finalScore).slice(0, 8); // Limit to top 8 suggestions
    }

    isValidCardName(text) {
        if (!text || typeof text !== 'string') return false;

        const trimmed = text.trim();

        // Basic validation rules for MTG card names
        return (
            trimmed.length >= 2 &&           // At least 2 characters
            trimmed.length <= 50 &&          // Not too long
            /^[a-zA-ZäöüßÄÖÜ0-9\s\-',.:/()]+$/.test(trimmed) && // Valid characters including German umlauts
            !/^\d+$/.test(trimmed) &&       // Not just numbers
            !/^[^a-zA-ZäöüßÄÖÜ]+$/.test(trimmed)   // Contains at least one letter (including German)
        );
    }

    generateNameVariations(text) {
        if (!text || text.length < 2) return [];

        const variations = [];

        // Try with different apostrophes and punctuation
        if (text.includes("'")) {
            variations.push(text.replace(/'/g, ''));
        }
        if (text.includes('-')) {
            variations.push(text.replace(/-/g, ' '));
            variations.push(text.replace(/-/g, ''));
        }

        // Try with common spelling corrections
        const commonCorrections = {
            'Lightning Bolt': ['Lightning Bolt', 'Lightning 8olt', 'Lightning Bot'],
            'Serra Angel': ['Serra Angel', '5erra Angel', 'Serra Ange1'],
            'Black Lotus': ['Black Lotus', 'B1ack Lotus', 'Black Lotis'],
        };

        // Title case variation
        const titleCase = text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        if (titleCase !== text) {
            variations.push(titleCase);
        }

        return variations.filter(v => v && v.length > 0);
    }

    extractPatternBasedNames(text) {
        const possibleNames = [];

        if (!text) return possibleNames;

        // Look for lines that start with capital letters (likely card names)
        const lines = text.split('\n');
        for (const line of lines) {
            const cleaned = this.cleanOCRText(line);
            if (cleaned && /^[A-ZÄÖÜß]/.test(cleaned) && this.isValidCardName(cleaned)) {
                possibleNames.push({
                    text: cleaned,
                    confidence: 75,
                    source: 'capital_start_pattern'
                });
            }
        }

        // Look for common MTG name patterns (including German characters)
        const patterns = [
            /\b[A-ZÄÖÜß][a-zäöüß]+(?:\s+[A-ZÄÖÜß][a-zäöüß]+){0,4}\b/g, // Title case words with German characters
            /\b[A-ZÄÖÜß][a-zäöüß]+ (?:of|des|der|die|das) [A-ZÄÖÜß][a-zäöüß]+\b/g, // "Something of/des Something" pattern
            /\b[A-ZÄÖÜß][a-zäöüß]+ (?:the|der|die|das) [A-ZÄÖÜß][a-zäöüß]+\b/g,    // "Something the/der Something" pattern
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern) || [];
            for (const match of matches) {
                const cleaned = this.cleanOCRText(match);
                if (this.isValidCardName(cleaned)) {
                    possibleNames.push({
                        text: cleaned,
                        confidence: 70,
                        source: 'pattern_match'
                    });
                }
            }
        }

        return possibleNames;
    }

    removeDuplicateNames(names) {
        const seen = new Set();
        return names.filter(item => {
            const normalized = item.text.toLowerCase().replace(/\s+/g, ' ').trim();
            if (seen.has(normalized)) {
                return false;
            }
            seen.add(normalized);
            return true;
        });
    }

    enhanceCardNameScoring(names, fullText) {
        const fullTextLower = fullText.toLowerCase();
        const textLines = fullText.split('\n');

        return names.map(item => {
            let finalScore = item.confidence || 0;
            const textLower = item.text.toLowerCase();
            const textLength = item.text.trim().length;

            // Boost for likely card names based on length (MTG cards are typically 3-30 characters)
            if (textLength >= 3 && textLength <= 30) {
                finalScore += 20;
            }

            // Major boost for text that appears at the beginning of OCR result (likely card name position)
            const textPosition = fullTextLower.indexOf(textLower);
            if (textPosition >= 0 && textPosition <= 50) { // Within first 50 characters
                finalScore += 30;
            }

            // Major boost for text that appears on the first line (card name position)
            if (textLines.length > 0) {
                const firstLine = textLines[0].toLowerCase();
                if (firstLine.includes(textLower)) {
                    finalScore += 40;
                }
            }

            // Boost for multi-word names (more likely to be card names than single words)
            const wordCount = item.text.trim().split(/\s+/).length;
            if (wordCount >= 2 && wordCount <= 5) {
                finalScore += 15 + (wordCount * 5);
            }

            // Penalty for common auxiliary text patterns
            const auxiliaryPatterns = [
                /^by\s/i,           // "by [artist]"
                /^\d+$/,            // Just numbers (mana cost, etc.)
                /^(the|der|die|das)\s/i, // Articles only
                /^(von|by|nach|zu|bei)\s/i, // German/English prepositions
                /^(wenn|when|if)\s/i, // Conditional words (rules text)
                /\b(spiel|game|kommt|comes)\b/i // Game mechanics terms
            ];

            for (const pattern of auxiliaryPatterns) {
                if (pattern.test(item.text)) {
                    finalScore -= 25; // Significant penalty for auxiliary text
                }
            }

            // Penalty for very short text (likely not a complete card name)
            if (textLength < 3) {
                finalScore -= 20;
            }

            // Penalty for text that's mostly numbers or symbols
            const letterCount = (item.text.match(/[a-zA-ZäöüßÄÖÜ]/g) || []).length;
            const letterRatio = letterCount / textLength;
            if (letterRatio < 0.6) { // Less than 60% letters
                finalScore -= 15;
            }

            // Boost for text containing common German card name patterns
            const germanPatterns = [
                /\b(des|der|die|das)\b/i,  // German articles in card names
                /\b(von|zur|zum)\b/i,      // German prepositions in card names
                /\b(neue[mnrs]?|alte[mnrs]?)\b/i, // New/old variations
                /\b(leben[s]?|tod|macht|kraft)\b/i // Life/death/power/strength
            ];

            for (const pattern of germanPatterns) {
                if (pattern.test(item.text)) {
                    finalScore += 10; // Bonus for German card name patterns
                }
            }

            // Ensure final score doesn't go negative
            finalScore = Math.max(0, finalScore);

            return {
                ...item,
                finalScore: finalScore,
                originalConfidence: item.confidence
            };
        });
    }

    getGermanStatus(status) {
        const statusMap = {
            'initializing api': 'API wird initialisiert',
            'loading language': 'Sprache wird geladen',
            'recognizing text': 'Text wird erkannt',
            'done': 'Fertig'
        };
        return statusMap[status] || status;
    }

    async preprocessImageForOCR(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Enhanced preprocessing for better OCR results
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Convert to grayscale
            let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            // Apply contrast enhancement
            gray = this.enhanceContrast(gray, 1.3);

            // Apply sharpening
            gray = this.applySharpen(gray);

            // Threshold for black and white
            gray = gray > 128 ? 255 : 0;

            data[i] = gray;     // R
            data[i + 1] = gray; // G
            data[i + 2] = gray; // B
            // Alpha stays the same
        }

        context.putImageData(imageData, 0, 0);
        return canvas;
    }

    enhanceContrast(value, factor = 1.3) {
        const enhanced = (value - 128) * factor + 128;
        return Math.max(0, Math.min(255, Math.round(enhanced)));
    }

    applySharpen(value) {
        // Simple sharpening - in a real implementation you'd apply a convolution kernel
        return Math.max(0, Math.min(255, value));
    }

    getProcessingStatus() {
        return {
            isInitialized: this.isInitialized,
            isProcessing: this.isProcessing
        };
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
            this.isProcessing = false;

            if (this.onStatusUpdate) {
                this.onStatusUpdate('OCR beendet');
            }
        }
    }

    // Static method to check OCR support
    static isSupported() {
        return typeof Worker !== 'undefined' &&
               typeof createWorker === 'function';
    }
}

export default OCRService;
