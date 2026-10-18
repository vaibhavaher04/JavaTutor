# JavaTutor ☕ | HackerRank-Style Coding IDE & AI Mentor

**JavaTutor** is a full-stack algorithmic coding and learning web platform built specifically for Java developers. It combines real-time Java compilation and execution via remote sandboxed environments with an intelligent AI Mentor powered by Google Gemini and LangChain.

The platform provides a dark developer theme, tabbed sidebar navigation, test-case verification comparing output vs. expected results, slash-command autocomplete (`/problem`) for contextual code debugging, and persistent PostgreSQL storage.

---

## 🚀 Key Features

* **HackerRank-Inspired UI**: Responsive two-column split layout featuring vertical sidebar tabs (`Problem`, `AI Help`), breadcrumb navigation, and a test result drawer with custom input support.
* **Live Java Compilation**: Sandboxed remote compilation and execution powered by the public Judge0 Community Edition API (OpenJDK 17, `language_id: 91`).
* **Strict Evaluation Engine**: Side-by-side comparison between **Your Output (stdout)** and **Expected Output**, pinpointing syntax failures, runtime exceptions, and output mismatches.
* **Editor Usability & Shortcuts**:
  * 4-space indentation handling using the `Tab` key without losing focus.
  * Real-time line-number synchronization.
  * Native fullscreen toggle with adaptive icon flipping (`fa-expand` $\leftrightarrow$ `fa-compress`).
  * Test against custom standard input (`stdin`).
* **Interactive AI Java Mentor (`/problem`)**:
  * Integrated tutor driven by Google Gemini (`gemini-3.8-flash`) via LangChain.
  * Socratic pedagogical behavior: strictly refuses to write complete solutions, instead diagnosing errors, highlighting problematic lines, suggesting edge cases, and giving pseudocode.
  * Autocomplete slash-command (`/problem`) that automatically attaches the problem statement and an active snapshot of the user's Java code for syntax and logical review.
  * Clean Markdown rendering powered by `marked.js`.
* **PostgreSQL Persistence**: Manages user authentication (JWT + native `bcrypt`), dynamic problem descriptions, test suites, submission logs, and multi-turn chat sessions.
* **User Profile & Stats**: Tracks total submissions and solved problems, highlighting solved challenges with checkmarks in the problem catalog.

---

## 🛠️ Tech Stack

* **Backend**: FastAPI (Python 3.11+), Uvicorn
* **Database**: PostgreSQL with `asyncpg`
* **Authentication**: JSON Web Tokens (`pyjwt`) & native `bcrypt` password hashing
* **AI & Orchestration**: LangChain Core, `langchain-google-genai` (`gemini-3.8-flash`)
* **Code Sandbox API**: Judge0 Community Edition API (OpenJDK 17, `language_id: 91`)
* **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
* **Libraries & Assets**: `marked.js` (Markdown parsing), FontAwesome 6, Google Fonts (`Fira Code`, `Inter`)

---

## 📁 Project Directory Structure

```text
MCA_Project_SEM_3/
├── backend/
│   ├── .env                  # Environment secrets (DB URL, API Keys, JWT Secret)
│   ├── main.py               # FastAPI backend with Auth, Problem, Submission & AI endpoints
│   ├── schema.sql            # PostgreSQL database table definitions
│   └── seed.sql              # Initial Java problems and test cases seed data
├── frontend/
│   ├── index.html            # Landing page with Login / Signup modal
│   ├── prepare.html          # Topic modules catalog
│   ├── problems.html         # Problem catalog with difficulty filters & solved badges
│   ├── workspace.html        # HackerRank-style coding workspace & AI drawer
│   ├── style.css             # Developer dark theme stylesheet
│   └── script.js             # Client-side editor engine, Judge0 integration, AI connector
├── .gitignore
├── requirements.txt
└── README.md
```

---

## ⚙️ Prerequisites

1. **Python 3.10+** installed.
2. **PostgreSQL** installed and running on `127.0.0.1:5432`.
3. **Google Gemini API Key** (from Google AI Studio).

---

## 🗄️ Database Setup

1. Open **SQL Shell (psql)** or **pgAdmin** and create the database:
   ```sql
   CREATE DATABASE javatutor_db;
   ```

2. Connect to `javatutor_db` and execute the schema definitions:
   ```sql
   -- 1. Users Table
   CREATE TABLE IF NOT EXISTS users (
       id SERIAL PRIMARY KEY,
       username VARCHAR(50) UNIQUE NOT NULL,
       email VARCHAR(100) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   -- 2. Problems Table
   CREATE TABLE IF NOT EXISTS problems (
       id SERIAL PRIMARY KEY,
       title VARCHAR(150) NOT NULL,
       difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
       description TEXT NOT NULL,
       input_format TEXT,
       output_format TEXT,
       example_io TEXT,
       starter_code TEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   -- 3. Test Cases Table
   CREATE TABLE IF NOT EXISTS test_cases (
       id SERIAL PRIMARY KEY,
       problem_id INT REFERENCES problems(id) ON DELETE CASCADE,
       stdin TEXT NOT NULL,
       expected_output TEXT NOT NULL,
       is_sample BOOLEAN DEFAULT FALSE
   );

   -- 4. Submissions Table
   CREATE TABLE IF NOT EXISTS submissions (
       id SERIAL PRIMARY KEY,
       user_id INT REFERENCES users(id) ON DELETE CASCADE,
       problem_id INT REFERENCES problems(id) ON DELETE CASCADE,
       submitted_code TEXT NOT NULL,
       status VARCHAR(50) NOT NULL,
       execution_time VARCHAR(20),
       memory_used VARCHAR(20),
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   -- 5. Chat History Table
   CREATE TABLE IF NOT EXISTS chat_history (
       id SERIAL PRIMARY KEY,
       user_id INT REFERENCES users(id) ON DELETE CASCADE,
       problem_id INT REFERENCES problems(id) ON DELETE SET NULL,
       sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'assistant')),
       message TEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. Seed the sample Java questions and test cases:
   ```sql
   INSERT INTO problems (title, difficulty, description, input_format, output_format, example_io, starter_code) VALUES
   ('Two Sum', 'Easy', 
    'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
    'First line contains integer n. Next line contains n space-separated integers. Last line contains integer target.',
    'Print the two indices separated by a space.',
    'Input:\n4\n2 7 11 15\n9\n\nOutput:\n0 1',
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if(!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] nums = new int[n];\n        for(int i = 0; i < n; i++) nums[i] = sc.nextInt();\n        int target = sc.nextInt();\n        \n        // Write logic here\n    }\n}'),
   ('Reverse a String', 'Easy',
    'Write a Java program that takes a single word string and returns the reversed version of that string.',
    'A single string word.',
    'The reversed string.',
    'Input:\njavatutor\n\nOutput:\nrotutavaj',
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String s = sc.next();\n        // Write logic here\n    }\n}'),
   ('Palindrome Number', 'Easy',
    'Given an integer x, return true if x is a palindrome, and false otherwise.',
    'A single integer x.',
    'Print "true" or "false".',
    'Input:\n121\n\nOutput:\ntrue',
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int x = sc.nextInt();\n        // Write logic here\n    }\n}'),
   ('Find Maximum Element', 'Medium',
    'Given an array of integers, find and print the maximum element present in the array.',
    'First line contains n. Next line contains n integers.',
    'A single integer showing max value.',
    'Input:\n5\n1 5 3 9 2\n\nOutput:\n9',
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if(!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        // Write logic here\n    }\n}'),
   ('Factorial Calculation', 'Easy',
    'Write a program to calculate the factorial of a given non-negative integer n.',
    'A single non-negative integer n.',
    'The factorial of n.',
    'Input:\n5\n\nOutput:\n120',
    'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        // Write logic here\n    }\n}');

   INSERT INTO test_cases (problem_id, stdin, expected_output, is_sample) VALUES
   (1, E'4\n2\n7\n11\n15\n9', '0 1', TRUE),
   (2, 'javatutor', 'rotutavaj', TRUE),
   (3, '121', 'true', TRUE),
   (4, E'5\n1\n5\n3\n9\n2', '9', TRUE),
   (5, '5', '120', TRUE);
   ```

---

## 🔧 Backend Setup & Configuration

1. **Activate your virtual environment**:
   ```powershell
   cd D:\SYMCA\MCA_Project_SEM_3
   .\venv\Scripts\activate
   ```

2. **Install all required packages**:
   ```powershell
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables (`backend/.env`)**:
   Create a `.env` file inside your `backend/` directory:
   ```env
   # PostgreSQL Connection (Use 127.0.0.1 for Windows compatibility; URL-encode special characters like @ to %40)
   DATABASE_URL=postgresql://postgres:your_password@127.0.0.1:5432/javatutor_db

   # JWT Token Secret Key (Generate via: python -c "import secrets; print(secrets.token_hex(32))")
   SECRET_KEY=your_generated_64_character_hex_key

   # Google Gemini API Key
   GOOGLE_API_KEY=AIzaSyYourGeminiApiKeyHere
   ```

4. **Run the FastAPI server**:
   ```powershell
   cd backend
   uvicorn main:app --reload
   ```
   * API Server: `http://127.0.0.1:8000`
   * Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

---

## 💻 Frontend Setup & User Flow

1. Open `frontend/index.html` in your browser (or use VS Code Live Server).
2. **Step-by-step Workflow**:
   * **Authentication**: Sign up with username, email, and password. The application issues a JWT token saved to `localStorage`.
   * **Prepare Hub**: On login, users land on `prepare.html`. Click the active **Java** module card.
   * **Problem Catalog**: In `problems.html`, filter challenges by difficulty (`All`, `Easy`, `Medium`, `Hard`) and view solved checkmarks. Click **Solve** on any item.
   * **HackerRank Coding Workspace (`workspace.html`)**:
     * Write your Java logic inside the editor (`public class Main`).
     * Use **Run Code** to test against default or custom `stdin`.
     * Use **Submit Code** to validate against remote test cases. If outputs match, the status updates to `Accepted` in PostgreSQL.
   * **AI Help Panel**: Click the **AI Help** tab on the left vertical menu.
     * Ask conceptual Java questions directly.
     * Type `/` to bring up the command autocomplete menu, or click `+ /problem` to link the active challenge description and your current code editor snapshot for targeted debugging.

---

## 🔌 API Reference Overview

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user account | No |
| `POST` | `/api/auth/login` | Authenticate user & return JWT token | No |
| `GET` | `/api/user/profile` | Retrieve user stats and solved problem counts | Yes (Bearer) |
| `GET` | `/api/problems` | List problems (with `is_solved` status) | Optional |
| `GET` | `/api/problems/{id}` | Fetch problem details, starter code & test cases | No |
| `POST` | `/api/submissions` | Record user code submission results | Yes (Bearer) |
| `POST` | `/api/chat` | Chat with AI Mentor (with `/problem` & code context) | Yes (Bearer) |

---

## 🛡️ License

Developed as part of the MCA Semester Project. Available for academic and personal learning purposes.