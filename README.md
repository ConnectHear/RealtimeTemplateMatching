# RealtimeTemplateMatching - Special CNIC Recognition System

This project demonstrates a real-time system for recognizing a specific template (e.g., a special CNIC) in a video stream using OpenCV. The system leverages the SIFT (Scale-Invariant Feature Transform) algorithm for feature detection and FLANN (Fast Library for Approximate Nearest Neighbors) for matching.

## Features
- Real-time video processing with a webcam.
- Template matching using SIFT features.
- Homography computation to detect the template's position and orientation.
- FPS (frames per second) display for performance monitoring.

## Requirements
- Python 3.x
- OpenCV

## Installation

1. Install Python 3.x from [Python.org](https://www.python.org/).
2. Install OpenCV library:
    ```bash
    pip install opencv-python opencv-contrib-python
    ```

## Usage

1. Ensure you have a template image named `template.png` in the working directory.
2. Run the script:

    ```bash
    python template_test_realtime.py
    ```

## Running the JavaScript Version

1.  Make sure you have Node.js installed.
2.  You need a simple HTTP server to run the `index.html` file due to browser security restrictions (accessing webcam, loading OpenCV.js).
3.  Navigate to the project directory in your terminal.
4.  Install a simple server package (if you don't have one):
    ```bash
    npm install -g http-server
    ```
5.  Start the server:
    ```bash
    http-server .
    ```
6.  Open your web browser and go to the URL provided by `http-server` (usually `http://127.0.0.1:8080` or `http://localhost:8080`).
7.  Ensure the `template.png` file is present in the same directory.
8.  Click the "Start Webcam" button.
