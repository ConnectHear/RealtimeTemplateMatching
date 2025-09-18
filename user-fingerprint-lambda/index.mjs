import { createHash } from 'crypto';
import { UAParser } from 'ua-parser-js';
import { Address4, Address6 } from 'ip-address';
import stringify from 'json-stable-stringify';
import geoip from 'geoip-lite';

function generateUserFingerprint(ipAddress, userAgentString, deviceId = null) {
    const {
        browser: parsedBrowser,
        os: parsedOs,
        device: parsedDevice
    } = UAParser(userAgentString);

    const browser = `${parsedBrowser.name || 'Unknown'} ${parsedBrowser.version || ''}`.trim();
    const os = `${parsedOs.name || 'Unknown'} ${parsedOs.version || ''}`.trim();
    const deviceType = parsedDevice.type || 'desktop';

    let normalizedIp = 'invalid_ip';
    try {
        if (Address4.isValid(ipAddress)) {
            const ipObj = new Address4(ipAddress);
            normalizedIp = ipObj.mask(24);
        } else if (Address6.isValid(ipAddress)) {
            const ipObj = new Address6(ipAddress);
            normalizedIp = ipObj.mask(64);
        }
    } catch (error) {
        console.error(`Could not parse IP address: ${ipAddress}`, error);
    }

    const location = geoip.lookup(ipAddress);
    const locationInfo = {
        country: location?.country || null,
        region: location?.region || null,
        city: location?.city || null,
    };

    const fingerprintSource = {
        ip_subnet: normalizedIp,
        os_family: parsedOs.name,
        browser_family: parsedBrowser.name,
        device_type: deviceType,
        device_id: deviceId,
        country: locationInfo.country,
        region: locationInfo.region,
    };

    const canonicalString = stringify(fingerprintSource);
    const fingerprintHash = createHash('sha256')
        .update(canonicalString, 'utf-8')
        .digest('hex');

    const userFingerprintDoc = {
        fingerprintHash,
        userAgent: userAgentString,
        deviceId: deviceId,
        ipAddress: ipAddress,
        browser,
        os,
        deviceType,
        location: locationInfo,
    };

    return userFingerprintDoc;
}


/**
 * AWS Lambda Handler - This is the main entry point
 */
export const handler = async (event) => {
    let data;
    try {
        data = typeof event.body === 'string' ? JSON.parse(event.body) : event;
    } catch (error) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid JSON in request body." }),
        };
    }

    const { ipAddress, userAgentString, deviceId = null } = data;

    if (!ipAddress || !userAgentString) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Missing required fields: ipAddress and userAgentString." }),
        };
    }

    try {
        const fingerprint = generateUserFingerprint(ipAddress, userAgentString, deviceId);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fingerprint),
        };
    } catch (error) {
        console.error("Error generating fingerprint:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};

// https://tisgwnae62.execute-api.ap-south-1.amazonaws.com/default/generateUserFingerprint
// {
//     "ipAddress": "39.51.121.189",
//     "userAgentString": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1",
//     "deviceId": "ABC-123-XYZ-789"
// }