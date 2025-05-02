document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('videoInput');
    const canvasOutput = document.getElementById('canvasOutput');
    const statusDiv = document.getElementById('status');
    const fpsDiv = document.getElementById('fps');
    const startButton = document.getElementById('startButton');
    const container = document.getElementById('container');

    let stream = null;
    let isProcessing = false;
    let animationFrameId = null;
    let lastTime = 0;
    let frameCount = 0;

    // --- Initialization ---
    statusDiv.textContent = 'Status: Loading OpenCV.js...';
    loadOpenCv(() => {
        statusDiv.textContent = 'Status: OpenCV.js loaded. Initializing Template Matcher...';
        // Ensure template.png is accessible (e.g., in the same directory or provide a full URL)
        initTemplateMatcher('template.png')
            .then(() => {
                statusDiv.textContent = 'Status: Ready. Click Start Webcam.';
                startButton.disabled = false;
            })
            .catch(error => {
                statusDiv.textContent = `Status: Error initializing matcher - ${error}`;
                console.error('Initialization error:', error);
            });
    });

    // --- Event Listeners ---
    startButton.addEventListener('click', async () => {
        if (!isProcessing) {
            await startWebcam();
        } else {
            stopWebcam();
        }
    });

    // --- Webcam and Processing Logic ---
    async function startWebcam() {
        try {
            statusDiv.textContent = 'Status: Requesting webcam access...';
            stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
            videoElement.srcObject = stream;
            videoElement.style.display = 'block'; // Show video element for debugging if needed
            videoElement.play();

            videoElement.onloadedmetadata = () => {
                statusDiv.textContent = 'Status: Webcam started. Processing...';
                isProcessing = true;
                startButton.textContent = 'Stop Webcam';
                lastTime = performance.now();
                frameCount = 0;
                requestAnimationFrame(processLoop);
            };

        } catch (err) {
            statusDiv.textContent = `Status: Error accessing webcam - ${err.message}`;
            console.error('Webcam access error:', err);
        }
    }

    function stopWebcam() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        videoElement.srcObject = null;
        videoElement.style.display = 'none';
        isProcessing = false;
        startButton.textContent = 'Start Webcam';
        statusDiv.textContent = 'Status: Webcam stopped.';
        // Optionally clear the canvas
        const ctx = canvasOutput.getContext('2d');
        ctx.clearRect(0, 0, canvasOutput.width, canvasOutput.height);
        fpsDiv.textContent = 'FPS: 0.00';
    }

    function processLoop(currentTime) {
        if (!isProcessing || videoElement.paused || videoElement.ended) {
            return; // Stop the loop if processing is stopped or video issues
        }

        try {
            const result = processVideoFrame(videoElement, canvasOutput);
            if (result) {
                // Update status based on detection (optional)
                // statusDiv.textContent = `Status: ${result.templateDetected ? 'Detected' : 'Searching'} (Count: ${result.detectionCount})`;
            } else {
                // Handle cases where processing might fail (e.g., matcher not ready)
                // statusDiv.textContent = 'Status: Processing error or not ready.';
            }

            // Calculate FPS
            frameCount++;
            const deltaTime = (currentTime - lastTime) / 1000; // Time in seconds
            if (deltaTime >= 1) {
                const currentFps = frameCount / deltaTime;
                fpsDiv.textContent = `FPS: ${currentFps.toFixed(2)}`;
                lastTime = currentTime;
                frameCount = 0;
            }

        } catch (error) {
            console.error('Error during processing loop:', error);
            statusDiv.textContent = `Status: Runtime error - ${error.message}`;
            stopWebcam(); // Stop processing on error
            return;
        }

        animationFrameId = requestAnimationFrame(processLoop);
    }

    // --- Cleanup on page unload ---
    window.addEventListener('beforeunload', () => {
        stopWebcam();
        cleanupMatcher(); // Call cleanup from templateMatcher.js
    });
});