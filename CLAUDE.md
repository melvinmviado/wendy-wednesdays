\# Project: wendy-wednesdays



App displays individual player points based on weekly results for participants to see and administrators can input results and edit player data.



\## Stack

\- Frontend: React 19 + TypeScript 5.7 | Function components and context provider

\- Build Tooling: Vite 6 with @vitejs/plugin-react. The scripts are dev, build (tsc -b \&\& vite build) and preview.

\- Styling: Tailwind CSS 4, wired in through the @tailwindcss/vite plugin.

\- Icons: lucide-react.

\- Backend: Supabase, through @supabase/supabase-js (client in src/lib/supabase.ts). The supabase/ folder holds the database setup. Leaderboard is computed in the database, and admin login goes through Supabase.

\- Hosting: Cloudflare Pages 



\## Commands

\- `npm run dev` – Starts the Vite dev server

\- `npm run build` – Runs tsc -b \&\& vite build

\- `npm run preview` – Serves the built dist/ locally so you can check the production bundle



\## Project structure



wendy-wednesdays/

├── index.html               # Vite entry HTML

├── package.json / package-lock.json

├── vite.config.ts           # Vite config (React + Tailwind plugins)

├── tsconfig.json            # Root TS config, references the two below

├── tsconfig.app.json        # TS config for src/

├── tsconfig.node.json       # TS config for vite.config.ts

├── .env                     # VITE\_SUPABASE\_URL / VITE\_SUPABASE\_ANON\_KEY

├── CLAUDE.md, README.md

├── public/

│   ├── \_headers             # Cloudflare security and caching headers

│   ├── \_redirects           # SPA routing fallback for Cloudflare Pages

│   ├── vite.svg

│   └── logo/                # logo.png and a README

├── supabase/

│   ├── migrations/          # The schema, in filename order (20261117000000_baseline.sql first);
│   │                        # applied by hand in the SQL Editor

│   ├── tests/               # SQL tests: one rolled-back transaction each, PASS notices

│   └── checks/              # Read-only checks (migration_status.sql, verify_admin_access.sql)

└── src/

&#x20;   ├── main.tsx             # App bootstrap

&#x20;   ├── App.tsx              # Root component

&#x20;   ├── index.css            # Tailwind entr

&#x20;   ├── vite-env.d.ts

&#x20;   ├── components/          # AddPlayerModal, AdminLoginModal, LeaderboardTable,

&#x20;   │                        # Podium, RankByScreen

&#x20;   ├── context/AuthContext.tsx   # Supabase admin auth state

&#x20;   ├── data/leaderboardData.ts   # Leaderboard data access

&#x20;   ├── lib/supabase.ts           # Supabase

&#x20;   ├── types/leaderboard.ts      # Shared types

&#x20;   └── utils/scoring.ts          # Team overall rank and podium helpers (default points: utils/weeklyEntry.ts)



dist/, node\_modules/ and the \*.tsbuildinfo files are generated and left out above.



\## Conventions

\- Function components and hooks only; named exports (default exports only for pages).

\- Use `@/` import alias for `src/`.

\- Keep components under \~150 lines; extract hooks for data logic.

\- Handle loading, error, and empty states for every data-driven view.

\- Use Tailwind utilities; avoid custom CSS unless necessary.



\## Do not

\- Commit secrets or `.env\\\*` files (except `.env.example`).

\- Add dependencies without asking first.

\- Edit generated files (`src/types/database.ts`) or `dist/`.

\- Run destructive DB commands (drop, truncate, `supabase db reset`) without confirmation.



\## Workflow

\- Make small, focused changes; describe the plan before large refactors.

\- Ask before making architectural decisions (new libraries, auth flow changes, schema redesigns).

