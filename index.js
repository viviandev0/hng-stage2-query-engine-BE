const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// 1. Helper: Natural Language Parser (The "Brain")
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    let filters = {};

    // Gender parsing
    if (text.includes('female')) filters.gender = 'female';
    else if (text.includes('male')) filters.gender = 'male';

    // Age Group parsing
    if (text.includes('child')) filters.age_group = 'child';
    if (text.includes('teenager')) filters.age_group = 'teenager';
    if (text.includes('adult')) filters.age_group = 'adult';
    if (text.includes('senior')) filters.age_group = 'senior';

    // Special "Young" rule (16-24)
    if (text.includes('young')) {
        filters.min_age = 16;
        filters.max_age = 24;
    }

    // "Above X" parsing (Regex)
    const aboveMatch = text.match(/above\s+(\d+)/);
    if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]) + 1;

    // Basic Country Mapping
    const countryMap = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'ghana': 'GH', 'benin': 'BJ' };
    for (const [name, code] of Object.entries(countryMap)) {
        if (text.includes(name)) filters.country_id = code;
    }

    return Object.keys(filters).length > 0 ? filters : null;
};

// 2. Main Query Endpoint (Filtering, Sorting, Pagination)
app.get('/api/profiles', async (req, res) => {
    try {
        let { 
            gender, age_group, country_id, min_age, max_age, min_gender_probability, min_country_probability,
            sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
        } = req.query;

        // Validation & Pagination Logic
        page = Math.max(1, parseInt(page));
        limit = Math.min(Math.max(1, parseInt(limit)), 50);
        const offset = (page - 1) * limit;

        let conditions = [];
        let params = [];

        // Build Dynamic WHERE Clause
        if (gender) { params.push(gender); conditions.push(`gender = $${params.length}`); }
        if (country_id) { params.push(country_id.toUpperCase()); conditions.push(`country_id = $${params.length}`); }
        if (age_group) { params.push(age_group); conditions.push(`age_group = $${params.length}`); }
        if (min_age) { params.push(parseInt(min_age)); conditions.push(`age >= $${params.length}`); }
        if (max_age) { params.push(parseInt(max_age)); conditions.push(`age <= $${params.length}`); }
        if (min_gender_probability) { params.push(parseFloat(min_gender_probability)); conditions.push(`gender_probability >= $${params.length}`); }
        if (min_country_probability) { params.push(parseFloat(min_country_probability)); conditions.push(`country_probability >= $${params.length}`); }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // Query 1: Get Total Count for Pagination metadata
        const countRes = await db.query(`SELECT COUNT(*) FROM profiles ${whereClause}`, params);
        const total = parseInt(countRes.rows[0].count);

        // Query 2: Get Paginated and Sorted Data
        const allowedSort = ['age', 'created_at', 'gender_probability'];
        const finalSortBy = allowedSort.includes(sort_by) ? sort_by : 'created_at';
        const finalOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const queryText = `
            SELECT * FROM profiles ${whereClause} 
            ORDER BY ${finalSortBy} ${finalOrder} 
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

        const result = await db.query(queryText, [...params, limit, offset]);

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

// 3. Search Endpoint (Natural Language Query)
app.get('/api/profiles/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === "") {
        return res.status(400).json({ status: "error", message: "Query string is required" });
    }

    const filters = parseNLQ(q);
    if (!filters) {
        return res.status(400).json({ status: "error", message: "Unable to interpret query" });
    }

    // Merge parsed filters into query params and pass to the main filtering logic
    req.query = { ...req.query, ...filters };
    
    // Internal redirect to the GET /api/profiles logic
    return app._router.handle(req, res); 
});

// 4. Server Activation
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Intelligence Engine live on port ${PORT}`);
});