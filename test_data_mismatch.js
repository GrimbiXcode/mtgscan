// Test script to reproduce the data mismatch issue
import ScryfallAPI from './src/scryfall.js';
import MTGDatabase from './src/database.js';

// Mock card data from Scryfall API (typical response structure)
const mockScryfallCard = {
    id: '12345678-1234-5678-9abc-123456789abc',
    name: 'Lightning Bolt',
    set: 'lea',
    set_name: 'Limited Edition Alpha',
    mana_cost: '{R}',
    type_line: 'Instant',
    collector_number: '161',
    rarity: 'common',
    colors: ['R'],
    cmc: 1,
    image_uris: {
        normal: 'https://example.com/image.jpg',
        large: 'https://example.com/image_large.jpg'
    },
    prices: {
        usd: '15.00',
        eur: '12.50'
    }
};

async function testDataMismatch() {
    console.log('=== Testing Data Structure Mismatch ===\n');

    const scryfallAPI = new ScryfallAPI();
    const database = new MTGDatabase();

    // Format card data using scryfall function
    const formattedCard = scryfallAPI.formatCardData(mockScryfallCard);
    console.log('Data from formatCardData():');
    console.log(JSON.stringify(formattedCard, null, 2));

    console.log('\n=== What addCard function expects ===');
    console.log('Based on database.js lines 46-58, addCard expects these properties:');
    console.log('- name: cardData.name');
    console.log('- set: cardData.set_name (NOT cardData.set)');
    console.log('- setCode: cardData.set');
    console.log('- scryfallId: cardData.id (NOT cardData.scryfallId)');
    console.log('- imageUrl: cardData.image_uris?.normal (NOT cardData.imageUrl)');
    console.log('- manaCost: cardData.mana_cost (NOT cardData.manaCost)');
    console.log('- typeLine: cardData.type_line (NOT cardData.typeLine)');
    console.log('- quantity: cardData.quantity || 1');
    console.log('- collectorNumber: cardData.collector_number');
    console.log('- rarity: cardData.rarity');
    console.log('- colors: cardData.colors');
    console.log('- cmc: cardData.cmc');

    console.log('\n=== Problems with current formatCardData output ===');
    console.log('1. Returns "set" instead of "set_name"');
    console.log('2. Returns "scryfallId" instead of "id"');
    console.log('3. Returns "imageUrl" instead of "image_uris" object');
    console.log('4. Returns "manaCost" instead of "mana_cost"');
    console.log('5. Returns "typeLine" instead of "type_line"');

    // Try to use the formatted data with addCard (this would fail)
    try {
        console.log('\n=== Attempting to add card to database ===');
        await database.init();
        const result = await database.addCard(formattedCard);
        console.log('Card added successfully (but with wrong data structure):', result);

        // Check what actually got stored
        const storedCard = await database.getAllCards();
        console.log('\nWhat actually got stored in the database:');
        console.log(JSON.stringify(storedCard[storedCard.length - 1], null, 2));

    } catch (error) {
        console.error('Error adding card:', error);
    }
}

testDataMismatch().catch(console.error);
