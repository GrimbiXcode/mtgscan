/**
 * Card Code to Name Mapping for OCR Testing
 *
 * This file maps card codes from filenames to actual card names.
 * Update this with the correct mappings for your test images.
 */

const cardMappings = {
    // Foundation German cards - Update with actual names from your images
    'C 0100 FDN DE': 'Tierlieber Waldläufer',
    'C 0214 FDN DE': 'Gebrochene Flügel',
    'U 0125 FDN DE': 'Wächter des Kreislaufs',

    // Add more mappings as you add more test images
    // Check the actual text visible in your images and update these entries
};

/**
 * Get card name from filename or code
 */
function getCardName(filename) {
    const nameWithoutExt = filename.replace(/\.(png|jpg|jpeg)$/i, '');

    if (cardMappings[nameWithoutExt]) {
        return cardMappings[nameWithoutExt];
    }

    // If no mapping found, try to extract from Scryfall API
    console.warn(`⚠️  No mapping found for: ${nameWithoutExt}`);
    console.warn(`   Add mapping to card-mapping.js or rename file to include actual card name`);

    // Return cleaned filename as fallback
    return nameWithoutExt.replace(/[^a-zA-ZäöüÄÖÜß\s\-',.]/g, ' ').trim();
}

/**
 * Fetch card name from Scryfall API using card code
 * This is a helper function - you'd need to implement API calls
 */
async function fetchCardNameFromAPI(setCode, collectorNumber) {
    try {
        const response = await fetch(
            `https://api.scryfall.com/cards/${setCode.toLowerCase()}/${collectorNumber}`
        );

        if (response.ok) {
            const card = await response.json();
            return card.name;
        }
    } catch (error) {
        console.error('API fetch failed:', error.message);
    }

    return null;
}

module.exports = {
    cardMappings,
    getCardName,
    fetchCardNameFromAPI
};
