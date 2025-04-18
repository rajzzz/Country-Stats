const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sanitize = require('sanitize-html');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(helmet.frameguard({ action: 'DENY' }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] // Replace with your actual domain
        : 'http://localhost:8080',
    methods: ['GET']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Input validation middleware
const validateCountryName = (req, res, next) => {
    const countryName = req.params.name;
    // Only allow alphanumeric characters, spaces, and hyphens
    if (!/^[a-zA-Z0-9\s-]+$/.test(countryName)) {
        return res.status(400).json({ error: 'Invalid country name format' });
    }
    // Sanitize the input
    req.params.name = sanitize(countryName, {
        allowedTags: [],
        allowedAttributes: {}
    });
    next();
};

app.get('/api/country/:name', validateCountryName, async (req, res) => {
    const countryName = req.params.name;
    const apiUrl = `https://data.un.org/ws/rest/v1/country/${encodeURIComponent(countryName)}`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(apiUrl, { 
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
            return res.status(response.status).json({
                error: `Failed to fetch data for ${countryName}`,
                status: response.status
            });
        }
        
        const data = await response.json();
        
        // Sanitize the response data
        const sanitizedData = JSON.parse(sanitize(JSON.stringify(data), {
            allowedTags: [],
            allowedAttributes: {}
        }));
        
        res.json(sanitizedData);
    } catch (error) {
        console.error("Error fetching country stats:", error);
        if (error.name === 'AbortError') {
            return res.status(504).json({ error: 'Request timeout' });
        }
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});
