// Enhanced Camera functionality for capturing MTG card images with optimized name region extraction
class CameraManager {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.stream = null;
        this.isActive = false;
        
        // Image processing settings
        this.processingConfig = {
            blurKernel: 3,          // Gaussian blur kernel size
            contrastFactor: 1.2,    // Contrast enhancement factor
            brightnessAdjust: 10,   // Brightness adjustment
            sharpnessFactor: 1.3,   // Sharpness enhancement factor
            targetWidth: 800,       // Target width for processing
            normalizeHistogram: true // Whether to apply histogram normalization
        };
    }

    async init(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;

        // Set initial canvas sizes
        this.canvas.width = 640;
        this.canvas.height = 480;
        
        console.log('Enhanced Camera Manager initialized with optimized region extraction');
    }

    async startCamera() {
        try {
            // Request camera access with optimal settings for card scanning
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera on mobile
                    width: { ideal: 1920, min: 1280 },
                    height: { ideal: 1920, min: 1280 },
                    focusMode: 'continuous',
                    exposureMode: 'continuous',
                    whiteBalanceMode: 'continuous'
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.isActive = true;

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    // Update canvas sizes to match actual video dimensions
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    
                    console.log(`Camera started: ${this.video.videoWidth}x${this.video.videoHeight}`);
                    resolve();
                };
            });
        } catch (error) {
            console.error('Fehler beim Starten der Kamera:', error);
            throw new Error('Kamera konnte nicht gestartet werden. Bitte überprüfen Sie die Berechtigung.');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.srcObject = null;
        }

        this.isActive = false;
        console.log('Camera stopped');
    }

    // ====================
    // Image Processing Methods
    // ====================

    // ====================
    // Image Processing Algorithms
    // ====================

    gaussianBlur(data, width, height, kernelSize) {
        // Ensure kernelSize is odd and at least 3
        const size = Math.max(3, kernelSize % 2 === 0 ? kernelSize + 1 : kernelSize);
        const sigma = size / 3;
        const radius = Math.floor(size / 2);
        const kernel = this.generateGaussianKernel(size, sigma);
        const result = new Uint8Array(data.length);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let weightSum = 0;
                
                for (let ky = -radius; ky <= radius; ky++) {
                    for (let kx = -radius; kx <= radius; kx++) {
                        const ny = y + ky;
                        const nx = x + kx;
                        
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const kernelY = ky + radius;
                            const kernelX = kx + radius;
                            
                            // Safety check for kernel bounds
                            if (kernelY >= 0 && kernelY < kernel.length && 
                                kernelX >= 0 && kernelX < kernel[kernelY].length) {
                                const weight = kernel[kernelY][kernelX];
                                sum += data[ny * width + nx] * weight;
                                weightSum += weight;
                            }
                        }
                    }
                }
                
                // Avoid division by zero
                result[y * width + x] = weightSum > 0 ? Math.round(sum / weightSum) : data[y * width + x];
            }
        }
        
        return result;
    }

    // Simple blur fallback if Gaussian blur fails
    simpleBlur(data, width, height) {
        const result = new Uint8Array(data.length);
        
        // Simple 3x3 average blur
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                
                // 3x3 kernel average
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += data[(y + ky) * width + (x + kx)];
                    }
                }
                
                result[y * width + x] = Math.round(sum / 9);
            }
        }
        
        // Copy edges from original
        for (let x = 0; x < width; x++) {
            result[x] = data[x]; // Top edge
            result[(height - 1) * width + x] = data[(height - 1) * width + x]; // Bottom edge
        }
        for (let y = 0; y < height; y++) {
            result[y * width] = data[y * width]; // Left edge
            result[y * width + (width - 1)] = data[y * width + (width - 1)]; // Right edge
        }
        
        return result;
    }

    generateGaussianKernel(size, sigma) {
        const radius = Math.floor(size / 2);
        const kernel = [];
        let sum = 0;
        
        for (let y = -radius; y <= radius; y++) {
            const row = [];
            for (let x = -radius; x <= radius; x++) {
                const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
                row.push(value);
                sum += value;
            }
            kernel.push(row);
        }
        
        // Normalize kernel
        for (let y = 0; y < kernel.length; y++) {
            for (let x = 0; x < kernel[y].length; x++) {
                kernel[y][x] /= sum;
            }
        }
        
        return kernel;
    }

    // ====================
    // Image Enhancement Functions
    // ====================

    getBoundingRect(points) {
        if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
        
        let minX = points[0].x;
        let maxX = points[0].x;
        let minY = points[0].y;
        let maxY = points[0].y;
        
        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }
        
        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    // ====================
    // Card Region Extraction
    // ====================

    simpleCropCard(sourceCanvas, bounds) {
        // Fallback method for simple rectangular crop
        const cropCanvas = document.createElement('canvas');
        const aspectRatio = 63 / 88; // Standard MTG card aspect ratio
        
        // Maintain aspect ratio
        let cropWidth = bounds.width;
        let cropHeight = bounds.height;
        
        if (cropWidth / cropHeight > aspectRatio) {
            cropWidth = cropHeight * aspectRatio;
        } else {
            cropHeight = cropWidth / aspectRatio;
        }
        
        // Center the crop
        const cropX = bounds.x + (bounds.width - cropWidth) / 2;
        const cropY = bounds.y + (bounds.height - cropHeight) / 2;
        
        // Set output size (maintain reasonable resolution)
        const outputWidth = Math.min(488, cropWidth);
        const outputHeight = Math.min(680, cropHeight);
        
        cropCanvas.width = outputWidth;
        cropCanvas.height = outputHeight;
        
        const ctx = cropCanvas.getContext('2d');
        ctx.drawImage(
            sourceCanvas,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, outputWidth, outputHeight
        );
        
        return cropCanvas;
    }
    
    bilinearInterpolate(imageData, x, y, width, height) {
        const x1 = Math.floor(x);
        const y1 = Math.floor(y);
        const x2 = Math.min(x1 + 1, width - 1);
        const y2 = Math.min(y1 + 1, height - 1);
        
        const fx = x - x1;
        const fy = y - y1;
        
        // Get pixel values at the four corners
        const getPixel = (px, py) => {
            const idx = (py * width + px) * 4;
            return {
                r: imageData.data[idx],
                g: imageData.data[idx + 1],
                b: imageData.data[idx + 2],
                a: imageData.data[idx + 3]
            };
        };
        
        const p11 = getPixel(x1, y1);
        const p21 = getPixel(x2, y1);
        const p12 = getPixel(x1, y2);
        const p22 = getPixel(x2, y2);
        
        // Bilinear interpolation
        return {
            r: Math.round(p11.r * (1 - fx) * (1 - fy) + p21.r * fx * (1 - fy) + p12.r * (1 - fx) * fy + p22.r * fx * fy),
            g: Math.round(p11.g * (1 - fx) * (1 - fy) + p21.g * fx * (1 - fy) + p12.g * (1 - fx) * fy + p22.g * fx * fy),
            b: Math.round(p11.b * (1 - fx) * (1 - fy) + p21.b * fx * (1 - fy) + p12.b * (1 - fx) * fy + p22.b * fx * fy),
            a: Math.round(p11.a * (1 - fx) * (1 - fy) + p21.a * fx * (1 - fy) + p12.a * (1 - fx) * fy + p22.a * fx * fy)
        };
    }

    captureImage() {
        if (!this.isActive || !this.video || !this.canvas) {
            throw new Error('Kamera ist nicht aktiv');
        }

        const context = this.canvas.getContext('2d');
        
        // Draw the current video frame to canvas
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        
        // Apply enhanced preprocessing for better OCR results
        const processedCanvas = this.applyEnhancedPreprocessingPipeline(this.canvas);

        // Convert to blob for further processing
        return new Promise((resolve) => {
            processedCanvas.toBlob((blob) => {
                resolve({
                    blob: blob,
                    dataUrl: processedCanvas.toDataURL('image/jpeg', 0.9),
                    canvas: processedCanvas,
                    originalCanvas: this.canvas,
                    extractionMethod: 'enhanced_preprocessing'
                });
            }, 'image/jpeg', 0.9);
        });
    }

    // ====================
    // Enhanced Preprocessing Pipeline
    // ====================

    applyEnhancedPreprocessingPipeline(canvas, captureSteps = false) {
        console.log('Applying enhanced preprocessing pipeline');
        
        const processingSteps = [];
        
        // Create working canvas for processing steps
        const workingCanvas = document.createElement('canvas');
        workingCanvas.width = canvas.width;
        workingCanvas.height = canvas.height;
        const ctx = workingCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        if (captureSteps) {
            // Capture initial state
            const initialCanvas = document.createElement('canvas');
            initialCanvas.width = workingCanvas.width;
            initialCanvas.height = workingCanvas.height;
            const initialCtx = initialCanvas.getContext('2d');
            initialCtx.drawImage(workingCanvas, 0, 0);
            processingSteps.push({
                name: 'Initial Canvas',
                canvas: initialCanvas,
                description: `Original captured image (${initialCanvas.width}x${initialCanvas.height})`
            });
        }
        
        // Step 1: Optimize size for processing
        const sizedCanvas = this.optimizeCanvasSize(workingCanvas);
        
        if (captureSteps) {
            const sizedCopy = document.createElement('canvas');
            sizedCopy.width = sizedCanvas.width;
            sizedCopy.height = sizedCanvas.height;
            const sizedCtx = sizedCopy.getContext('2d');
            sizedCtx.drawImage(sizedCanvas, 0, 0);
            processingSteps.push({
                name: 'Size Optimization',
                canvas: sizedCopy,
                description: `Resized for optimal OCR processing (${sizedCopy.width}x${sizedCopy.height})`
            });
        }
        
        // Step 2: Apply content-based analysis and enhancement
        const analysis = this.analyzeImageContent(sizedCanvas);
        
        if (captureSteps) {
            // Store analysis results for debug display
            this.lastImageAnalysis = analysis;
        }
        
        // Step 3: Apply specific processing based on analysis
        this.applyContentBasedEnhancement(sizedCanvas, analysis);
        
        if (captureSteps) {
            const enhancedCopy = document.createElement('canvas');
            enhancedCopy.width = sizedCanvas.width;
            enhancedCopy.height = sizedCanvas.height;
            const enhancedCtx = enhancedCopy.getContext('2d');
            enhancedCtx.drawImage(sizedCanvas, 0, 0);
            processingSteps.push({
                name: 'Content Enhancement',
                canvas: enhancedCopy,
                description: `Grayscale conversion and adaptive enhancement based on brightness: ${analysis.brightness.toFixed(1)}`
            });
        }
        
        // Step 4: Apply sharpening for text
        this.applyTextSharpening(sizedCanvas);
        
        if (captureSteps) {
            const sharpenedCopy = document.createElement('canvas');
            sharpenedCopy.width = sizedCanvas.width;
            sharpenedCopy.height = sizedCanvas.height;
            const sharpenedCtx = sharpenedCopy.getContext('2d');
            sharpenedCtx.drawImage(sizedCanvas, 0, 0);
            processingSteps.push({
                name: 'Text Sharpening',
                canvas: sharpenedCopy,
                description: 'Unsharp mask applied to enhance text readability'
            });
            
            // Store processing steps for debug mode
            this.lastProcessingSteps = processingSteps;
        }
        
        console.log('Enhanced preprocessing completed with adaptive processing');
        return sizedCanvas;
    }

    applySimpleProcessing(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Simple grayscale conversion and basic contrast enhancement
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Convert to grayscale
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            
            // Basic contrast enhancement
            const enhanced = Math.max(0, Math.min(255, (gray - 128) * this.processingConfig.contrastFactor + 128));
            
            data[i] = enhanced;
            data[i + 1] = enhanced;
            data[i + 2] = enhanced;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    optimizeCanvasSize(canvas) {
        // Target optimal size for OCR (balance between quality and processing speed)
        const targetWidth = this.processingConfig.targetWidth;
        const targetHeight = Math.round(canvas.height * (targetWidth / canvas.width));
        
        if (canvas.width <= targetWidth * 1.2 && canvas.width >= targetWidth * 0.8) {
            return canvas; // Size is already optimal
        }
        
        const optimizedCanvas = document.createElement('canvas');
        optimizedCanvas.width = targetWidth;
        optimizedCanvas.height = targetHeight;
        
        const ctx = optimizedCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
        
        return optimizedCanvas;
    }

    analyzeImageContent(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let brightness = 0;
        let contrast = 0;
        let colorfulness = 0;
        let edgeCount = 0;
        
        const samples = Math.min(10000, data.length / 4); // Sample for performance
        
        for (let i = 0; i < samples * 4; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Brightness analysis
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            brightness += gray;
            
            // Colorfulness analysis
            const maxColor = Math.max(r, g, b);
            const minColor = Math.min(r, g, b);
            colorfulness += maxColor - minColor;
        }
        
        brightness /= samples;
        colorfulness /= samples;
        
        return {
            brightness,
            colorfulness,
            isLowLight: brightness < 80,
            isHighLight: brightness > 200,
            isColorful: colorfulness > 30,
            needsEnhancement: brightness < 100 || brightness > 180
        };
    }

    applyContentBasedEnhancement(canvas, analysis) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Convert to grayscale with optimal weights
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
        
        // Apply enhancement based on analysis
        if (analysis.isLowLight) {
            // Boost brightness for low-light images
            this.applyGammaCorrection(data, 0.7);
        } else if (analysis.isHighLight) {
            // Reduce brightness for overexposed images
            this.applyGammaCorrection(data, 1.3);
        }
        
        if (analysis.needsEnhancement) {
            // Apply adaptive contrast enhancement
            this.applyAdaptiveContrastEnhancement(data, canvas.width, canvas.height);
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    applyGammaCorrection(data, gamma) {
        const gammaTable = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            gammaTable[i] = Math.round(255 * Math.pow(i / 255, gamma));
        }
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = gammaTable[data[i]];
            data[i + 1] = gammaTable[data[i + 1]];
            data[i + 2] = gammaTable[data[i + 2]];
        }
    }

    applyAdaptiveContrastEnhancement(data, width, height) {
        // CLAHE with bilinear interpolation to avoid grid artifacts
        const tileSize = 64;
        const clipLimit = 3.0;
        
        // Create lookup tables for each tile
        const tilesX = Math.ceil(width / tileSize);
        const tilesY = Math.ceil(height / tileSize);
        const lookupTables = new Array(tilesY);
        
        // Generate lookup table for each tile
        for (let ty = 0; ty < tilesY; ty++) {
            lookupTables[ty] = new Array(tilesX);
            for (let tx = 0; tx < tilesX; tx++) {
                const startX = tx * tileSize;
                const startY = ty * tileSize;
                const tileWidth = Math.min(tileSize, width - startX);
                const tileHeight = Math.min(tileSize, height - startY);
                
                lookupTables[ty][tx] = this.createTileLookupTable(data, startX, startY, tileWidth, tileHeight, width, clipLimit);
            }
        }
        
        // Apply interpolated enhancement
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const originalValue = data[idx];
                
                // Determine which tiles this pixel falls between
                const tileX = x / tileSize;
                const tileY = y / tileSize;
                
                const tx = Math.floor(tileX);
                const ty = Math.floor(tileY);
                
                let enhancedValue;
                
                // If we're at the edge or in a single tile, use direct lookup
                if (tx >= tilesX - 1 || ty >= tilesY - 1) {
                    const safeTx = Math.min(tx, tilesX - 1);
                    const safeTy = Math.min(ty, tilesY - 1);
                    enhancedValue = lookupTables[safeTy][safeTx][originalValue];
                } else {
                    // Bilinear interpolation between 4 neighboring tiles
                    const fx = tileX - tx;
                    const fy = tileY - ty;
                    
                    const v00 = lookupTables[ty][tx][originalValue];
                    const v10 = lookupTables[ty][tx + 1][originalValue];
                    const v01 = lookupTables[ty + 1][tx][originalValue];
                    const v11 = lookupTables[ty + 1][tx + 1][originalValue];
                    
                    // Bilinear interpolation
                    const v0 = v00 * (1 - fx) + v10 * fx;
                    const v1 = v01 * (1 - fx) + v11 * fx;
                    enhancedValue = Math.round(v0 * (1 - fy) + v1 * fy);
                }
                
                data[idx] = enhancedValue;
                data[idx + 1] = enhancedValue;
                data[idx + 2] = enhancedValue;
            }
        }
    }

    createTileLookupTable(data, startX, startY, tileWidth, tileHeight, imageWidth, clipLimit) {
        // Build histogram for tile
        const histogram = new Array(256).fill(0);
        const tilePixels = tileWidth * tileHeight;
        
        // Count pixel values in the tile
        for (let y = 0; y < tileHeight; y++) {
            for (let x = 0; x < tileWidth; x++) {
                const idx = ((startY + y) * imageWidth + (startX + x)) * 4;
                if (idx < data.length) {
                    histogram[data[idx]]++;
                }
            }
        }
        
        // Apply histogram equalization with clipping
        const cdf = new Array(256).fill(0);
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += Math.min(histogram[i], clipLimit * tilePixels / 256);
            cdf[i] = sum;
        }
        
        // Normalize CDF to create lookup table
        const lookupTable = new Array(256);
        const cdfMax = cdf[255];
        for (let i = 0; i < 256; i++) {
            lookupTable[i] = cdfMax > 0 ? Math.round((cdf[i] / cdfMax) * 255) : i;
        }
        
        return lookupTable;
    }

    applyAdvancedNoiseReduction(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // Non-local means denoising approximation
        const filtered = new Uint8ClampedArray(data);
        const searchWindow = 7;
        const templateWindow = 3;
        const h = 10; // Filtering strength
        
        for (let y = templateWindow; y < height - templateWindow; y++) {
            for (let x = templateWindow; x < width - templateWindow; x++) {
                const idx = (y * width + x) * 4;
                
                let weightSum = 0;
                let pixelSum = 0;
                
                // Search in local neighborhood
                for (let sy = Math.max(templateWindow, y - searchWindow); 
                     sy < Math.min(height - templateWindow, y + searchWindow); sy++) {
                    for (let sx = Math.max(templateWindow, x - searchWindow); 
                         sx < Math.min(width - templateWindow, x + searchWindow); sx++) {
                        
                        // Calculate template similarity
                        let distance = 0;
                        for (let ty = -templateWindow; ty <= templateWindow; ty++) {
                            for (let tx = -templateWindow; tx <= templateWindow; tx++) {
                                const idx1 = ((y + ty) * width + (x + tx)) * 4;
                                const idx2 = ((sy + ty) * width + (sx + tx)) * 4;
                                const diff = data[idx1] - data[idx2];
                                distance += diff * diff;
                            }
                        }
                        
                        const weight = Math.exp(-distance / (h * h));
                        weightSum += weight;
                        pixelSum += weight * data[(sy * width + sx) * 4];
                    }
                }
                
                if (weightSum > 0) {
                    const denoised = Math.round(pixelSum / weightSum);
                    filtered[idx] = denoised;
                    filtered[idx + 1] = denoised;
                    filtered[idx + 2] = denoised;
                }
            }
        }
        
        // Apply filtered result
        for (let i = 0; i < data.length; i += 4) {
            data[i] = filtered[i];
            data[i + 1] = filtered[i + 1];
            data[i + 2] = filtered[i + 2];
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    applyTextSharpening(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // Unsharp mask for text enhancement
        const kernel = [
            [0, -1, 0],
            [-1, 5, -1],
            [0, -1, 0]
        ];
        
        const sharpened = new Uint8ClampedArray(data);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        sum += data[idx] * kernel[ky + 1][kx + 1];
                    }
                }
                
                const idx = (y * width + x) * 4;
                const sharpValue = Math.max(0, Math.min(255, sum));
                
                sharpened[idx] = sharpValue;
                sharpened[idx + 1] = sharpValue;
                sharpened[idx + 2] = sharpValue;
            }
        }
        
        // Apply sharpened result
        for (let i = 0; i < data.length; i += 4) {
            data[i] = sharpened[i];
            data[i + 1] = sharpened[i + 1];
            data[i + 2] = sharpened[i + 2];
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    // ====================
    // Utility Methods
    // ====================

    // Get processing configuration for debugging
    getProcessingConfig() {
        return { ...this.processingConfig };
    }

    // Update processing configuration
    updateProcessingConfig(updates) {
        this.processingConfig = { ...this.processingConfig, ...updates };
        console.log('Processing configuration updated:', this.processingConfig);
    }
    
    // Get last region extraction results for debugging
    getLastRegionExtraction() {
        return this.lastRegionExtraction;
    }
    
    // Get last processing steps for debugging
    getLastProcessingSteps() {
        return this.lastProcessingSteps || [];
    }
    
    // Get last image analysis results for debugging
    getLastImageAnalysis() {
        return this.lastImageAnalysis || null;
    }

    // Legacy preprocessing method - kept for backward compatibility
    preprocessImage(imageData) {
        // Create canvas from image data
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        
        // Use enhanced preprocessing pipeline
        const processedCanvas = this.applyEnhancedPreprocessingPipeline(canvas);
        
        // Convert back to ImageData
        const processedCtx = processedCanvas.getContext('2d');
        return processedCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    }

    // Legacy helper methods - kept for compatibility
    enhanceContrast(value, factor = 1.4) {
        const enhanced = (value - 128) * factor + 128;
        return Math.max(0, Math.min(255, Math.round(enhanced)));
    }

    sharpenPixel(value, index, data, width) {
        const sharpened = value * 1.5 - (value * 0.5);
        return Math.max(0, Math.min(255, Math.round(sharpened)));
    }

    reduceNoise(value, index, data, width) {
        return Math.max(0, Math.min(255, value));
    }

    // OCR preprocessing method with optimized region extraction
    preprocessForOCR(canvas, debugMode = false) {
        console.log(`Starting OCR preprocessing with optimized region extraction: ${canvas.width}x${canvas.height}`);
        
        // Use region-based approach for card name extraction with debug support
        const optimizedRegion = this.extractOptimalCardNameRegion(canvas, debugMode);
        console.log(`Using region extraction method: ${optimizedRegion.method}`);
        
        // Store region extraction results for debugging
        this.lastRegionExtraction = optimizedRegion;
        
        return this.applyEnhancedPreprocessingPipeline(optimizedRegion.canvas, debugMode);
    }

    // Enhanced region extraction methods with multiple strategies
    extractOptimalCardNameRegion(canvas, debugMode = false) {
        const debugResults = [];
        
        // Enhanced strategies with better sizing and positioning
        const strategies = [
            {
                method: 'smart_name_region',
                extract: () => this.extractSmartNameRegion(canvas),
                priority: 1
            },
            {
                method: 'adaptive_top_region', 
                extract: () => this.extractAdaptiveTopRegion(canvas),
                priority: 2
            },
            {
                method: 'enhanced_top25',
                extract: () => this.extractEnhancedTop25Percent(canvas),
                priority: 3
            },
            {
                method: 'focused_name_area',
                extract: () => this.extractFocusedNameArea(canvas),
                priority: 4
            },
            {
                method: 'wide_top_center',
                extract: () => this.extractWideTopCenter(canvas),
                priority: 5
            }
        ];
        
        // Try each strategy and score them
        for (const strategy of strategies) {
            try {
                const extracted = strategy.extract();
                const quality = this.evaluateRegionQuality(extracted, canvas);
                
                if (debugMode) {
                    debugResults.push({
                        method: strategy.method,
                        canvas: extracted,
                        quality: quality,
                        priority: strategy.priority
                    });
                }
                
                // Return first high-quality result
                if (quality.score >= 0.7 && extracted && extracted.width >= 150 && extracted.height >= 60) {
                    const result = { 
                        canvas: extracted, 
                        method: strategy.method, 
                        quality: quality 
                    };
                    
                    if (debugMode) {
                        result.debugResults = debugResults;
                    }
                    
                    return result;
                }
            } catch (error) {
                console.warn(`Strategy ${strategy.method} failed:`, error);
                if (debugMode) {
                    debugResults.push({
                        method: strategy.method,
                        canvas: null,
                        quality: { score: 0, reason: error.message },
                        priority: strategy.priority
                    });
                }
            }
        }
        
        // Fallback to best available result or full image
        const bestResult = debugResults
            .filter(r => r.canvas && r.quality.score > 0)
            .sort((a, b) => b.quality.score - a.quality.score)[0];
            
        if (bestResult) {
            const result = { 
                canvas: bestResult.canvas, 
                method: bestResult.method + '_fallback',
                quality: bestResult.quality
            };
            
            if (debugMode) {
                result.debugResults = debugResults;
            }
            
            return result;
        }
        
        // Ultimate fallback
        const result = { 
            canvas: canvas, 
            method: 'full_image',
            quality: { score: 0.1, reason: 'All strategies failed' }
        };
        
        if (debugMode) {
            result.debugResults = debugResults;
        }
        
        return result;
    }

    // Enhanced region extraction methods
    
    extractSmartNameRegion(canvas) {
        // Analyze card proportions and extract name region intelligently
        const aspectRatio = canvas.width / canvas.height;
        let width, height, x, y;
        
        if (aspectRatio > 0.8) {
            // Landscape or square image - likely cropped card
            width = Math.floor(canvas.width * 0.90);
            height = Math.floor(canvas.height * 0.25);
            x = Math.floor((canvas.width - width) / 2);
            y = Math.floor(canvas.height * 0.05);
        } else {
            // Portrait image - likely full card
            width = Math.floor(canvas.width * 0.85);
            height = Math.floor(canvas.height * 0.12);
            x = Math.floor((canvas.width - width) / 2);
            y = Math.floor(canvas.height * 0.08);
        }
        
        return this.extractRegion(canvas, x, y, width, height);
    }
    
    extractAdaptiveTopRegion(canvas) {
        // Adaptive region based on image content analysis
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Find text-dense areas in the top portion
        const topHeight = Math.floor(canvas.height * 0.4);
        const textDensity = this.analyzeTextDensity(imageData, canvas.width, topHeight);
        
        // Adjust region based on text density
        const baseHeight = Math.floor(canvas.height * 0.20);
        const height = Math.max(baseHeight, Math.min(Math.floor(canvas.height * 0.35), 
                                                    Math.floor(baseHeight * (1 + textDensity))));
        
        const width = Math.floor(canvas.width * 0.88);
        const x = Math.floor((canvas.width - width) / 2);
        const y = Math.floor(canvas.height * 0.04);
        
        return this.extractRegion(canvas, x, y, width, height);
    }
    
    extractEnhancedTop25Percent(canvas) {
        // Enhanced version of top 25% with better positioning
        const height = Math.floor(canvas.height * 0.28); // Slightly larger
        const width = Math.floor(canvas.width * 0.92);   // Wider coverage
        const x = Math.floor((canvas.width - width) / 2);
        const y = Math.floor(canvas.height * 0.02);       // Start slightly higher
        
        return this.extractRegion(canvas, x, y, width, height);
    }
    
    extractFocusedNameArea(canvas) {
        // Focused extraction targeting typical MTG card name position
        const width = Math.floor(canvas.width * 0.82);
        const height = Math.floor(canvas.height * 0.14);
        const x = Math.floor((canvas.width - width) / 2);
        const y = Math.floor(canvas.height * 0.07);
        
        return this.extractRegion(canvas, x, y, width, height);
    }
    
    extractWideTopCenter(canvas) {
        // Wide top center extraction for cards with complex layouts
        const width = Math.floor(canvas.width * 0.95);
        const height = Math.floor(canvas.height * 0.32);
        const x = Math.floor((canvas.width - width) / 2);
        const y = 0;
        
        return this.extractRegion(canvas, x, y, width, height);
    }
    
    extractRegion(canvas, x, y, width, height) {
        // Utility method for consistent region extraction
        const extractCanvas = document.createElement('canvas');
        extractCanvas.width = width;
        extractCanvas.height = height;
        const ctx = extractCanvas.getContext('2d');
        
        // Ensure coordinates are within bounds
        x = Math.max(0, Math.min(x, canvas.width - width));
        y = Math.max(0, Math.min(y, canvas.height - height));
        width = Math.min(width, canvas.width - x);
        height = Math.min(height, canvas.height - y);
        
        ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
        return extractCanvas;
    }
    
    analyzeTextDensity(imageData, width, height) {
        // Simple text density analysis based on edge detection
        const data = imageData.data;
        let edgeCount = 0;
        const totalPixels = width * height;
        
        // Simple edge detection using Sobel-like operator
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                
                // Check gradient magnitude
                const leftIdx = (y * width + (x - 1)) * 4;
                const rightIdx = (y * width + (x + 1)) * 4;
                const topIdx = ((y - 1) * width + x) * 4;
                const bottomIdx = ((y + 1) * width + x) * 4;
                
                const leftGray = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
                const rightGray = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
                const topGray = 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
                const bottomGray = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];
                
                const gx = (rightGray - leftGray) / 2;
                const gy = (bottomGray - topGray) / 2;
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                
                if (magnitude > 30) { // Edge threshold
                    edgeCount++;
                }
            }
        }
        
        return edgeCount / totalPixels; // Return density ratio
    }
    
    evaluateRegionQuality(canvas, originalCanvas) {
        if (!canvas || canvas.width < 100 || canvas.height < 50) {
            return { score: 0, reason: 'Region too small' };
        }
        
        let score = 0;
        const reasons = [];
        
        // Size score (prefer reasonable sizes)
        const sizeRatio = (canvas.width * canvas.height) / (originalCanvas.width * originalCanvas.height);
        if (sizeRatio >= 0.1 && sizeRatio <= 0.5) {
            score += 0.3;
            reasons.push('Good size ratio');
        } else if (sizeRatio >= 0.05 && sizeRatio <= 0.7) {
            score += 0.2;
            reasons.push('Acceptable size ratio');
        }
        
        // Aspect ratio score (prefer wider regions for text)
        const aspectRatio = canvas.width / canvas.height;
        if (aspectRatio >= 2.5 && aspectRatio <= 6) {
            score += 0.4;
            reasons.push('Good aspect ratio for text');
        } else if (aspectRatio >= 1.5 && aspectRatio <= 8) {
            score += 0.2;
            reasons.push('Acceptable aspect ratio');
        }
        
        // Content analysis score
        const contentScore = this.analyzeRegionContent(canvas);
        score += contentScore * 0.3;
        if (contentScore > 0.5) {
            reasons.push('Good text content detected');
        }
        
        return {
            score: Math.min(1.0, score),
            reasons: reasons,
            aspectRatio: aspectRatio,
            sizeRatio: sizeRatio,
            contentScore: contentScore
        };
    }
    
    analyzeRegionContent(canvas) {
        // Analyze region content for text likelihood
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let textLikePixels = 0;
        let totalPixels = 0;
        
        // Look for text-like patterns (high contrast edges)
        for (let y = 1; y < canvas.height - 1; y++) {
            for (let x = 1; x < canvas.width - 1; x++) {
                const idx = (y * canvas.width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                
                // Check for high contrast with neighbors
                let maxDiff = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
                        const nGray = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
                        maxDiff = Math.max(maxDiff, Math.abs(gray - nGray));
                    }
                }
                
                if (maxDiff > 50) { // High contrast threshold
                    textLikePixels++;
                }
                totalPixels++;
            }
        }
        
        return totalPixels > 0 ? textLikePixels / totalPixels : 0;
    }

    // Legacy compatibility method for resizing
    resizeForOCR(canvas, maxWidth = 1600, maxHeight = 1200) {
        return this.optimizeCanvasSize(canvas);
    }

    // ====================
    // Static Utility Methods (preserved for compatibility)
    // ====================

    static async checkCameraSupport() {
        if (!navigator.mediaDevices) {
            if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
                return {
                    supported: true,
                    deviceCount: 1,
                    devices: [{ kind: 'videoinput', label: 'Camera (legacy API)' }],
                    note: 'Verwendet Legacy-Kamera-API'
                };
            }
            return { supported: false, error: 'Keine Kamera-API verfügbar' };
        }

        if (!navigator.mediaDevices.getUserMedia) {
            return { supported: false, error: 'getUserMedia wird nicht unterstützt' };
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length > 0) {
                return {
                    supported: true,
                    deviceCount: videoDevices.length,
                    devices: videoDevices
                };
            }

            return await this.testCameraAccess();
        } catch (error) {
            console.warn('Device enumeration failed, testing camera access:', error.message);
            return await this.testCameraAccess();
        }
    }

    static async testCameraAccess() {
        try {
            const testStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            testStream.getTracks().forEach(track => track.stop());

            return {
                supported: true,
                deviceCount: 1,
                devices: [{ kind: 'videoinput', label: 'Camera' }],
                note: 'Kamera verfügbar (Berechtigung erteilt)'
            };
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                return {
                    supported: true,
                    deviceCount: 0,
                    devices: [],
                    error: 'Kamerazugriff verweigert - bitte Berechtigung erteilen',
                    needsPermission: true
                };
            } else if (error.name === 'NotFoundError') {
                return { supported: false, error: 'Keine Kamera gefunden' };
            } else {
                return { supported: false, error: 'Kamerazugriff nicht möglich: ' + error.message };
            }
        }
    }

    getOptimalConstraints() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            return {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                }
            };
        } else {
            return {
                video: {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                }
            };
        }
    }

    resizeImage(canvas, maxWidth = 800, maxHeight = 600) {
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
            return canvas;
        }

        const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
        const newWidth = Math.round(originalWidth * ratio);
        const newHeight = Math.round(originalHeight * ratio);

        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = newWidth;
        resizedCanvas.height = newHeight;

        const resizedContext = resizedCanvas.getContext('2d');
        resizedContext.drawImage(canvas, 0, 0, newWidth, newHeight);

        return resizedCanvas;
    }
}

export default CameraManager;
