// Utility for real-time template matching using OpenCV.js

// Function to load OpenCV.js
async function loadOpenCv(onloadCallback) {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js'; // Use official OpenCV.js URL
    script.async = true;
    script.defer = true;
    script.onload = () => {
        cv['onRuntimeInitialized'] = () => {
            console.log('OpenCV.js loaded successfully.');
            onloadCallback();
        };
    };
    script.onerror = () => {
        console.error('Failed to load OpenCV.js');
    };
    document.body.appendChild(script);
}

// --- Template Matching Logic (to be implemented) ---

let templateMat = null;
let templateDescriptors = null;
let templateKeypoints = null;
let orb = null;
let bfMatcher = null;
let prevDst = null; // Previous detected region corners
let detectionCount = 0;
const detectionThreshold = 3; // Number of frames the detection must persist
const alpha = 0.5; // Smoothing factor
const matchThreshold = 12; // Minimum good matches

// Function to initialize the template matcher
async function initTemplateMatcher(templateImageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Handle potential CORS issues if template is hosted
        img.onload = () => {
            templateMat = cv.imread(img);
            if (templateMat.empty()) {
                console.error('Failed to load template image into cv.Mat');
                reject('Failed to load template image.');
                return;
            }
            const templateGray = new cv.Mat();
            cv.cvtColor(templateMat, templateGray, cv.COLOR_RGBA2GRAY);

            // Initialize ORB detector (SIFT might not be available in standard builds)
            orb = new cv.ORB(5000); // Match nfeatures from Python
            templateKeypoints = new cv.KeyPointVector();
            templateDescriptors = new cv.Mat();
            orb.detectAndCompute(templateGray, new cv.Mat(), templateKeypoints, templateDescriptors);

            if (templateDescriptors.empty()) {
                console.error('No descriptors found in the template image.');
                reject('No features found in template.');
                templateGray.delete();
                return;
            }

            // Initialize Brute-Force Matcher (alternative to FLANN for ORB)
            bfMatcher = new cv.BFMatcher(cv.NORM_HAMMING, true); // Use NORM_HAMMING for ORB

            console.log('Template Matcher Initialized.');
            templateGray.delete();
            resolve();
        };
        img.onerror = (err) => {
            console.error('Error loading template image:', err);
            reject('Error loading template image.');
        };
        img.src = templateImageUrl;
    });
}

// Function to process a video frame
function processVideoFrame(videoElement, outputCanvas) {
    if (!templateMat || !orb || !bfMatcher) {
        console.warn('Template matcher not initialized.');
        return null; // Indicate not ready or error
    }

    const cap = new cv.VideoCapture(videoElement);
    const frame = new cv.Mat(videoElement.videoHeight, videoElement.videoWidth, cv.CV_8UC4);
    cap.read(frame); // Read frame from video element

    if (frame.empty()) {
        console.warn('Empty frame captured.');
        frame.delete();
        return null;
    }

    const frameGray = new cv.Mat();
    cv.cvtColor(frame, frameGray, cv.COLOR_RGBA2GRAY);

    const keypoints2 = new cv.KeyPointVector();
    const descriptors2 = new cv.Mat();
    orb.detectAndCompute(frameGray, new cv.Mat(), keypoints2, descriptors2);

    let templateDetected = false;
    let currentDst = null;
    let processedFrame = frame.clone(); // Clone frame for drawing

    if (!descriptors2.empty()) {
        const matches = new cv.DMatchVectorVector();
        // bfMatcher.knnMatch(templateDescriptors, descriptors2, matches, 2); // KNN not needed for BFMatcher with crossCheck=true
        const goodMatchesVector = new cv.DMatchVector();
        bfMatcher.match(templateDescriptors, descriptors2, goodMatchesVector);

        // --- Refine matching if needed (e.g., ratio test if using knnMatch) ---
        // For BFMatcher with crossCheck=true, all matches are potentially good.
        // We can filter by distance if necessary.
        const goodMatches = [];
        for (let i = 0; i < goodMatchesVector.size(); i++) {
            // Add distance filtering if needed: e.g., if (goodMatchesVector.get(i).distance < some_threshold)
            goodMatches.push(goodMatchesVector.get(i));
        }

        templateDetected = goodMatches.length >= matchThreshold;

        if (templateDetected) {
            // Extract matched keypoints
            const srcPts = [];
            const dstPts = [];
            for (let i = 0; i < goodMatches.length; i++) {
                srcPts.push(templateKeypoints.get(goodMatches[i].queryIdx).pt.x);
                srcPts.push(templateKeypoints.get(goodMatches[i].queryIdx).pt.y);
                dstPts.push(keypoints2.get(goodMatches[i].trainIdx).pt.x);
                dstPts.push(keypoints2.get(goodMatches[i].trainIdx).pt.y);
            }

            const srcMat = cv.matFromArray(srcPts.length / 2, 1, cv.CV_32FC2, srcPts);
            const dstMat = cv.matFromArray(dstPts.length / 2, 1, cv.CV_32FC2, dstPts);

            // Compute Homography
            const M = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5.0);

            if (!M.empty()) {
                // Get template corners
                const h = templateMat.rows;
                const w = templateMat.cols;
                const ptsArray = [0, 0, 0, h - 1, w - 1, h - 1, w - 1, 0];
                const pts = cv.matFromArray(4, 1, cv.CV_32FC2, ptsArray);
                const dst = new cv.Mat();

                cv.perspectiveTransform(pts, dst, M);

                // Convert dst Mat to array for easier handling
                currentDst = [];
                for (let i = 0; i < 4; i++) {
                    currentDst.push({ x: dst.data32F[i * 2], y: dst.data32F[i * 2 + 1] });
                }

                // Smooth the detected region
                if (prevDst) {
                    const smoothedDst = [];
                    for (let i = 0; i < 4; i++) {
                        smoothedDst.push({
                            x: alpha * currentDst[i].x + (1 - alpha) * prevDst[i].x,
                            y: alpha * currentDst[i].y + (1 - alpha) * prevDst[i].y
                        });
                    }
                    currentDst = smoothedDst;
                }

                // Draw the detected region if detection count is sufficient
                if (detectionCount > detectionThreshold) {
                    const points = [];
                    currentDst.forEach(p => points.push(new cv.Point(p.x, p.y)));
                    const contours = new cv.MatVector();
                    const contour = cv.matFromArray(points.length, 1, cv.CV_32SC2, points.flatMap(p => [p.x, p.y]));
                    contours.push_back(contour);
                    cv.polylines(processedFrame, contours, true, [0, 255, 0, 255], 2, cv.LINE_AA);
                    contours.delete();
                    contour.delete();
                }

                pts.delete();
                dst.delete();
            }
            srcMat.delete();
            dstMat.delete();
            M.delete();
        }
        matches.delete();
        goodMatchesVector.delete();
    }

    // Update detection count
    if (templateDetected && currentDst) {
        detectionCount++;
        prevDst = currentDst; // Store the corners (array of points)
    } else {
        detectionCount = 0;
        prevDst = null;
    }

    // Display detection status
    if (detectionCount >= detectionThreshold) {
        cv.putText(processedFrame, 'Special CNIC detected!', { x: 30, y: 60 }, cv.FONT_HERSHEY_SIMPLEX, 0.8, [0, 255, 0, 255], 2);
    }

    // Display the processed frame on the canvas
    cv.imshow(outputCanvas, processedFrame);

    // Cleanup
    frame.delete();
    frameGray.delete();
    keypoints2.delete();
    descriptors2.delete();
    processedFrame.delete();

    return { templateDetected, detectionCount };
}

// Function to cleanup OpenCV resources
function cleanupMatcher() {
    if (templateMat) templateMat.delete();
    if (templateDescriptors) templateDescriptors.delete();
    if (templateKeypoints) templateKeypoints.delete();
    if (orb) orb.delete(); // Assuming orb has a delete method or similar cleanup
    if (bfMatcher) bfMatcher.delete(); // Assuming matcher has a delete method
    console.log('Matcher resources cleaned up.');
}

// Export functions (if using modules)
// export { loadOpenCv, initTemplateMatcher, processVideoFrame, cleanupMatcher };