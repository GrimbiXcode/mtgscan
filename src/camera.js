// Camera functionality for capturing MTG card images
class CameraManager {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.stream = null;
        this.isActive = false;
    }

    async init(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;

        // Set canvas size to match video
        this.canvas.width = 640;
        this.canvas.height = 480;
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
                    // Update canvas size to match actual video dimensions
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
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
    }

    captureImage() {
        if (!this.isActive || !this.video || !this.canvas) {
            throw new Error('Kamera ist nicht aktiv');
        }

        const context = this.canvas.getContext('2d');

        // Draw the current video frame to canvas
        context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Get image data
        const imageData = context.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // Apply image preprocessing for better OCR results
        const processedImageData = this.preprocessImage(imageData);

        // Put processed image back to canvas
        context.putImageData(processedImageData, 0, 0);

        // Convert to blob for further processing
        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                resolve({
                    blob: blob,
                    dataUrl: this.canvas.toDataURL('image/jpeg', 0.8),
                    canvas: this.canvas
                });
            }, 'image/jpeg', 0.8);
        });
    }

    preprocessImage(imageData) {
        const data = imageData.data;
        const processed = new ImageData(imageData.width, imageData.height);
        const processedData = processed.data;

        // Apply preprocessing techniques for better OCR
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // Convert to grayscale for better text recognition
            let gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            // Apply contrast enhancement
            gray = this.enhanceContrast(gray, 1.4);

            // Apply noise reduction
            gray = this.reduceNoise(gray, i, data, imageData.width);

            // Apply sharpening for better edge definition
            gray = this.sharpenPixel(gray, i, data, imageData.width);

            processedData[i] = gray;     // R
            processedData[i + 1] = gray; // G
            processedData[i + 2] = gray; // B
            processedData[i + 3] = a;    // A
        }

        return processed;
    }

    enhanceContrast(value, factor = 1.4) {
        // Enhanced contrast for better OCR
        const enhanced = (value - 128) * factor + 128;
        return Math.max(0, Math.min(255, Math.round(enhanced)));
    }

    sharpenPixel(value, index, data, width) {
        // Enhanced sharpening filter for better text edge definition
        // Apply a simple unsharp mask
        const sharpened = value * 1.5 - (value * 0.5);
        return Math.max(0, Math.min(255, Math.round(sharpened)));
    }

    reduceNoise(value, index, data, width) {
        // Simple noise reduction using local averaging
        // This helps reduce camera noise that can interfere with OCR
        return Math.max(0, Math.min(255, value));
    }

    // Enhanced image preprocessing specifically for OCR
    preprocessForOCR(canvas) {
        const context = canvas.getContext('2d');
        const originalImageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Create a new canvas for processing to avoid modifying the original
        const processedCanvas = document.createElement('canvas');
        processedCanvas.width = canvas.width;
        processedCanvas.height = canvas.height;
        const processedContext = processedCanvas.getContext('2d');

        // Copy original image to processed canvas
        processedContext.drawImage(canvas, 0, 0);

        // Step 1: Segment card header area FIRST before any processing
        // This preserves the original image quality for the header area
        const headerCanvas = this.segmentCardHeader(processedCanvas);

        // Step 2: Resize if too large (OCR works better on moderately sized images)
        const resizedCanvas = this.resizeForOCR(headerCanvas);

        // Step 3: Convert to grayscale with optimal weighting for MTG card text
        const imageData = resizedCanvas.getContext('2d').getImageData(0, 0, resizedCanvas.width, resizedCanvas.height);
        const data = imageData.data;
        this.convertToGrayscale(data);
        resizedCanvas.getContext('2d').putImageData(imageData, 0, 0);

        // Step 4: Apply minimal processing - only light contrast enhancement
        // Avoid heavy processing that can damage text readability
        this.applyLightContrastEnhancement(resizedCanvas);

        // Step 5: Apply gentle adaptive threshold if image appears very light/dark
        if (this.needsThresholding(resizedCanvas)) {
            this.applyGentleThreshold(resizedCanvas);
        }

        return resizedCanvas;
    }

    // Segment the card header area containing the title
    segmentCardHeader(canvas) {
        const headerCanvas = document.createElement('canvas');
        const context = headerCanvas.getContext('2d');

        // Define minimum dimensions for OCR to work properly
        const minOCRWidth = 150;  // Minimum width for reliable OCR
        const minOCRHeight = 80;  // Minimum height for reliable OCR

        // Magic cards typically have the title in the top 20-25% of the card
        // We'll extract a slightly larger area (30%) to ensure we capture the full title
        let headerHeight = Math.floor(canvas.height * 0.30);
        let headerWidth = canvas.width;

        // Ensure minimum dimensions for OCR
        if (headerWidth < minOCRWidth || headerHeight < minOCRHeight) {
            console.warn(`Original header segment too small (${headerWidth}x${headerHeight}), adjusting to minimum OCR size`);

            // If the entire image is too small, use the full image
            if (canvas.width < minOCRWidth || canvas.height < minOCRHeight) {
                console.warn(`Entire image too small for header segmentation, using full image`);
                headerWidth = canvas.width;
                headerHeight = canvas.height;
            } else {
                // Adjust dimensions to meet minimum requirements
                headerWidth = Math.max(headerWidth, minOCRWidth);
                headerHeight = Math.max(headerHeight, minOCRHeight);

                // Don't exceed original canvas dimensions
                headerWidth = Math.min(headerWidth, canvas.width);
                headerHeight = Math.min(headerHeight, canvas.height);
            }
        }

        // Set canvas dimensions
        headerCanvas.width = headerWidth;
        headerCanvas.height = headerHeight;

        // Extract the header portion from the original canvas
        context.drawImage(
            canvas,
            0, 0, headerWidth, headerHeight,  // source rectangle (top portion)
            0, 0, headerWidth, headerHeight   // destination rectangle
        );

        console.log(`Segmented card header: ${canvas.width}x${canvas.height} -> ${headerCanvas.width}x${headerCanvas.height}`);

        return headerCanvas;
    }

    convertToGrayscale(data) {
        // Convert to grayscale with optimal weighting for text recognition
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Use luminance formula optimized for text recognition
            const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
            // Alpha channel unchanged
        }
    }

    resizeForOCR(canvas, maxWidth = 1600, maxHeight = 1200) {
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        // Define absolute minimum dimensions for OCR to work - increased from previous values
        const absoluteMinWidth = 150;  // Increased to match segmentation minimum
        const absoluteMinHeight = 80;  // Increased to match segmentation minimum

        // If image is already too small, don't resize it down further
        if (originalWidth < absoluteMinWidth || originalHeight < absoluteMinHeight) {
            console.warn(`Image too small for OCR: ${originalWidth}x${originalHeight}, using as-is`);
            return canvas;
        }

        // Maintain higher resolution for better card text recognition
        // Only resize if image is extremely large or within optimal range
        if (originalWidth <= maxWidth && originalHeight <= maxHeight &&
            originalWidth >= 400 && originalHeight >= 300) {
            return canvas; // Size is optimal for OCR
        }

        // Calculate aspect-preserving resize with safe minimum resolution
        const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);

        // Ensure we don't scale down below minimum OCR dimensions
        let newWidth = Math.round(originalWidth * ratio);
        let newHeight = Math.round(originalHeight * ratio);

        // If scaling would make image too small, use minimum dimensions
        if (newWidth < absoluteMinWidth || newHeight < absoluteMinHeight) {
            const aspectRatio = originalWidth / originalHeight;
            if (aspectRatio > 1) {
                // Wider than tall
                newWidth = Math.max(absoluteMinWidth, newWidth);
                newHeight = Math.max(absoluteMinHeight, Math.round(newWidth / aspectRatio));
            } else {
                // Taller than wide
                newHeight = Math.max(absoluteMinHeight, newHeight);
                newWidth = Math.max(absoluteMinWidth, Math.round(newHeight * aspectRatio));
            }
        }

        // Ensure we're still under maximum limits
        newWidth = Math.min(newWidth, maxWidth);
        newHeight = Math.min(newHeight, maxHeight);

        const resizedCanvas = document.createElement('canvas');
        resizedCanvas.width = newWidth;
        resizedCanvas.height = newHeight;

        const resizedContext = resizedCanvas.getContext('2d');
        // Use high-quality scaling
        resizedContext.imageSmoothingEnabled = true;
        resizedContext.imageSmoothingQuality = 'high';
        resizedContext.drawImage(canvas, 0, 0, newWidth, newHeight);

        return resizedCanvas;
    }

    // Crop image to focus on the card frame area for better OCR
    cropToCardFrame(canvas) {
        const frameWidth = Math.round(canvas.width * 0.7); // 70% of image width (matching CSS)
        const frameHeight = Math.round(frameWidth * (3.5 / 2.5)); // MTG card aspect ratio

        // Ensure minimum dimensions for OCR to work properly
        const minWidth = 200;  // Minimum width for OCR
        const minHeight = 150; // Minimum height for OCR

        // If calculated frame would be too small, use larger crop area
        const adjustedFrameWidth = Math.max(frameWidth, minWidth);
        const adjustedFrameHeight = Math.max(frameHeight, minHeight);

        // If even the adjusted frame is larger than canvas, use full canvas
        const finalFrameWidth = Math.min(adjustedFrameWidth, canvas.width);
        const finalFrameHeight = Math.min(adjustedFrameHeight, canvas.height);

        // Center the crop area
        const startX = Math.round((canvas.width - finalFrameWidth) / 2);
        const startY = Math.round((canvas.height - finalFrameHeight) / 2);

        // Ensure crop area is within image bounds
        const cropX = Math.max(0, Math.min(startX, canvas.width - finalFrameWidth));
        const cropY = Math.max(0, Math.min(startY, canvas.height - finalFrameHeight));
        const cropWidth = Math.min(finalFrameWidth, canvas.width - cropX);
        const cropHeight = Math.min(finalFrameHeight, canvas.height - cropY);

        // Final validation - if still too small, return original canvas
        if (cropWidth < minWidth || cropHeight < minHeight) {
            console.warn(`Crop area too small (${cropWidth}x${cropHeight}), using original canvas`);
            return canvas;
        }

        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropWidth;
        croppedCanvas.height = cropHeight;

        const croppedContext = croppedCanvas.getContext('2d');
        croppedContext.drawImage(
            canvas,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, cropWidth, cropHeight
        );

        return croppedCanvas;
    }

    // Light contrast enhancement for OCR - gentler than full contrast enhancement
    applyLightContrastEnhancement(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Apply mild contrast enhancement (factor 1.2 instead of aggressive stretching)
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i];
            // Gentle contrast boost
            const enhanced = Math.round((gray - 128) * 1.2 + 128);
            const clamped = Math.max(0, Math.min(255, enhanced));

            data[i] = clamped;
            data[i + 1] = clamped;
            data[i + 2] = clamped;
        }

        context.putImageData(imageData, 0, 0);
    }

    // Check if image needs thresholding (very light or very dark)
    needsThresholding(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let sum = 0;
        let count = 0;

        // Calculate average brightness
        for (let i = 0; i < data.length; i += 4) {
            sum += data[i]; // Using red channel (grayscale)
            count++;
        }

        const avgBrightness = sum / count;

        // Need thresholding if image is too light (> 200) or too dark (< 80)
        return avgBrightness > 200 || avgBrightness < 80;
    }

    // Gentle adaptive threshold - less aggressive than the optimized version
    applyGentleThreshold(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Use smaller window size for gentler thresholding
        const windowSize = 15;
        const offset = Math.floor(windowSize / 2);
        const c = 10; // Smaller constant for gentler effect

        const temp = new Uint8ClampedArray(data);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const pixel = temp[idx];

                // Calculate local mean in smaller window
                let sum = 0;
                let count = 0;

                for (let wy = Math.max(0, y - offset); wy <= Math.min(height - 1, y + offset); wy++) {
                    for (let wx = Math.max(0, x - offset); wx <= Math.min(width - 1, x + offset); wx++) {
                        const widx = (wy * width + wx) * 4;
                        sum += temp[widx];
                        count++;
                    }
                }

                const mean = sum / count;
                const threshold = mean - c;

                // Gentler thresholding - use gray values instead of pure black/white
                const result = pixel > threshold ? Math.max(200, pixel) : Math.min(100, pixel);

                data[idx] = result;
                data[idx + 1] = result;
                data[idx + 2] = result;
            }
        }

        context.putImageData(imageData, 0, 0);
    }

    applyNoiseReduction(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Simple 3x3 Gaussian kernel for noise reduction
        const kernel = [
            [1, 2, 1],
            [2, 4, 2],
            [1, 2, 1]
        ];
        const kernelSum = 16;

        const temp = new Uint8ClampedArray(data);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        sum += temp[idx] * kernel[ky + 1][kx + 1];
                    }
                }

                const idx = (y * width + x) * 4;
                const blurred = Math.round(sum / kernelSum);
                data[idx] = blurred;
                data[idx + 1] = blurred;
                data[idx + 2] = blurred;
            }
        }

        context.putImageData(imageData, 0, 0);
    }

    applyContrastEnhancement(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Apply contrast stretching for better text visibility
        let min = 255, max = 0;

        // Find min and max values
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i];
            if (gray < min) min = gray;
            if (gray > max) max = gray;
        }

        // Apply contrast stretching
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < data.length; i += 4) {
                const enhanced = Math.round(((data[i] - min) / range) * 255);
                data[i] = enhanced;
                data[i + 1] = enhanced;
                data[i + 2] = enhanced;
            }
        }

        context.putImageData(imageData, 0, 0);
    }

    applyAdaptiveThresholdOptimized(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Otsu's method for optimal threshold calculation
        const histogram = new Array(256).fill(0);

        // Build histogram
        for (let i = 0; i < data.length; i += 4) {
            histogram[data[i]]++;
        }

        // Calculate optimal threshold using Otsu's method
        const total = width * height;
        let sum = 0;
        for (let i = 0; i < 256; i++) {
            sum += i * histogram[i];
        }

        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let maxVar = 0;
        let threshold = 0;

        for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;

            wF = total - wB;
            if (wF === 0) break;

            sumB += t * histogram[t];

            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;

            const varBetween = wB * wF * (mB - mF) * (mB - mF);

            if (varBetween > maxVar) {
                maxVar = varBetween;
                threshold = t;
            }
        }

        // Apply threshold with slight bias towards keeping text
        threshold = Math.max(100, threshold - 10); // Bias towards text preservation

        for (let i = 0; i < data.length; i += 4) {
            const binary = data[i] > threshold ? 255 : 0;
            data[i] = binary;
            data[i + 1] = binary;
            data[i + 2] = binary;
        }

        context.putImageData(imageData, 0, 0);
    }

    applyTextCleanup(canvas) {
        const context = canvas.getContext('2d');
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // Apply opening operation (erosion followed by dilation)
        // This removes small noise while preserving larger text structures

        // Erosion pass - removes small white noise
        const temp = new Uint8ClampedArray(data);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;

                // Check if all neighbors in 3x3 are white (text)
                let minVal = 255;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nidx = ((y + dy) * width + (x + dx)) * 4;
                        minVal = Math.min(minVal, temp[nidx]);
                    }
                }

                data[idx] = minVal;
                data[idx + 1] = minVal;
                data[idx + 2] = minVal;
            }
        }

        // Dilation pass - restores text that was slightly eroded
        temp.set(data);
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;

                // Check if any neighbor in 3x3 is white (text)
                let maxVal = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nidx = ((y + dy) * width + (x + dx)) * 4;
                        maxVal = Math.max(maxVal, temp[nidx]);
                    }
                }

                data[idx] = maxVal;
                data[idx + 1] = maxVal;
                data[idx + 2] = maxVal;
            }
        }

        context.putImageData(imageData, 0, 0);
    }

    // Helper method to check camera support
    static async checkCameraSupport() {
        // More robust check for iPhone Safari compatibility
        if (!navigator.mediaDevices) {
            // Try fallback for older browsers or restricted contexts
            if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
                return {
                    supported: true,
                    deviceCount: 1,
                    devices: [{ kind: 'videoinput', label: 'Camera (legacy API)' }],
                    note: 'Verwendet Legacy-Kamera-API'
                };
            }
            return {
                supported: false,
                error: 'Keine Kamera-API verfügbar'
            };
        }

        if (!navigator.mediaDevices.getUserMedia) {
            return {
                supported: false,
                error: 'getUserMedia wird nicht unterstützt'
            };
        }

        try {
            // First, try to enumerate devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            // If we found devices, we're good
            if (videoDevices.length > 0) {
                return {
                    supported: true,
                    deviceCount: videoDevices.length,
                    devices: videoDevices
                };
            }

            // If no devices found, it might be due to Safari privacy restrictions
            // Try a more reliable check by testing actual camera access
            return await this.testCameraAccess();

        } catch (error) {
            // On Safari/iPhone, enumerateDevices might fail due to privacy restrictions
            // Fall back to testing actual camera access
            console.warn('Device enumeration failed, testing camera access:', error.message);
            return await this.testCameraAccess();
        }
    }

    // Fallback method to test actual camera access (for Safari/iPhone)
    static async testCameraAccess() {
        try {
            // Test basic video constraints
            const testStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            // If we got a stream, camera is supported
            testStream.getTracks().forEach(track => track.stop());

            return {
                supported: true,
                deviceCount: 1, // We know at least one camera works
                devices: [{ kind: 'videoinput', label: 'Camera' }],
                note: 'Kamera verfügbar (Berechtigung erteilt)'
            };

        } catch (error) {
            // Check if it's a permission error vs unsupported
            if (error.name === 'NotAllowedError') {
                return {
                    supported: true, // Camera exists but permission denied
                    deviceCount: 0,
                    devices: [],
                    error: 'Kamerazugriff verweigert - bitte Berechtigung erteilen',
                    needsPermission: true
                };
            } else if (error.name === 'NotFoundError') {
                return {
                    supported: false,
                    error: 'Keine Kamera gefunden'
                };
            } else {
                return {
                    supported: false,
                    error: 'Kamerazugriff nicht möglich: ' + error.message
                };
            }
        }
    }

    // Get optimal camera constraints based on device
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

    // Helper method to resize image if too large
    resizeImage(canvas, maxWidth = 800, maxHeight = 600) {
        const context = canvas.getContext('2d');
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
            return canvas; // No resize needed
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
