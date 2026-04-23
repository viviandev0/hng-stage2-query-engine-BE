const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

/**
 * HELPER: Ensures numbers are returned as integers, not strings.
 * This fixes the "pagination envelope invalid" error.
 */
const toNum = (val, fallback) => {
    const parsed = parseInt(val);
    return isNaN(parsed) ? fallback : parsed;
};

/**
 * CORE LOGIC: Reusable function to fetch data from DB.
 * Shared by both /api/profiles and /api/profiles/search.
 */
async function fetchProfiles(filters, res) {
    try {
        let { 
            gender, age_group, country_id, min_age, max_age, 
            min_gender_probability, min_country_probability,
            sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
        } = filters;

        // Requirement: Strict Sorting Validation
        const allowedSort = ['age', 'created_at', 'gender_probability'];
        if (sort_by && !allowedSort.includes(sort_by)) {
            return res.status(400).json({ status: "error", message: "Invalid query parameters" });
        }

        const p = toNum(page, 1);
        const l = Math.min(toNum(limit, 10), 50);
        const offset = (p - 1) * l;

        let conds = [];
        let params = [];

        // Helper to add AND conditions safely
        const add = (val, col, op = '=') => {
            if (val !== undefined && val !== null && val !== '') {
                params.push(val);
                conds.push(`${col} ${op} $${params.length}`);
            }
        };

        if (gender) add(gender.toLowerCase(), 'gender');
        if (age_group) add(age_group.toLowerCase(), 'age_group');
        if (country_id) add(country_id.toUpperCase(), 'country_id');
        if (min_age) add(toNum(min_age), 'age', '>=');
        if (max_age) add(toNum(max_age), 'age', '<=');
        if (min_gender_probability) add(parseFloat(min_gender_probability), 'gender_probability', '>=');
        if (min_country_probability) add(parseFloat(min_country_probability), 'country_probability', '>=');

        const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
        
        // Get Total Count for Pagination
        const countResult = await db.query(`SELECT COUNT(*) FROM profiles ${where}`, params);
        const totalCount = toNum(countResult.rows[0].count, 0);

        // Fetch Data
        const dataResult = await db.query(`
            SELECT * FROM profiles ${where} 
            ORDER BY ${sort_by} ${order.toLowerCase() === 'asc' ? 'ASC' : 'DESC'} 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, l, offset]);

        // SUCCESS ENVELOPE: Explicit integers for page, limit, total
        return res.status(200).json({
            status: "success",
            page: p,
            limit: l,
            total: totalCount,
            data: dataResult.rows
        });
    } catch (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ status: "error", message: "Server failure" });
    }
}

// 📡 Standard Filtering Endpoint
app.get('/api/profiles', (req, res) => fetchProfiles(req.query, res));

// 📡 Natural Language Search Endpoint
app.get('/api/profiles/search', (req, res) => {
    const { q, page, limit } = req.query;
    if (!q || q.trim() === "") {
        return res.status(400).json({ status: "error", message: "Invalid query parameters" });
    }

    const text = q.toLowerCase();
    let f = { page, limit };

    // 1. Gender keywords
    if (text.includes('female')) f.gender = 'female';
    else if (text.includes('male')) f.gender = 'male';

    // 2. Special keywords ("young" = 16-24)
    if (text.includes('young')) { f.min_age = 16; f.max_age = 24; }

    // 3. Age groups
    ['teenager', 'adult', 'senior', 'child'].forEach(g => {
        if (text.includes(g)) f.age_group = g;
    });

    // 4. "Above X" regex
    const above = text.match(/above\s+(\d+)/);
    if (above) f.min_age = above[1];

    // 5. Country mappings
    const cMap = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'ghana': 'GH', 'benin': 'BJ' };
    Object.keys(cMap).forEach(name => {
        if (text.includes(name)) f.country_id = cMap[name];
    });

    // Check if we managed to parse any demographic filters
    const hasFilters = Object.keys(f).some(key => key !== 'page' && key !== 'limit');
    if (!hasFilters) {
        return res.status(400).json({ status: "error", message: "Unable to interpret query" });
    }

    return fetchProfiles(f, res);
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Engine active on ${PORT}`));
