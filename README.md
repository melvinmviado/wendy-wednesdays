# Wendy Wednesdays - React + Tailwind CSS + Cloudflare Pages

A modern, fast, and production-ready React starter designed to be deployed seamlessly to [Cloudflare Pages](https://pages.cloudflare.com/).

## 🚀 Features

- **React 19 & TypeScript**: Latest React features with full type safety.
- **Vite 6**: Instant server start, blazing-fast HMR, and optimized production builds.
- **Tailwind CSS v4**: Powered by `@tailwindcss/vite` with zero extra configuration.
- **Lucide Icons**: Beautiful & consistent open-source icons.
- **Cloudflare Pages Ready**:
  - `public/_redirects` ensures SPA client-side routing works on full page reloads.
  - `public/_headers` adds basic security and caching policies.
  - Ready for automatic Git builds or direct Wrangler CLI deployments.

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
