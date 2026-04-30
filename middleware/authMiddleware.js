const jwt = require('jsonwebtoken');

// 1. Check if user is logged in
exports.authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    // Safety check for Bearer format
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else {
        token = req.cookies?.access_token;
    }

    if (!token) {
        return res.status(401).json({ status: "error", message: "Authentication required" });
    }

    try {
        // IMPORTANT: Ensure this variable name matches your authController sign logic!
        const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        // Distinguish between expired and actually invalid for better debugging
        const message = err.name === 'TokenExpiredError' ? "Token expired" : "Invalid token";
        return res.status(401).json({ status: "error", message });
    }
};

// 2. Check if user has the right role (RBAC)
exports.authorize = (...allowedRoles) => {
    return (req, res, next) => {
        // Ensure authenticate ran first and req.user exists
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ status: "error", message: "Forbidden: Access denied" });
        }
        next();
    };
};