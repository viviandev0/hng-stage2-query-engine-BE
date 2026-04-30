const express = require('express');
const cors = require('cors');
const db = require('./db');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// 1. IMPORT AUTH LOGIC
const authRoutes = require('./routes/authRoutes');
const { authenticate, authorize } = require('./middleware/authMiddleware');

const app = express();
app.set('trust proxy', 1);

// --- 2. LOGGING MIDDLEWARE (Required for Stage 3) ---
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

app.use(cors());
app.use(express.json());

// --- 3. RATE LIMITERS (Required for Stage 3) ---
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 10,
    message: { status: "error", message: "Too many login attempts, try again later" }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { status: "error", message: "Rate limit exceeded" }
});

// Apply limiters
app.use('/auth', authLimiter);
app.use('/api', apiLimiter);

// --- 4. ROUTES ---
app.use('/auth', authRoutes);

/**
 * HELPER: Natural Language Parser (Stage 2 logic)
 */
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    let filters = {};
    if (text.includes('females') || text.includes('female')) filters.gender = 'female';
    else if (text.includes('males') || text.includes('male')) filters.gender = 'male';
    if (text.includes('teenager')) filters.age_group = 'teenager';
    if (text.includes('adult')) filters.age_group = 'adult';
    if (text.includes('senior')) filters.age_group = 'senior';
    if (text.includes('child')) filters.age_group = 'child';
    if (text.includes('young')) { filters.min_age = 16; filters.max_age = 24; }
    const aboveMatch = text.match(/above\s+(\d+)/);
    if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);
    const countryMap = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'benin': 'BJ', 'ghana': 'GH' };
    for (const [name, code] of Object.entries(countryMap)) {
        if (text.includes(name)) filters.country_id = code;
    }
    return Object.keys(filters).length > 0 ? filters : null;
};

/**
 * 5. PROTECTED MAIN ENDPOINT: Profiles
 */
app.get('/api/profiles', authenticate, async (req, res) => {
    // STAGE 3 REQUIREMENT: Check for X-API-Version header
    if (req.headers['x-api-version'] !== '1') {
        return res.status(400).json({ status: "error", message: "API version header required" });
    }

    try {
        let { 
            gender, age_group, country_id, min_age, max_age, 
            min_gender_probability, min_country_probability,
            sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
        } = req.query;

        const allowedSort = ['age', 'created_at', 'gender_probability'];
        if (sort_by && !allowedSort.includes(sort_by)) {
            return res.status(400).json({ status: "error", message: "Invalid query parameters" });
        }

        const pageInt = parseInt(page) || 1;
        const limitInt = Math.min(parseInt(limit) || 10, 50);
        const offset = (pageInt - 1) * limitInt;

        let conditions = [];
        let params = [];

        const addFilter = (val, col, operator = '=') => {
            if (val !== undefined && val !== '') {
                params.push(val);
                conditions.push(`${col} ${operator} $${params.length}`);
            }
        };

        addFilter(gender, 'gender');
        addFilter(age_group, 'age_group');
        addFilter(country_id?.toUpperCase(), 'country_id');
        addFilter(min_age, 'age', '>=');
        addFilter(max_age, 'age', '<=');
        addFilter(min_gender_probability, 'gender_probability', '>=');
        addFilter(min_country_probability, 'country_probability', '>=');

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const countRes = await db.query(`SELECT COUNT(*) FROM profiles ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].count);
        const totalPages = Math.ceil(total / limitInt);

        const queryText = `
            SELECT * FROM profiles ${whereClause} 
            ORDER BY ${sort_by} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'} 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const result = await db.query(queryText, [...params, limitInt, offset]);

        return res.status(200).json({
            status: "success",
            page: pageInt,
            limit: limitInt,
            total: total,
            total_pages: totalPages,
            links: {
                self: `/api/profiles?page=${pageInt}&limit=${limitInt}`,
                next: pageInt < totalPages ? `/api/profiles?page=${pageInt + 1}&limit=${limitInt}` : null,
                prev: pageInt > 1 ? `/api/profiles?page=${pageInt - 1}&limit=${limitInt}` : null
            },
            data: result.rows
        });

    } catch (err) {
        return res.status(500).json({ status: "error", message: "Server failure" });
    }
});

/**
 * 6. PROTECTED SEARCH ENDPOINT
 */
app.get('/api/profiles/search', authenticate, async (req, res) => {
    if (req.headers['x-api-version'] !== '1') {
        return res.status(400).json({ status: "error", message: "API version header required" });
    }
    const { q } = req.query;
    if (!q) return res.status(400).json({ status: "error", message: "Invalid query parameters" });

    const filters = parseNLQ(q);
    if (!filters) return res.status(400).json({ status: "error", message: "Unable to interpret query" });

    req.query = { ...req.query, ...filters };
    return app._router.handle(req, res);
});

/**
 * 7. ADMIN ONLY: Create a new profile
 */
app.post('/api/profiles', authenticate, authorize('admin'), async (req, res) => {
    if (req.headers['x-api-version'] !== '1') {
        return res.status(400).json({ status: "error", message: "API version header required" });
    }
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ status: "error", message: "Name is required" });

        // Logic here: Link Stage 1 logic to call APIs and save to DB
        res.status(201).json({ status: "success", message: "Profile created (Logic to be linked)" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Failed to create profile" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Insighta Labs+ Backend Live on ${PORT}`));