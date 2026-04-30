# Intelligence Query Engine | Stage 2 Backend

A high-performance demographic intelligence API built for **Insighta Labs**. This system processes, segments, and queries large datasets using both structured filters and a custom Natural Language Query (NLQ) engine.

---

##  Project Links
* **GitHub Repository:** https://github.com/viviandev0/hng-stage2-query-engine-BE/
* **Live API Host:** https://hng-stage2-query-engine-be.vercel.app/

---

##  Key Features

### 1. Advanced Filtering (`GET /api/profiles`)
Search profiles using multiple combined criteria.
* **Demographics:** Gender, Age (min/max), Age Group.
* **Location:** Country ID (ISO code).
* **Precision:** Filter by confidence scores (`min_gender_probability`).

### 2. Natural Language Query (`GET /api/profiles/search?q=`)
The engine interprets plain English into database queries without using LLMs.
* **Example:** `q=young males from nigeria` 
* **Logic:** "Young" maps to ages 16–24; "Adults" maps to age group; "Nigeria" maps to NG.

### 3. Sorting & Pagination
* **Sorting:** Order by `age`, `created_at`, or `gender_probability`.
* **Pagination:** Default 10 per page, max 50. Follows the standard success format.

---

## Database Schema
The database is seeded with **2,026 records** using the following structure:
* **ID:** UUID v7 (Time-sortable)
* **Name:** Unique VARCHAR
* **Age Group:** child, teenager, adult, senior
* **Probability Scores:** Float values (0.0 - 1.0) for Gender and Country accuracy.

---

## Setup & Installation

1. **Clone the project:**
   ```bash
   git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
   cd your-repo-name
