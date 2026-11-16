# Wendy Wednesdays - React + Tailwind CSS + Cloudflare Pages

A modern, fast, and production-ready React starter designed to be deployed seamlessly to [Cloudflare Pages](https://pages.cloudflare.com/).

## 🚀 Features

- **React 19 & TypeScript**: Latest React features with full type safety.
- **Vite 6**: Instant server start, blazing-fast HMR, and optimized production builds.
- **Tailwind CSS v4**: Powered by `@tailwindcss/vite` with zero extra configuration.
- **Supabase Database**: Cloud PostgreSQL storage for players and weekly scores with real-time updates.
- **Database-Computed Leaderboard**: PostgreSQL view (`season_leaderboard`) and trigger automatically aggregate weeks played and total points across weeks.
- **Admin-Only Weekly Entry Screen**:
  - Horizontal selector for Weeks 1 to 8.
  - Quick-add player bar for immediate roster addition.
  - One-tap attendance toggling with distinct active visual state.
  - Quick-tap point preset pills (`+10`, `+25`, `+50`, `+100`) and a `+` / `-` stepper.
  - Sticky "Save Week" button with bulk upsert to Supabase `weekly_scores`.
- **Supabase Auth & RLS**: Protected administration portal where only authenticated administrators can add players or record weekly entries.
- **Mobile-First Leaderboard**: Clean 4-column display (Rank, Player Name, Weeks Played, Total Points) with distinct Gold, Silver, and Bronze badges for the top three.
- **Cloudflare Pages Ready**:
  - `public/_redirects` ensures SPA client-side routing works on full page reloads.
  - `public/_headers` adds basic security and caching policies.
  - Ready for automatic Git builds or direct Wrangler CLI deployments.

---

## ⚡ Supabase Setup (Database & Admin Auth)

### 1. Run Database Schema Migration
Open your project's **SQL Editor** in the [Supabase Dashboard](https://supabase.com/dashboard) and run the contents of [`supabase/schema.sql`](file:///d:/Repositories/wendy-wednesdays/supabase/schema.sql):
- Creates the `players` table with columns: `id`, `name`, `weeks_played`, `total_points`, `created_at`.
- Enables **Row Level Security (RLS)**:
  - **Public Read (`SELECT`)**: Anyone can view the season leaderboard.
  - **Admin Write (`INSERT`, `UPDATE`, `DELETE`)**: Only authenticated users (`auth.role() = 'authenticated'`) can add or edit player records.
- Seeds initial sample players.

### 2. Configure Environment Variables
Create a `.env` file in the project root (see [`.env.example`](file:///d:/Repositories/wendy-wednesdays/.env.example)):
```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

For **Cloudflare Pages**, also add these under **Settings > Environment variables** in your Cloudflare dashboard.

### 3. Creating an Administrator Account
- For security, user self-registration is disabled in the app.
- Administrators are created directly from the **Authentication > Users** tab in your [Supabase Dashboard](https://supabase.com/dashboard) (click **Add user** > **Create user** with an email and password).
- Once created, administrators can sign in via **Admin Login** in the app using their email and password to add players and record scores.

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open your browser at [http://localhost:5173](http://localhost:5173).

### 3. Build for Production
```bash
npm run build
```
This runs TypeScript checking (`tsc -b`) and bundles your application into the `dist/` directory.

### 4. Preview the Production Build Locally
```bash
npm run preview
```

---

## ☁️ Deploying to Cloudflare Pages

### Option A: Automatic Git Integration (Recommended)
1. Push this repository to **GitHub** or **GitLab**.
2. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository and specify these build settings:
   - **Framework preset**: `Vite` (or `None`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**. Cloudflare will automatically build and deploy every push to your main branch and create preview deployments for pull requests!

### Option B: Deploy via Wrangler CLI
You can also deploy directly from your terminal using Cloudflare's Wrangler CLI:
```bash
# 1. Build the project
npm run build

# 2. Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=wendy-wednesdays
```

---

## 📁 Project Structure

```
├── public/
│   ├── _headers         # Cloudflare Pages security & caching headers
│   ├── _redirects       # SPA fallback routing rule (/* /index.html 200)
│   └── vite.svg         # Default favicon
├── src/
│   ├── App.tsx          # Main React application component
│   ├── index.css        # Tailwind CSS import (@import "tailwindcss";)
│   └── main.tsx         # React root mounting
├── index.html           # HTML entry point
├── package.json         # Scripts and dependencies
├── tsconfig.json        # Base TypeScript config
├── tsconfig.app.json    # Application TypeScript compiler options
├── tsconfig.node.json   # Node / Vite configuration TypeScript settings
├── vite.config.ts       # Vite configuration with React and Tailwind plugins
└── README.md
```

---

## 🎨 Customizing Styles & Tailwind CSS
Tailwind CSS v4 is configured directly through CSS:
- Add custom utility classes, theme variables, or Google fonts in [`src/index.css`](file:///d:/Repositories/wendy-wednesdays/src/index.css).
- Standard utility classes (e.g., `flex`, `p-4`, `bg-slate-900`, `text-cyan-400`) work right out of the box with autocomplete in supported IDEs.
