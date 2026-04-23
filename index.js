const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

/**
 * 1. HELPER: Improved Natural Language Parser
 * Fixes the 500 errors and adds missing keyword logic.
 */
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    let filters = {};

    // Gender logic
    if (text.includes('females') || text.includes('female')) filters.gender = 'female';
    else if (text.includes('males') || text.includes('male')) filters.gender = 'male';

    // Age Group logic
    if (text.includes('teenager')) filters.age_group = 'teenager';
    if (text.includes('adult')) filters.age_group = 'adult';
    if (text.includes('senior')) filters.age_group = 'senior';
    if (text.includes('child')) filters.age_group = 'child';

    // "Young" rule: 16-24
    if (text.includes('young')) {
        filters.min_age = 16;
        filters.max_age = 24;
    }

    // "Above X" logic
    const aboveMatch = text.match(/above\s+(\d+)/);
    if (aboveMatch) {
        filters.min_age = parseInt(aboveMatch[1]);
    }

    // Country Mapping (Expand this list based on the seeding file)
    const countryMap = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'benin': 'BJ', 'ghana': 'GH' };
    for (const [name, code] of Object.entries(countryMap)) {
        if (text.includes(name)) filters.country_id = code;
    }

    return Object.keys(filters).length > 0 ? filters : null;
};

/**
 * 2. MAIN ENDPOINT: Profiles
 */
app.get('/api/profiles', async (req, res) => {
    try {
        let { 
            gender, age_group, country_id, min_age, max_age, 
            min_gender_probability, min_country_probability,
            sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
        } = req.query;

        // --- STRICT ERROR VALIDATION ---
        const allowedSort = ['age', 'created_at', 'gender_probability'];
        if (sort_by && !allowedSort.includes(sort_by)) {
            return res.status(400).json({ status: "error", message: "Invalid query parameters" });
        }

        // --- PAGINATION SANITIZATION ---
        const pageInt = parseInt(page) || 1;
        const limitInt = Math.min(parseInt(limit) || 10, 50);
        const offset = (pageInt - 1) * limitInt;

        let conditions = [];
        let params = [];

        // --- FILTER BUILDING (STRICT AND LOGIC) ---
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
        
        // --- DATA RETRIEVAL ---
        const countRes = await db.query(`SELECT COUNT(*) FROM profiles ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].count);

        const queryText = `
            SELECT * FROM profiles ${whereClause} 
            ORDER BY ${sort_by} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'} 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const result = await db.query(queryText, [...params, limitInt, offset]);

        // --- EXACT RESPONSE ENVELOPE ---
        // Do not return 404 for empty data; return status "success" with empty array
        return res.status(200).json({
            status: "success",
            page: pageInt,
            limit: limitInt,
            total: total,
            data: result.rows
        });

    } catch (err) {
        return res.status(500).json({ status: "error", message: "Server failure" });
    }
});

/**
 * 3. SEARCH ENDPOINT
 */
app.get('/api/profiles/search', async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ status: "error", message: "Invalid query parameters" });
    }

    const filters = parseNLQ(q);
    if (!filters) {
        // EXACT ERROR MESSAGE FROM BRIEF
        return res.status(400).json({ status: "error", message: "Unable to interpret query" });
    }

    // Merge filters and forward to the main profile logic
    req.query = { ...req.query, ...filters };
    
    // Instead of redirecting internally which causes context issues, 
    // it's safer to call a shared function or just let the logic repeat.
    // To keep it simple for your fix, we'll manually trigger the profiles logic:
    return app._router.handle(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Live on ${PORT}`));
