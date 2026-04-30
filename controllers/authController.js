const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Ensure this points to your Stage 2 database config
const { v7: uuidv7 } = require('uuid');

/**
 * Helper to generate both Access and Refresh tokens
 * Note: Uses names matching typical Stage 3 .env patterns
 */
const generateTokens = (user) => {
    const payload = { id: user.id, role: user.role };
    
    // Access Token: Short-lived (3 mins)
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '3m' });
    
    // Refresh Token: Slightly longer (5 mins)
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
    
    return { accessToken, refreshToken };
};

/**
 * GitHub OAuth Callback
 * Handles: Code exchange, User Profile fetch, and DB Upsert
 */
exports.githubCallback = async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ status: 'error', message: 'No code provided from GitHub' });
    }

    try {
        // 1. Exchange temporary code for GitHub Access Token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
        }, { headers: { Accept: 'application/json' } });

        const ghToken = tokenResponse.data.access_token;

        if (!ghToken) {
            return res.status(400).json({ status: 'error', message: 'Invalid GitHub code or secret' });
        }

        // 2. Fetch User Profile from GitHub API
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${ghToken}` }
        });

        const { id: github_id, login: username, email, avatar_url } = userResponse.data;

        // 3. Database "Upsert" (Find or Create)
        let userResult = await pool.query('SELECT * FROM users WHERE github_id = $1', [github_id.toString()]);

        let user;
        if (userResult.rows.length === 0) {
            // New user: Insert them
            const newUser = await pool.query(
                'INSERT INTO users (id, github_id, username, email, avatar_url, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [uuidv7(), github_id.toString(), username, email || null, avatar_url, 'analyst']
            );
            user = newUser.rows[0];
        } else {
            // Existing user: Just use their data
            user = userResult.rows[0];
        }

        // 4. Generate Insighta Labs+ JWTs
        const tokens = generateTokens(user);

        // 5. Send tokens to client
        res.json({ status: 'success', ...tokens });

    } catch (error) {
        console.error("Auth Error:", error.message);
        res.status(500).json({ status: 'error', message: "Internal Server Error during authentication" });
    }
};

/**
 * Refresh Token Route
 * Allows user to get a new Access Token without logging in again
 */
exports.refreshToken = async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ status: "error", message: "Refresh token is required" });
    }

    try {
        const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);

        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.status(403).json({ status: "error", message: "User no longer exists" });
        }

        const tokens = generateTokens(user);
        res.json({ status: "success", ...tokens });

    } catch (err) {
        res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }
};

/**
 * Logout Route
 * Clears cookies (used for the Web Portal portion)
 */
exports.logout = (req, res) => {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.json({ status: "success", message: "Logged out successfully" });
};