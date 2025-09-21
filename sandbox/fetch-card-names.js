#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

/**
 * Auto-fetch card names from Scryfall API and update card-mapping.js
 * Analyzes filenames in test-images-ocr directory and fetches correct names
 */

function parseCardCode(filename) {
    const nameWithoutExt = path.parse(filename).name;
    
    console.log(`  Parsing filename: "${nameWithoutExt}"`);
    
    // Parse pattern like "C 0100 FDN DE"
    const match = nameWithoutExt.match(/^([CRMUL])\s+(\d+)\s+([A-Z]{3,4})\s+([A-Z]{2})$/);
    
    if (match) {
        const [, rarity, number, setCode, language] = match;
        console.log(`  Match found: rarity=${rarity}, number=${number}, setCode=${setCode}, language=${language}`);
        return {
            rarity,
            collectorNumber: number.padStart(3, '0'), // Ensure 3-digit format
            setCode: setCode.toLowerCase(),
            language: language.toLowerCase(),
            originalCode: nameWithoutExt
        };
    }
    
    console.log(`  No match found for pattern`);
    return null;
}

async function fetchCardFromScryfall(setCode, collectorNumber) {
    try {
        console.log(`Fetching ${setCode}/${collectorNumber}...`);
        
        // Using node-fetch equivalent with built-in fetch (Node 18+) or fallback
        const fetch = globalThis.fetch || require('node-fetch');
        
        const url = `https://api.scryfall.com/cards/${setCode}/${collectorNumber}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`  ❌ Card not found: ${setCode}/${collectorNumber}`);
                return null;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const card = await response.json();
        console.log(`  ✅ Found: ${card.name}`);
        
        return {
            name: card.name,
            setName: card.set_name,
            rarity: card.rarity,
            language: card.lang || 'en'
        };
        
    } catch (error) {
        console.error(`  ❌ Error fetching ${setCode}/${collectorNumber}:`, error.message);
        return null;
    }
}

async function generateCardMappings() {
    console.log('🔍 Analyzing test images and fetching card names...\n');
    
    try {
        const testDir = './test-images-ocr';
        const files = await fs.readdir(testDir);
        const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));
        
        if (imageFiles.length === 0) {
            throw new Error(`No image files found in ${testDir}`);
        }
        
        console.log(`Found ${imageFiles.length} test images:`);
        imageFiles.forEach(file => console.log(`  - ${file}`));
        console.log('');
        
        const mappings = {};
        let successCount = 0;
        
        for (const imageFile of imageFiles) {
            console.log(`📷 Processing: ${imageFile}`);
            
            const cardInfo = parseCardCode(imageFile);
            if (!cardInfo) {
                console.log(`  ⚠️  Could not parse card code format`);
                continue;
            }
            
            console.log(`  Parsed: ${cardInfo.setCode}/${cardInfo.collectorNumber} (${cardInfo.rarity}, ${cardInfo.language})`);
            
            const cardData = await fetchCardFromScryfall(cardInfo.setCode, cardInfo.collectorNumber);
            
            if (cardData) {
                mappings[cardInfo.originalCode] = cardData.name;
                successCount++;
            } else {
                // Add placeholder for manual update
                mappings[cardInfo.originalCode] = `UNKNOWN_CARD_${cardInfo.setCode}_${cardInfo.collectorNumber}`;
            }
            
            // Rate limiting - be nice to Scryfall API
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log('');
        }
        
        console.log(`📝 Updating card-mapping.js...`);
        await updateCardMappingFile(mappings);
        
        console.log(`\n🎉 Complete! Successfully mapped ${successCount}/${imageFiles.length} cards.`);
        
        if (successCount < imageFiles.length) {
            console.log(`\n⚠️  ${imageFiles.length - successCount} cards need manual mapping:`);
            Object.entries(mappings).forEach(([code, name]) => {
                if (name.startsWith('UNKNOWN_CARD_')) {
                    console.log(`  - ${code}: ${name}`);
                }
            });
            console.log(`\nPlease update these manually in card-mapping.js`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

async function updateCardMappingFile(newMappings) {
    const mappingPath = './card-mapping.js';
    
    try {
        // Read current file
        const currentContent = await fs.readFile(mappingPath, 'utf8');
        
        // Generate new mappings object
        const mappingsCode = Object.entries(newMappings)
            .map(([code, name]) => `    '${code}': '${name}',`)
            .join('\n');
        
        // Replace the cardMappings object
        const updatedContent = currentContent.replace(
            /const cardMappings = {[^}]*};/s,
            `const cardMappings = {\n${mappingsCode}\n};`
        );
        
        await fs.writeFile(mappingPath, updatedContent, 'utf8');
        console.log(`  ✅ Updated ${mappingPath}`);
        
    } catch (error) {
        console.error(`  ❌ Error updating mapping file:`, error.message);
        throw error;
    }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
MTG Card Name Fetcher

Usage: node fetch-card-names.js

This script:
1. Analyzes image filenames in test-images-ocr directory
2. Parses card codes (e.g., "C 0100 FDN DE")  
3. Fetches actual card names from Scryfall API
4. Updates card-mapping.js with the correct mappings

Requirements:
- Image files should be named with format: [RARITY] [NUMBER] [SET] [LANG]
- Example: "C 0100 FDN DE.png" = Common card #100 from Foundation set in German

This ensures accurate OCR testing by comparing against real card names.
`);
    process.exit(0);
}

// Run the script
generateCardMappings();
