// IndexedDB wrapper for storing MTG cards
class MTGDatabase {
    constructor() {
        this.dbName = 'MTGScannerDB';
        this.dbVersion = 2; // Incremented to trigger schema update
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create cards object store
                if (!db.objectStoreNames.contains('cards')) {
                    const cardStore = db.createObjectStore('cards', {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Create indexes for searching
                    cardStore.createIndex('name', 'name', { unique: false });
                    cardStore.createIndex('set', 'set', { unique: false });
                    cardStore.createIndex('scryfallId', 'scryfallId', { unique: false });
                }
            };
        });
    }

    async addCard(cardData) {
        if (!this.db) await this.init();

        // Download image if available
        const imageUrl = cardData.image_uris?.normal || cardData.image_uris?.large;
        let imageData = null;

        if (imageUrl) {
            try {
                imageData = await this.downloadImage(imageUrl);
                console.log('Image downloaded successfully for card:', cardData.name);
            } catch (error) {
                console.warn('Failed to download image for card:', cardData.name, error);
            }
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');

            const card = {
                name: cardData.name,
                set: cardData.set_name,
                setCode: cardData.set,
                scryfallId: cardData.id,
                imageUrl: imageUrl,
                imageData: imageData, // Store downloaded image as blob
                manaCost: cardData.mana_cost,
                typeLine: cardData.type_line,
                quantity: cardData.quantity || 1,
                dateAdded: new Date().toISOString(),
                collectorNumber: cardData.collector_number,
                rarity: cardData.rarity,
                colors: cardData.colors,
                cmc: cardData.cmc
            };

            const request = store.add(card);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllCards() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readonly');
            const store = transaction.objectStore('cards');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateCard(id, updates) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');

            // First get the existing card
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const card = getRequest.result;
                if (card) {
                    // Update the card with new values
                    Object.assign(card, updates);

                    const putRequest = store.put(card);
                    putRequest.onsuccess = () => resolve(card);
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('Card not found'));
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async deleteCard(id) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllCards() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readwrite');
            const store = transaction.objectStore('cards');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getCardCount() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readonly');
            const store = transaction.objectStore('cards');
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async findCardByName(name) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cards'], 'readonly');
            const store = transaction.objectStore('cards');
            const index = store.index('name');
            const request = index.get(name);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Download image from URL and convert to blob for storage
    async downloadImage(imageUrl) {
        try {
            if (!imageUrl || imageUrl.startsWith('assets/')) {
                return null; // Skip local assets
            }

            console.log('Downloading image:', imageUrl);
            const response = await fetch(imageUrl, { mode: 'cors' });

            if (!response.ok) {
                console.warn('Failed to download image:', response.status);
                return null;
            }

            const blob = await response.blob();
            return blob;
        } catch (error) {
            console.warn('Error downloading image:', error);
            // Try with no-cors mode as fallback
            try {
                const response = await fetch(imageUrl, { mode: 'no-cors' });
                const blob = await response.blob();
                return blob;
            } catch (noCorsError) {
                console.error('Failed to download image even with no-cors:', noCorsError);
                return null;
            }
        }
    }
}

export default MTGDatabase;
