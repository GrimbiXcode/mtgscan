// Scryfall API integration for MTG card identification
class ScryfallAPI {
    constructor() {
        this.baseUrl = 'https://api.scryfall.com';
        this.cardSearchEndpoint = '/cards/search';
        this.namedCardEndpoint = '/cards/named';
        this.autocompleteEndpoint = '/cards/autocomplete';
    }

    async searchCardByName(cardName, fuzzy = true) {
        try {
            const endpoint = fuzzy ?
                `${this.baseUrl}${this.namedCardEndpoint}?fuzzy=${encodeURIComponent(cardName)}` :
                `${this.baseUrl}${this.namedCardEndpoint}?exact=${encodeURIComponent(cardName)}`;

            const response = await fetch(endpoint);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Karte "${cardName}" nicht gefunden`);
                }
                throw new Error(`Scryfall API Fehler: ${response.status}`);
            }

            const cardData = await response.json();
            return this.formatCardData(cardData);
        } catch (error) {
            console.error('Fehler beim Suchen der Karte:', error);
            throw error;
        }
    }

    // Enhanced search that tries multiple strategies for OCR results
    async searchCardFromOCRSuggestions(suggestions) {
        if (!suggestions || suggestions.length === 0) {
            throw new Error('Keine OCR-Vorschläge verfügbar');
        }

        // Sort suggestions by confidence
        const sortedSuggestions = suggestions.sort((a, b) => b.confidence - a.confidence);

        // Try each suggestion in order of confidence
        for (const suggestion of sortedSuggestions) {
            try {
                // First try exact match
                const exactResult = await this.searchCardByName(suggestion.text, false);
                if (exactResult) {
                    return {
                        card: exactResult,
                        matchedSuggestion: suggestion,
                        matchType: 'exact'
                    };
                }
            } catch (error) {
                // Exact match failed, try fuzzy
                try {
                    const fuzzyResult = await this.searchCardByName(suggestion.text, true);
                    if (fuzzyResult) {
                        return {
                            card: fuzzyResult,
                            matchedSuggestion: suggestion,
                            matchType: 'fuzzy'
                        };
                    }
                } catch (fuzzyError) {
                    // Continue to next suggestion
                    continue;
                }
            }
        }

        // If no direct matches, try search queries
        for (const suggestion of sortedSuggestions.slice(0, 3)) { // Limit to top 3
            try {
                const searchResult = await this.searchByQuery(suggestion.text);
                if (searchResult && searchResult.data && searchResult.data.length > 0) {
                    return {
                        card: this.formatCardData(searchResult.data[0]),
                        matchedSuggestion: suggestion,
                        matchType: 'search'
                    };
                }
            } catch (error) {
                continue;
            }
        }

        throw new Error('Keine passende Karte für die OCR-Vorschläge gefunden');
    }

    async searchCards(query, page = 1) {
        try {
            const url = `${this.baseUrl}${this.cardSearchEndpoint}?q=${encodeURIComponent(query)}&page=${page}&unique=cards`;
            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 404) {
                    return { data: [], has_more: false, total_cards: 0 };
                }
                throw new Error(`Scryfall API Fehler: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Fehler bei der Kartensuche:', error);
            throw error;
        }
    }

    // More flexible search method for OCR text
    async searchByQuery(text) {
        try {
            // Try as card name first
            let query = `name:"${text}"`;
            let result = await this.searchCards(query);
            if (result.data && result.data.length > 0) {
                return result;
            }

            // Try partial name match
            query = `name:${text}`;
            result = await this.searchCards(query);
            if (result.data && result.data.length > 0) {
                return result;
            }

            // Try just the text as general search
            result = await this.searchCards(text);
            return result;

        } catch (error) {
            console.error('Fehler bei flexibler Kartensuche:', error);
            throw error;
        }
    }

    async getAutocomplete(query) {
        try {
            const url = `${this.baseUrl}${this.autocompleteEndpoint}?q=${encodeURIComponent(query)}`;
            const response = await fetch(url);

            if (!response.ok) {
                return [];
            }

            const result = await response.json();
            return result.data || [];
        } catch (error) {
            console.error('Fehler bei Autocomplete:', error);
            return [];
        }
    }

    // Extract text from image using OCR and try to identify the card
    async identifyCardFromText(extractedText) {
        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('Kein Text aus dem Bild erkannt');
        }

        // Clean and process the extracted text
        const cleanText = this.cleanOCRText(extractedText);
        const possibleCardNames = this.extractPossibleCardNames(cleanText);

        // Try to find the card using different strategies
        for (const cardName of possibleCardNames) {
            try {
                const card = await this.searchCardByName(cardName, true);
                if (card) {
                    return card;
                }
            } catch (error) {
                // Continue trying other names
                continue;
            }
        }

        throw new Error('Keine passende Karte für den erkannten Text gefunden');
    }

    cleanOCRText(text) {
        return text
            .replace(/[^\w\s\-'/,.:]/g, ' ') // Remove special characters except common card name chars
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim()
            .toLowerCase();
    }

    extractPossibleCardNames(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const names = [];

        // Strategy 1: Use each line as potential card name
        for (const line of lines) {
            if (line.length >= 3 && line.length <= 50) { // Reasonable card name length
                names.push(line);
            }
        }

        // Strategy 2: Try combinations of words
        const words = text.split(/\s+/).filter(word => word.length >= 2);
        for (let i = 0; i < words.length - 1; i++) {
            for (let j = i + 1; j <= Math.min(i + 4, words.length); j++) { // Try combinations of up to 4 words
                const combination = words.slice(i, j).join(' ');
                if (combination.length >= 3) {
                    names.push(combination);
                }
            }
        }

        // Strategy 3: Remove common OCR errors and try again
        const correctedText = this.correctCommonOCRErrors(text);
        if (correctedText !== text) {
            names.push(correctedText);
        }

        // Return unique names, sorted by length (longer names first, more specific)
        return [...new Set(names)].sort((a, b) => b.length - a.length);
    }

    correctCommonOCRErrors(text) {
        const corrections = {
            '0': 'o',
            '1': 'i',
            '8': 'b',
            '5': 's',
            'rn': 'm',
            'ii': 'll',
            'vv': 'w'
        };

        let corrected = text;
        for (const [wrong, right] of Object.entries(corrections)) {
            corrected = corrected.replace(new RegExp(wrong, 'gi'), right);
        }

        return corrected;
    }

    // Helper method to get card image URL
    getCardImageUrl(card, size = 'normal') {
        if (card.image_uris && card.image_uris[size]) {
            return card.image_uris[size];
        }

        // For double-faced cards, get the front face image
        if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
            return card.card_faces[0].image_uris[size] || card.card_faces[0].image_uris.normal;
        }

        return null;
    }

    // Format card data for consistent usage with database
    formatCardData(card) {
        return {
            name: card.name,
            set_name: card.set_name || card.set,
            set: card.set,
            id: card.id,
            image_uris: card.image_uris || {
                normal: this.getCardImageUrl(card),
                large: this.getCardImageUrl(card, 'large')
            },
            mana_cost: card.mana_cost || '',
            type_line: card.type_line,
            quantity: 1, // Default quantity for new cards
            collector_number: card.collector_number,
            rarity: card.rarity,
            colors: card.colors || [],
            cmc: card.cmc || 0
        };
    }
}

export default ScryfallAPI;
