# NONECO Document Tracking System

A full-stack web application for managing, routing, and tracking official documents across departments at the Northern Negros Electric Cooperative, Inc. (NONECO).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express.js (ESM) |
| Database | PostgreSQL 14+ |
| Auth | JWT (jsonwebtoken + bcrypt) |
| File Storage | Local filesystem (or MinIO) |
| Testing | Vitest, @testing-library/react, fast-check |

---

## Project Structure

```
noneco-document-tracking/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/   # Shared UI components
│   │   ├── contexts/     # Auth, Theme, Notification contexts
│   │   └── pages/        # Route-level page components
│   └── public/           # Static assets (logo, icons, manifest)
├── server/          # Express.js API
│   ├── src/
│   │   ├── db/
│   │   │   └── migrations/  # SQL migration files
│   │   ├── middleware/       # Auth, RBAC middleware
│   │   ├── routes/           # API route handlers
│   │   ├── services/         # Email, notifications, storage, QR
│   │   └── utils/            # Audit logging, tracking numbers
│   └── uploads/              # Uploaded file storage (local mode)
└── package.json     # Root workspace config
```

---

## Prerequisites

Make sure the following are installed on your machine:

- **Node.js** v18 or higher — [nodejs.org](https://nodejs.org) (includes npm)
- **PostgreSQL** 14 or higher — [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) — install with pgAdmin 4 included
- **Git** — [git-scm.com](https://git-scm.com)

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/noneco-document-tracking.git
cd noneco-document-tracking
```

### 2. Install dependencies

Install all dependencies for both client and server from the root:

```bash
npm install
```

### 3. Install and set up PostgreSQL

> ⚠️ **Important note for XAMPP users:** phpMyAdmin (included with XAMPP) manages **MySQL/MariaDB only** — it **cannot** connect to PostgreSQL. This application uses **PostgreSQL**, so you need to set it up separately using one of the options below.

---

#### Option A — Download PostgreSQL directly (recommended for Windows)

1. Go to **https://www.postgresql.org/download/windows/**
2. Click **Download the installer** (EDB installer)
3. Run the installer — use these settings:
   - Installation directory: default
   - Components: ✅ PostgreSQL Server, ✅ pgAdmin 4, ✅ Command Line Tools
   - Data directory: default
   - **Password**: set a password for the `postgres` superuser — **remember this**, you'll need it in `.env`
   - Port: `5432` (default)
   - Locale: default
4. Finish the installation. PostgreSQL will start automatically as a Windows service.

#### Option B — Using XAMPP with PostgreSQL (advanced)

XAMPP does **not** include PostgreSQL by default. You can still use XAMPP for other services (Apache, etc.) alongside a separate PostgreSQL installation:

1. Install PostgreSQL using **Option A** above
2. Make sure PostgreSQL runs on port `5432` and XAMPP's Apache/MySQL run on their usual ports — there is no conflict
3. Manage your PostgreSQL database using **pgAdmin 4** (installed with PostgreSQL) instead of phpMyAdmin

> **Can I use phpMyAdmin?** No — phpMyAdmin only works with MySQL/MariaDB. Use **pgAdmin 4** as the equivalent GUI tool for PostgreSQL. It works the same way: visual table browser, query editor, and database management.

---

#### Create the database

**Using pgAdmin 4 (GUI — recommended, works like phpMyAdmin):**

1. Open **pgAdmin 4** from the Start menu
2. Connect to your local server (use the `postgres` password you set during install)
3. Right-click **Databases** → **Create** → **Database…**
4. Name: `noneco_docs` → click **Save**

**Using SQL Shell (psql):**

Open **SQL Shell (psql)** from the Start menu, press Enter to accept defaults, enter your password, then run:

```sql
CREATE DATABASE noneco_docs;
\q
```

**Using Command Prompt / PowerShell:**

```bash
psql -U postgres -c "CREATE DATABASE noneco_docs;"
```

> If `psql` is not recognized, add PostgreSQL to your PATH:
> `C:\Program Files\PostgreSQL\16\bin` (adjust version number as needed)

### 4. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and update the following:

```env
# Database — update with your PostgreSQL credentials
DB_HOST=localhost
DB_PORT=5432
DB_NAME=noneco_docs
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT — change this to a long random string in production
JWT_SECRET=change-this-to-a-long-random-secret
JWT_EXPIRES_IN=30m

# Server
PORT=3000
NODE_ENV=development

# File storage (local = store files in server/uploads/)
STORAGE_BACKEND=local
UPLOADS_DIR=./uploads

# App URL (must match where the frontend runs)
APP_URL=http://localhost:5173
CORS_ORIGIN=*
```

> **Note:** Never commit `server/.env` to Git. It is already listed in `.gitignore`.

### 5. Run database migrations

This creates all tables, indexes, and seeds the initial departments and document categories:

```bash
cd server
npm run db:migrate
```

Expected output:
```
Running 6 migration(s)...
  Applying 001_initial_schema.sql...
  ✓ 001_initial_schema.sql
  ...
All migrations applied successfully.
```

### 6. Create the first admin user

After migrations, create an admin account directly in the database.

**Using pgAdmin 4:**

1. In pgAdmin, expand **Servers → PostgreSQL → Databases → noneco_docs**
2. Right-click **noneco_docs** → **Query Tool**
3. Paste and run the SQL below:

**Using psql:**

```bash
psql -U postgres -d noneco_docs
```

Then paste:

```sql
INSERT INTO users (username, password_hash, email, full_name, role, department_id)
SELECT
  'admin',
  -- bcrypt hash of 'password' (cost 10) — change this after first login
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin@noneco.example.com',
  'System Administrator',
  'admin',
  id
FROM departments
WHERE code = 'OGM'
LIMIT 1;
```

> **Important:** Log in with username `admin` / password `password` and immediately change the password via **Profile → Change Password**.

### 7. Start the development servers

Open **two terminal windows**:

**Terminal 1 — Backend API (port 3000):**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd client
npm run dev
```

Then open your browser at: **http://localhost:5173**

---

## Default Login

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `password` |

> Change this password immediately after first login via **Profile → Change Password**.

---

## Available Scripts

### Root (runs across both workspaces)

| Command | Description |
|---|---|
| `npm run dev:client` | Start the Vite dev server |
| `npm run dev:server` | Start the Express API with file watching |
| `npm run build` | Build the frontend for production |
| `npm test` | Run all tests (client + server) |
| `npm run lint` | Lint all source files |

### Server only (`cd server`)

| Command | Description |
|---|---|
| `npm run dev` | Start API with `--watch` (auto-restart on changes) |
| `npm start` | Start API without watching (production) |
| `npm run db:migrate` | Apply pending database migrations |
| `npm test` | Run server tests with Vitest |

### Client only (`cd client`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + Vite production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run client tests with Vitest |

---

## User Roles

| Role | Permissions |
|---|---|
| **Staff** | Create documents, view documents in their department, add comments, record actions |
| **Department Head** | All staff permissions + forward/return documents, bulk actions, generate reports |
| **Admin** | Full access — manage users, categories, templates, view audit log, delete documents |

---

## Document Routing Workflow

```
Created (Originating Dept)
    ↓  Forward
In Progress / Forwarded (Receiving Dept)
    ↓  Forward again  OR  Return
    ↓
Completed (marked by Dept Head or Admin)
```

- **Forward** — sends the document to another department with a routing note
- **Return** — sends it back to the previous sender with a reason
- **Record Action** — logs what was done (Received / Reviewed / Approved) without moving the document
- **Mark Complete** — closes the document (Department Head or Admin only)

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default: 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `DATABASE_URL` | No | Full connection string (overrides individual DB vars) |
| `JWT_SECRET` | Yes | Secret key for signing JWTs — use a long random string |
| `JWT_EXPIRES_IN` | No | Token expiry (default: `30m`) |
| `PORT` | No | API server port (default: `3000`) |
| `NODE_ENV` | No | `development` or `production` |
| `STORAGE_BACKEND` | No | `local` (default) or `minio` |
| `UPLOADS_DIR` | No | Path for local file uploads (default: `./uploads`) |
| `APP_URL` | No | Frontend URL — used in QR codes and email links |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `*`) |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |

---

## Production Build

### Build the frontend

```bash
npm run build
```

The compiled output goes to `client/dist/`. In production the Express server serves it automatically.

---

## Deploying to Railway

Railway is the recommended hosting platform for this app — it supports Node.js servers, PostgreSQL, persistent volumes, and cron jobs natively.

### Step 1 — Push to GitHub

Make sure your code is pushed to a GitHub repository (see the GitHub section above).

### Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `noneco-document-tracking` repository
4. Railway will detect `railway.json` and configure the build automatically

### Step 3 — Add PostgreSQL

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**
2. Railway will automatically set the `DATABASE_URL` environment variable

### Step 4 — Set environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | A long random string (32+ chars) |
| `JWT_EXPIRES_IN` | `30m` |
| `APP_URL` | Your Railway public URL (e.g. `https://noneco-dts.up.railway.app`) |
| `STORAGE_BACKEND` | `local` (or `minio` for persistent file storage) |
| `UPLOADS_DIR` | `./uploads` |

> `DATABASE_URL` is set automatically by the PostgreSQL plugin — do not add it manually.

### Step 5 — Deploy

Railway will build and deploy automatically. The first deploy will:
1. Run `npm install` and `npm run build` (builds the React frontend)
2. Start `node server/src/server.js`
3. Auto-run all pending database migrations on startup
4. Serve both the API and the frontend from a single URL

### Step 6 — Create the admin user

After the first deploy, open the Railway **Shell** tab for your service and run:

```bash
node -e "
import('./server/src/db/pool.js').then(async ({ default: pool }) => {
  const bcrypt = await import('bcrypt')
  const hash = await bcrypt.hash('password', 10)
  const dept = await pool.query(\"SELECT id FROM departments WHERE code = 'OGM' LIMIT 1\")
  await pool.query(
    'INSERT INTO users (username, password_hash, email, full_name, role, department_id) VALUES (\$1,\$2,\$3,\$4,\$5,\$6)',
    ['admin', hash, 'admin@noneco.example.com', 'System Administrator', 'admin', dept.rows[0].id]
  )
  console.log('Admin user created.')
  process.exit(0)
})
"
```

Then log in at your Railway URL with `admin` / `password` and change the password immediately.

### File uploads on Railway

Railway's filesystem is ephemeral — uploaded files will be lost on redeploy. For production use:

- **Cloudflare R2** (free tier, S3-compatible) — set `STORAGE_BACKEND=minio` and configure the `MINIO_*` variables
- **Railway Volumes** — add a persistent volume mounted at `./uploads`

---

## .gitignore

Make sure your `.gitignore` includes:

```
node_modules/
server/.env
server/uploads/
client/dist/
```

---

## License

This project is proprietary software developed for Northern Negros Electric Cooperative, Inc. (NONECO). All rights reserved.
