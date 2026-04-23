const express = require('express');
const cors = require('cors');
const db = require('./db');
const app = express();

app.use(cors());
app.use(express.json());

// --- 1. SHARED CORE LOGIC ---
const getProfiles = async (queryParams) => {
    let { 
        gender, age_group, country_id, min_age, max_age, 
        min_gender_probability, min_country_probability,
        sort_by = 'created_at', order = 'desc', page = 1, limit = 10 
    } = queryParams;

    // Strict sort validation
    const allowedSort = ['age', 'created_at', 'gender_probability'];
    if (sort_by && !allowedSort.includes(sort_by)) return { error: "Invalid query parameters" };

    const pageInt = Number(page) || 1;
    const limitInt = Math.min(Number(limit) || 10, 50);
    const offset = (pageInt - 1) * limitInt;

    let conditions = [];
    let params = [];

    const addFilter = (val, col, op = '=') => {
        if (val !== undefined && val !== null && val !== '') {
            params.push(val);
            conditions.push(`${col} ${op} $${params.length}`);
        }
    };

    addFilter(gender, 'gender');
    addFilter(age_group, 'age_group');
    addFilter(country_id?.toUpperCase(), 'country_id');
    addFilter(min_age, 'age', '>=');
    addFilter(max_age, 'age', '<=');
    addFilter(min_gender_probability, 'gender_probability', '>=');
    addFilter(min_country_probability, 'country_probability', '>=');

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.query(`SELECT COUNT(*) FROM profiles ${where}`, params);
    const total = Number(countRes.rows[0].count);

    const dataRes = await db.query(`
        SELECT * FROM profiles ${where} 
        ORDER BY ${sort_by} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'} 
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limitInt, offset]);

    return {
        status: "success",
        page: pageInt,
        limit: limitInt,
        total: total,
        data: dataRes.rows
    };
};

// --- 2. ENDPOINTS ---

app.get('/api/profiles', async (req, res) => {
    try {
        const result = await getProfiles(req.query);
        if (result.error) return res.status(400).json({ status: "error", message: result.error });
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q, page, limit } = req.query;
        if (!q) return res.status(400).json({ status: "error", message: "Invalid query parameters" });

        const text = q.toLowerCase();
        let filters = {};

        // Parsing logic
        if (text.includes('female')) filters.gender = 'female';
        else if (text.includes('male')) filters.gender = 'male';
        
        ['teenager', 'adult', 'senior', 'child'].forEach(g => {
            if (text.includes(g)) filters.age_group = g;
        });

        if (text.includes('young')) { filters.min_age = 16; filters.max_age = 24; }
        const aboveMatch = text.match(/above\s+(\d+)/);
        if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);

        const countries = { 'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'ghana': 'GH' };
        for (const [n, c] of Object.entries(countries)) { if (text.includes(n)) filters.country_id = c; }

        if (Object.keys(filters).length === 0) {
            return res.status(400).json({ status: "error", message: "Unable to interpret query" });
        }

        const result = await getProfiles({ ...filters, page, limit });
        res.status(200).json(result);
    } catch (e) {
        res.status(500).json({ status: "error", message: "Server failure" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Engine running on ${PORT}`));
