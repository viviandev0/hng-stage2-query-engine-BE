const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

/**
 * 1. HELPER: Natural Language Parser
 * Converts "Who are the males in Kenya?" into structured filters.
 */
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    let filters = {};

    if (text.includes('female')) filters.gender = 'female';
    else if (text.includes('male')) filters.gender = 'male';

    if (text.includes('child')) filters.age_group = 'child';
    if (text.includes('teenager')) filters.age_group = 'teenager';
    if (text.includes('adult')) filters.age_group = 'adult';
    if (text.includes('senior')) filters.age_group = 'senior';

    const countryMap = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'ghana': 'GH', 'benin': 'BJ' };
    for (const [name, code] of Object.entries(countryMap)) {
        if (text.includes(name)) filters.country_id = code;
    }

    return Object.keys(filters).length > 0 ? filters : null;
};

/**
 * 2. MAIN ENDPOINT: Profiles (Filtering, Sorting, Pagination)
 * Handles Section 1 requirements: Positive, Negative, and Boundary cases.
 */
app.get('/api/profiles', async (req, res) => {
    try {
        let { 
            name, gender, age, age_group, country_id, min_age, max_age, 
            sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
        } = req.query;

        // --- BOUNDARY & PAGINATION LOGIC ---
        page = Math.max(1, parseInt(page));
        limit = Math.min(Math.max(1, parseInt(limit)), 50); // Cap at 50 to prevent DoS
        const offset = (page - 1) * limit;

        let conditions = [];
        let params = [];

        // --- NAME FILTER (Normalization & Partial Match) ---
        if (name) { 
            const normalizedName = name.trim().toLowerCase();
            params.push(`%${normalizedName}%`); 
            conditions.push(`LOWER(name) LIKE $${params.length}`); 
        }

        // --- AGE FILTER (Strict Integer Validation) ---
        if (age) {
            const ageInt = parseInt(age);
            if (isNaN(ageInt)) {
                return res.status(400).json({ 
                    status: "error", 
                    message: "Validation Error: 'age' must be a numeric integer." 
                });
            }
            params.push(ageInt);
            conditions.push(`age = $${params.length}`);
        }

        // --- OTHER FILTERS (Gender, Country, Age Groups) ---
        if (gender) { 
            params.push(gender.toLowerCase()); 
            conditions.push(`gender = $${params.length}`); 
        }
        if (country_id) { 
            params.push(country_id.toUpperCase()); 
            conditions.push(`country_id = $${params.length}`); 
        }
        if (age_group) { 
            params.push(age_group.toLowerCase()); 
            conditions.push(`age_group = $${params.length}`); 
        }

        // --- DYNAMIC QUERY BUILDING ---
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const countRes = await db.query(`SELECT COUNT(*) FROM profiles ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].count);

        const allowedSort = ['age', 'created_at', 'gender_probability'];
        const finalSortBy = allowedSort.includes(sort_by) ? sort_by : 'created_at';
        const finalOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const queryText = `
            SELECT * FROM profiles ${whereClause} 
            ORDER BY ${finalSortBy} ${finalOrder} 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const result = await db.query(queryText, [...params, limit, offset]);

        // --- NEGATIVE CASE: No Records Found ---
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "fail",
                message: "No profiles found matching your search criteria.",
                total: 0,
                data: []
            });
        }

        // --- POSITIVE CASE: Success ---
        res.status(200).json({
            status: "success",
            page,
            limit,
            total,
            data: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

/**
 * 3. SEARCH ENDPOINT: Natural Language (Uses redirect to main logic)
 */
app.get('/api/profiles/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === "") {
        return res.status(400).json({ status: "error", message: "Query string is required" });
    }
    const filters = parseNLQ(q);
    if (!filters) {
        return res.status(404).json({ status: "fail", message: "Unable to interpret query." });
    }
    req.query = { ...req.query, ...filters };
    return app._router.handle(req, res); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Intelligence Engine live on port ${PORT}`);
});
