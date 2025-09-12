const fs = require('fs');
const path = require('path');
const cv = require('opencv-wasm');

// --- Global variables to hold initialized template data ---
// This is done outside the handler to take advantage of Lambda's execution context reuse (warm starts)
let templateMat, templateKeypoints, templateDescriptors, orb, bfMatcher;
let isInitialized = false;

// --- Initialization Function ---
async function initialize() {
    if (isInitialized) {
        return;
    }

    // Wait for OpenCV to be ready
    await cv.init();
    console.log('OpenCV.js is ready.');

    // Load the template image from the file packaged with the Lambda
    const templateImagePath = path.join(__dirname, 'template.png');
    const templateImageBuffer = fs.readFileSync(templateImagePath);
    templateMat = cv.imdecode(templateImageBuffer); // Use imdecode for buffers

    if (templateMat.empty()) {
        throw new Error('Failed to load template image.');
    }

    const templateGray = new cv.Mat();
    cv.cvtColor(templateMat, templateGray, cv.COLOR_RGBA2GRAY);

    // Initialize ORB detector and BFMatcher
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

// --- Main Lambda Handler ---
exports.handler = async (event) => {
    try {
        // Ensure OpenCV and our template data are initialized
        await initialize();

        // Get the base64 encoded image from the request body
        if (!event.body) {
            throw new Error("Request body is empty.");
        }
        const body = JSON.parse(event.body);
        const imageBase64 = body.image;
        if (!imageBase64) {
            throw new Error("No 'image' field in request body.");
        }

        // Decode the image
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
        const matchThreshold = 12; // Minimum good matches to consider it a detection

        if (!descriptors2.empty()) {
            const goodMatchesVector = new cv.DMatchVector();
            bfMatcher.match(templateDescriptors, descriptors2, goodMatchesVector);

            if (goodMatchesVector.size() >= matchThreshold) {
                templateDetected = true;
            }
            goodMatchesVector.delete();
        }

        // Cleanup OpenCV Mats
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