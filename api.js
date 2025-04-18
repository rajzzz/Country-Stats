// Rate limiting configuration
const rateLimiter = {
    tokens: 5,
    refillRate: 1000, // 1 token per second
    lastRefill: Date.now(),
    bucket: 5, // Start with full bucket
};

// Token bucket rate limiting implementation
function checkRateLimit() {
    const now = Date.now();
    const timePassed = now - rateLimiter.lastRefill;
    const refillAmount = Math.floor(timePassed / rateLimiter.refillRate);
    
    if (refillAmount > 0) {
        rateLimiter.bucket = Math.min(rateLimiter.tokens, rateLimiter.bucket + refillAmount);
        rateLimiter.lastRefill = now;
    }

    if (rateLimiter.bucket <= 0) {
        throw new Error('Rate limit exceeded. Please try again later.');
    }

    rateLimiter.bucket--;
}

export async function fetchCountryStats(countryName) {
    // Input validation
    if (!countryName || typeof countryName !== 'string') {
        throw new Error('Invalid country name');
    }

    // Check rate limit before making request
    checkRateLimit();

    // Sanitize input - only allow letters, numbers, spaces and hyphens
    if (!/^[a-zA-Z0-9\s-]+$/.test(countryName)) {
        throw new Error('Invalid country name format');
    }

    const apiUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(apiUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            },
            referrerPolicy: 'no-referrer'
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`Failed to fetch data for ${countryName}: ${response.statusText}`);
        }

        const jsonData = await response.json();
        
        // Validate response structure
        if (!Array.isArray(jsonData) || !jsonData.length || !jsonData[0]) {
            throw new Error('Invalid response format');
        }

        // Basic data sanitization
        const sanitizedData = jsonData[0];
        if (typeof sanitizedData !== 'object') {
            throw new Error('Invalid data format');
        }

        return sanitizedData;
    } catch (error) {
        console.error("Error fetching country stats:", error);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        return null;
    }
}
