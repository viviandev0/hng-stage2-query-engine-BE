const db = require('./db');
const fs = require('fs');
const uuidv7 = require('uuidv7').uuidv7;

const seedData = async () => {
    try {
        // 1. Read the file
        const rawData = fs.readFileSync('seed_profiles.json');
        const jsonData = JSON.parse(rawData);

        // 2. Change: Point specifically to the "profiles" key in the JSON
        const profiles = jsonData.profiles;

        if (!profiles || !Array.isArray(profiles)) {
            console.error("❌ Error: Could not find the 'profiles' list in seed_profiles.json.");
            process.exit(1);
        }

        console.log(`Checking data: Found ${profiles.length} records in the JSON.`);

        // 3. Change: Loop through profiles and insert into profiles table
        for (const p of profiles) {
            const query = `
                INSERT INTO profiles (
                    id, name, gender, gender_probability, age, 
                    age_group, country_id, country_name, country_probability, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (name) DO NOTHING;
            `;

            const values = [
                p.id || uuidv7(), 
                p.name ? p.name.toLowerCase() : null,
                p.gender,
                p.gender_probability,
                p.age,
                p.age_group,
                p.country_id,
                p.country_name,
                p.country_probability,
                p.created_at || new Date().toISOString()
            ];

            await db.query(query, values);
        }

        console.log("✅ Seeding successful! All records are now in profiles on Railway.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
};

seedData();
