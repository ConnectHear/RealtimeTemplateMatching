import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cv from 'opencv-wasm';

// ES Module equivalent for __dirname, which is not available in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global variables to hold initialized template data for reuse in "warm" Lambda starts
let templateMat, templateKeypoints, templateDescriptors, orb, bfMatcher;
let isInitialized = false;

// Initialization function runs only once per container
async function initialize() {
    if (isInitialized) {
        return;
    }
    await cv.init();
    console.log('OpenCV.js is ready.');

    const templateImagePath = path.join(__dirname, 'template.png');
    const templateImageBuffer = fs.readFileSync(templateImagePath);
    templateMat = cv.imdecode(templateImageBuffer);

    if (templateMat.empty()) {
        throw new Error('Failed to load template image.');
    }

    const templateGray = new cv.Mat();
    cv.cvtColor(templateMat, templateGray, cv.COLOR_RGBA2GRAY);

    orb = new cv.ORB(5000);
    templateKeypoints = new cv.KeyPointVector();
    templateDescriptors = new cv.Mat();
    orb.detectAndCompute(templateGray, new cv.Mat(), templateKeypoints, templateDescriptors);

    if (templateDescriptors.empty()) {
        throw new Error('No features found in template image.');
    }

    bfMatcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    
    console.log('Template Matcher Initialized Successfully.');
    templateGray.delete();
    isInitialized = true;
}

// Main Lambda handler function
export const handler = async (event) => {
    try {
        await initialize(); // Ensure everything is ready

        if (!event.body) {
            throw new Error("Request body is empty.");
        }

        const body = JSON.parse(event.body);
        let imageBase64 = body.image;

        if (!imageBase64) {
            throw new Error("No 'image' field in request body.");
        }

        // Robustly handle if the input is a Data URL (e.g., from a browser)
        if (imageBase64.includes(';base64,')) {
            imageBase64 = imageBase64.split(',')[1];
        }

        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const frame = cv.imdecode(imageBuffer);
        if (frame.empty()) {
            throw new Error("Failed to decode input image.");
        }

        const frameGray = new cv.Mat();
        cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);

        const keypoints2 = new cv.KeyPointVector();
        const descriptors2 = new cv.Mat();
        orb.detectAndCompute(frameGray, new cv.Mat(), keypoints2, descriptors2);

        let templateDetected = false;
        const matchThreshold = 12; // Minimum good matches to count as a detection

        if (!descriptors2.empty()) {
            const goodMatchesVector = new cv.DMatchVector();
            bfMatcher.match(templateDescriptors, descriptors2, goodMatchesVector);

            if (goodMatchesVector.size() >= matchThreshold) {
                templateDetected = true;
            }
            goodMatchesVector.delete();
        }

        // Clean up OpenCV Mats to prevent memory leaks
        frame.delete();
        frameGray.delete();
        keypoints2.delete();
        descriptors2.delete();

        // Return a successful response
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: templateDetected ? "Special CNIC detected!" : "Special CNIC not detected.",
                detected: templateDetected,
            }),
        };
    } catch (error) {
        console.error('ERROR:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};