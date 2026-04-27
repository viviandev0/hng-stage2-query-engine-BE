const axios = require('axios');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Your Stage 2 DB connection
const { v7: uuidv7 } = require('uuid');

const generateTokens = (user) => {
    const payload = { id: user.id, role: user.role };
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '3m' });
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '5m' });
    return { accessToken, refreshToken };
};

exports.githubCallback = async (req, res) => {
    const { code, code_verifier } = req.query; // code_verifier comes from CLI/Web

    try {
        // 1. Exchange code for GitHub Access Token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
            // code_verifier, // Used if implementing PKCE strictly on backend
        }, { headers: { Accept: 'application/json' } });

        const ghToken = tokenResponse.data.access_token;

        // 2. Get User Info from GitHub
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${ghToken}` }
        });

        const { id: github_id, login: username, email, avatar_url } = userResponse.data;

        // 3. Check if user exists in DB, or create them
        // Check if user exists first
        const existingUser = await pool.query('SELECT * FROM users WHERE github_id = $1', [githubData.id]);

        if (existingUser.rows.length > 0) {
            // UPDATE existing user (so they can log in again)
            const user = existingUser.rows[0];
            // Generate tokens for this user...
        } else {
            // INSERT new user
            // Generate tokens for new user...
        }
        let user = await pool.query('SELECT * FROM users WHERE github_id = $1', [github_id.toString()]);

        if (user.rows.length === 0) {
            const newUser = await pool.query(
                'INSERT INTO users (id, github_id, username, email, avatar_url, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [uuidv7(), github_id.toString(), username, email, avatar_url, 'analyst']
            );
            user = newUser;
        }

        // 4. Issue Insighta Tokens
        const tokens = generateTokens(user.rows[0]);

        // 5. Send back to user (or set cookies for Web)
        res.json({ status: 'success', ...tokens });

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
};

// --- REFRESH TOKEN LOGIC ---
exports.refreshToken = async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ status: "error", message: "Refresh token required" });
    }

    try {
        // 1. Verify the refresh token
        const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);

        // 2. Find user in DB to ensure they still exist/are active
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        const user = userRes.rows[0];

        if (!user || !user.is_active) {
            return res.status(403).json({ status: "error", message: "User inactive or not found" });
        }

        // 3. Issue a FRESH pair (Rotation)
        const tokens = generateTokens(user);

        res.json({ status: "success", ...tokens });
    } catch (err) {
        // If token is expired or fake
        res.status(401).json({ status: "error", message: "Invalid or expired refresh token" });
    }
};

// --- LOGOUT LOGIC ---
exports.logout = (req, res) => {
    // On the backend, we don't necessarily "delete" the JWT (since it's stateless)
    // But for the Web Portal, we clear the cookies.
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    
    res.json({ status: "success", message: "Logged out successfully" });
};