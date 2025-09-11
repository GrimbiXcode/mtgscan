// CSV export functionality for Moxfield import
class CSVExporter {
    constructor() {
        // Moxfield CSV format headers
        this.headers = [
            'Count',
            'Name',
            'Edition',
            'Condition',
            'Language',
            'Foil',
            'Collector Number',
            'Alter',
            'Proxy',
            'Purchase Price'
        ];
    }

    exportToMoxfield(cards) {
        if (!cards || cards.length === 0) {
            throw new Error('Keine Karten zum Exportieren vorhanden');
        }

        // Convert cards to Moxfield format
        const csvData = this.convertCardsToCSV(cards);
        
        // Create and download CSV file
        this.downloadCSV(csvData, 'mtgscan-export.csv');
        
        return csvData;
    }

    convertCardsToCSV(cards) {
        // Start with headers
        let csvContent = this.headers.join(',') + '\n';
        
        // Add each card as a row
        for (const card of cards) {
            const row = this.formatCardRow(card);
            csvContent += row + '\n';
        }
        
        return csvContent;
    }

    formatCardRow(card) {
        // Format each field according to Moxfield requirements
        const row = [
            card.quantity || 1,                    // Count
            this.escapeCSVField(card.name || ''), // Name
            this.escapeCSVField(card.set || ''),  // Edition (set code)
            'Near Mint',                          // Condition (default)
            'English',                            // Language (default)
            '',                                   // Foil (empty for regular)
            card.collectorNumber || '',           // Collector Number
            '',                                   // Alter (empty)
            '',                                   // Proxy (empty)
            ''                                    // Purchase Price (empty)
        ];
        
        return row.join(',');
    }

    escapeCSVField(field) {
        if (typeof field !== 'string') {
            field = String(field);
        }
        
        // Handle fields that contain commas, quotes, or newlines
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            // Escape quotes by doubling them and wrap the entire field in quotes
            return '"' + field.replace(/"/g, '""') + '"';
        }
        
        return field;
    }

    downloadCSV(csvContent, filename) {
        try {
            // Create blob with CSV content
            const blob = new Blob([csvContent], { 
                type: 'text/csv;charset=utf-8;' 
            });
            
            // Create download link
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                // Use HTML5 download attribute
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Clean up
                setTimeout(() => URL.revokeObjectURL(url), 100);
            } else {
                // Fallback for older browsers
                const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
                window.open(url);
            }
        } catch (error) {
            console.error('Fehler beim Download der CSV-Datei:', error);
            throw new Error('CSV-Download fehlgeschlagen');
        }
    }

    // Alternative export formats
    exportToDeckbox(cards) {
        // Deckbox format: Count,Name,Set,Card Number,Condition,Language,Foil,Price
        const headers = ['Count', 'Name', 'Set', 'Card Number', 'Condition', 'Language', 'Foil', 'Price'];
        let csvContent = headers.join(',') + '\n';
        
        for (const card of cards) {
            const row = [
                card.quantity || 1,
                this.escapeCSVField(card.name || ''),
                this.escapeCSVField(card.set || ''),
                card.collectorNumber || '',
                'Near Mint',
                'English',
                '',
                ''
            ];
            csvContent += row.join(',') + '\n';
        }
        
        this.downloadCSV(csvContent, 'mtgscan-deckbox.csv');
        return csvContent;
    }

    exportToMTGArena(cards) {
        // MTG Arena format: quantity name (set) collector_number
        let arenaContent = '';
        
        for (const card of cards) {
            const quantity = card.quantity || 1;
            const name = card.name || '';
            const set = card.setCode || card.set || '';
            const number = card.collectorNumber || '';
            
            arenaContent += `${quantity} ${name}`;
            if (set) arenaContent += ` (${set.toUpperCase()})`;
            if (number) arenaContent += ` ${number}`;
            arenaContent += '\n';
        }
        
        const blob = new Blob([arenaContent], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', 'mtgscan-arena.txt');
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        return arenaContent;
    }

    // Generate summary statistics
    generateSummary(cards) {
        if (!cards || cards.length === 0) {
            return {
                totalCards: 0,
                totalQuantity: 0,
                uniqueCards: 0,
                sets: [],
                colors: {},
                rarities: {},
                types: {}
            };
        }

        const summary = {
            totalCards: cards.length,
            totalQuantity: 0,
            uniqueCards: cards.length,
            sets: new Set(),
            colors: {},
            rarities: {},
            types: {}
        };

        for (const card of cards) {
            // Count quantities
            const quantity = card.quantity || 1;
            summary.totalQuantity += quantity;
            
            // Track sets
            if (card.set) {
                summary.sets.add(card.set);
            }
            
            // Track colors
            if (card.colors && Array.isArray(card.colors)) {
                for (const color of card.colors) {
                    summary.colors[color] = (summary.colors[color] || 0) + quantity;
                }
            }
            
            // Track rarities
            if (card.rarity) {
                summary.rarities[card.rarity] = (summary.rarities[card.rarity] || 0) + quantity;
            }
            
            // Track types (simplified - just get the first type)
            if (card.typeLine) {
                const firstType = card.typeLine.split(' ')[0];
                summary.types[firstType] = (summary.types[firstType] || 0) + quantity;
            }
        }

        // Convert sets to array
        summary.sets = Array.from(summary.sets);
        
        return summary;
    }

    // Validate card data before export
    validateCards(cards) {
        if (!Array.isArray(cards)) {
            throw new Error('Kartendaten müssen ein Array sein');
        }

        const errors = [];
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            
            if (!card.name) {
                errors.push(`Karte ${i + 1}: Name fehlt`);
            }
            
            if (card.quantity && (isNaN(card.quantity) || card.quantity < 1)) {
                errors.push(`Karte ${i + 1}: Ungültige Anzahl`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error('Validierungsfehler:\n' + errors.join('\n'));
        }
        
        return true;
    }
}

export default CSVExporter;
