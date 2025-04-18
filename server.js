const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sanitize = require('sanitize-html');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", 'https://restcountries.com', 'https://raw.githubusercontent.com', 'https://cdnjs.cloudflare.com', 'https://flagcdn.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:', 'https://flagcdn.com'],
            connectSrc: ["'self'", 'https://restcountries.com', 'https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com']
        }
    }
}));
app.use(helmet.frameguard({ action: 'DENY' }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGIN || '*'
        : 'http://localhost:8080',
    methods: ['GET']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api', limiter); // Apply rate limiting to API routes only

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
}

// Input validation middleware
const validateCountryName = (req, res, next) => {
    const countryName = req.params.name;
    if (!/^[a-zA-Z0-9\s-]+$/.test(countryName)) {
        return res.status(400).json({ error: 'Invalid country name format' });
    }
    req.params.name = sanitize(countryName, {
        allowedTags: [],
        allowedAttributes: {}
    });
    next();
};

app.get('/api/country/:name', validateCountryName, async (req, res) => {
    const countryName = req.params.name;
    const apiUrl = `https://restcountries.com/v3.1/name/${encodeURIComponent(countryName)}?fullText=true`;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
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

// Serve index.html for all other routes in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
