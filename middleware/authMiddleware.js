const jwt = require('jsonwebtoken');

// 1. Check if user is logged in
exports.authenticate = (req, res, next) => {
    // Get token from Header (for CLI) or Cookie (for Web)
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.split(' ')[1] : req.cookies?.access_token;

    if (!token) {
        return res.status(401).json({ status: "error", message: "Authentication required" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded; // Attach user info (id, role) to the request
        next();
    } catch (err) {
        return res.status(401).json({ status: "error", message: "Invalid or expired token" });
    }
};

// 2. Check if user has the right role (RBAC)
exports.authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ status: "error", message: "Forbidden: Access denied" });
        }
        next();
    };
};