import { createHash } from 'crypto'
import { UAParser } from 'ua-parser-js';
import { Address4, Address6 } from 'ip-address';
import stringify from 'json-stable-stringify';

/**
 * Generates a UserFingerprint object and a stable hash from user information.
 * This is a plain JavaScript function with no TypeScript.
 *
 * @param {string} ipAddress The user's IP address.
 * @param {string} userAgentString The user's full user agent string.
 * @param {string | null} [deviceId=null] (Optional) A unique device identifier.
 * @returns {object} An object representing the UserFingerprint document for MongoDB.
 */
function generateUserFingerprint(ipAddress, userAgentString, deviceId = null) {
    // Parse the user agent string
    const {
        browser: parsedBrowser,
        os: parsedOs,
        device: parsedDevice
    } = UAParser(userAgentString);

    // Create the full descriptive strings for the final document
    const browser = `${parsedBrowser.name || 'Unknown'} ${parsedBrowser.version || ''}`.trim();
    const os = `${parsedOs.name || 'Unknown'} ${parsedOs.version || ''}`.trim();
    const deviceType = parsedDevice.type || 'desktop';

    // Normalize the IP Address to its network subnet
    let normalizedIp = 'invalid_ip';
    try {
        if (Address4.isValid(ipAddress)) {
            const ipObj = new Address4(ipAddress);
            // CORRECTED: .mask() returns an object, we need its .address property
            normalizedIp = ipObj.mask(24);
        } else if (Address6.isValid(ipAddress)) {
            const ipObj = new Address6(ipAddress);
            normalizedIp = ipObj.mask(64);
        }
    } catch (error) {
        console.error(`Could not parse IP address: ${ipAddress}`);
    }

    // Select the most stable components to create the hash
    const fingerprintSource = {
        ip_subnet: normalizedIp,
        os_family: parsedOs.name,
        browser_family: parsedBrowser.name,
        device_type: deviceType,
        device_id: deviceId,
    };

    // Create a consistent, sorted JSON string for hashing
    const canonicalString = stringify(fingerprintSource) || '';

    // Create the final SHA-256 hash
    const fingerprintHash = createHash('sha256')
        .update(canonicalString, 'utf-8')
        .digest('hex');

    // Assemble the final document to be saved
    const userFingerprintDoc = {
        fingerprintHash,
        userAgent: userAgentString,
        deviceId: deviceId,
        ipAddress: ipAddress,
        browser,
        os,
        deviceType,
    };

    return userFingerprintDoc;
}

console.log("--- Running User Fingerprint Tests ---");

const requestData1 = {
    ipAddress: "198.51.100.123",
    userAgentString: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    deviceId: null
};

const requestData2 = {
    ipAddress: "198.51.100.201", // Same user, different IP in the same subnet
    userAgentString: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    deviceId: null
};

const requestData3 = {
    ipAddress: "203.0.113.55", // Different user on mobile
    userAgentString: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
    deviceId: "ABC-123-XYZ-789"
};

const fingerprint1 = generateUserFingerprint(requestData1.ipAddress, requestData1.userAgentString, requestData1.deviceId);
const fingerprint2 = generateUserFingerprint(requestData2.ipAddress, requestData2.userAgentString, requestData2.deviceId);
const fingerprint3 = generateUserFingerprint(requestData3.ipAddress, requestData3.userAgentString, requestData3.deviceId);

console.log("\n--- Fingerprint 1 (Original User) ---");
console.log(fingerprint1);

console.log("\n--- Fingerprint 2 (Same User, New IP) ---");
console.log(fingerprint2);

console.log("\n--- Fingerprint 3 (Different User) ---");
console.log(fingerprint3);

console.log(`\nHash 1 == Hash 2: ${fingerprint1.fingerprintHash === fingerprint2.fingerprintHash}`); // Should be true
console.log(`Hash 1 == Hash 3: ${fingerprint1.fingerprintHash === fingerprint3.fingerprintHash}`); // Should be false


// const ipAddress = req.ip; // Express gets the real IP address
//     const userAgentString = req.headers['user-agent'] || ''; // The browser's user agent
//     const deviceId = req.headers['x-device-id'] || null; // A custom header from a mobile app, if you have one

//     const newFingerprintData = generateUserFingerprint(ipAddress, userAgentString, deviceId);
//     const newHash = newFingerprintData.fingerprintHash;
//     console.log(`Generated fingerprint hash: ${newHash}`);