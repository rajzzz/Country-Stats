// Error handling and logging utility
export function initErrorHandling() {
    window.onerror = function(msg, url, lineNo, columnNo, error) {
        const errorMessage = {
            message: msg,
            url: url,
            line: lineNo,
            column: columnNo,
            error: error?.stack || 'No stack trace'
        };

        console.error('Global error:', errorMessage);
        
        // Show user-friendly error message
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            max-width: 80%;
            text-align: center;
        `;
        errorContainer.textContent = 'An error occurred. Please try refreshing the page.';
        document.body.appendChild(errorContainer);

        // Remove error message after 5 seconds
        setTimeout(() => {
            errorContainer.remove();
        }, 5000);

        return false; // Let default handler run
    };

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection:', event.reason);
        return false;
    });
}

// Function to safely parse JSON with error handling
export function safeJSONParse(json) {
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error('JSON parse error:', e);
        return null;
    }
}

// Function to sanitize strings to prevent XSS
export function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>]/g, '');
}