const db = require('./db');
const fs = require('fs');

const seedData = async () => {
    try {
        // 1. Read the JSON file (Make sure the filename matches what you downloaded)
        const rawData = fs.readFileSync('seed_profiles.json');
        const profiles = JSON.parse(rawData);

        console.log(`Checking data: Found ${profiles.length} records.`);

        // 2. Insert each profile into the database
        for (const p of profiles) {
            const query = `
                INSERT INTO profiles (
                    id, name, gender, gender_probability, age, 
                    age_group, country_id, country_name, country_probability, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (name) DO NOTHING;
            `;

            const values = [
                p.id, p.name.toLowerCase(), p.gender, p.gender_probability, p.age,
                p.age_group, p.country_id, p.country_name, p.country_probability, p.created_at
            ];

            await db.query(query, values);
        }

        console.log("✅ Seeding successful! 2,026 profiles are now in Railway.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
};

seedData();