import { useState } from 'react'
import {
  Cloud,
  Code2,
  Sparkles,
  Zap,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
  ChevronRight,
  Layers,
  Palette
} from 'lucide-react'

export default function App() {
  const [count, setCount] = useState(0)
  const [copied, setCopied] = useState(false)

  const copyDeployCommand = () => {
    navigator.clipboard.writeText('npm run build')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const features = [
    {
      title: 'React 19 & Vite 6',
      desc: 'Blazing fast instant server start, lightning-fast HMR, and modern TypeScript support.',
      icon: Zap,
      color: 'from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30',
    },
    {
      title: 'Tailwind CSS v4',
      desc: 'Next-gen CSS framework with zero-config Vite plugin and full modern styling primitives.',
      icon: Palette,
      color: 'from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30',
    },
    {
      title: 'Cloudflare Pages Ready',
      desc: 'Pre-configured SPA routing redirects (_redirects) and security headers (_headers).',
      icon: Cloud,
      color: 'from-orange-500/20 to-rose-500/20 text-orange-400 border-orange-500/30',
    },
    {
      title: 'Production Build Ready',
      desc: 'Pre-configured TypeScript checks, optimized asset hashing, and minified bundles.',
      icon: Layers,
      color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
    },
  ]

  const cloudflareSteps = [
    {
      step: '1',
      title: 'Connect Repository',
      desc: 'Push this repo to GitHub or GitLab and link it inside the Cloudflare Dashboard.',
    },
    {
      step: '2',
      title: 'Set Build Settings',
      desc: 'Framework preset: Vite | Build command: npm run build | Output directory: dist',
    },
    {
      step: '3',
      title: 'Instant Edge Deploy',
      desc: 'Cloudflare automatically builds and deploys your site to 300+ locations globally.',
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Background glowing gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 flex flex-col gap-16">
        {/* Header / Hero */}
        <header className="flex flex-col items-center text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 text-xs sm:text-sm font-medium tracking-wide">
            <Sparkles className="w-4 h-4 animate-pulse text-cyan-400" />
            <span>React + Tailwind CSS + Cloudflare Pages</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl">
            Base Template for{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              Wendy Wednesdays
            </span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
            A production-ready foundation designed for speed, flexibility, and instant deployment
            on Cloudflare's global edge network.
          </p>

          {/* Interactive Counter Demo */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => setCount((prev) => prev + 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Code2 className="w-4 h-4" />
              <span>Interactive Count: {count}</span>
            </button>

            <button
              onClick={copyDeployCommand}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-medium transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copied "npm run build"</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy Build Command</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="relative group p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm hover:border-slate-700 transition duration-300"
              >
                <div
                  className={`inline-flex p-3 rounded-xl border bg-gradient-to-br ${feature.color} mb-4`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-1.5 flex items-center justify-between">
                  {feature.title}
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition transform group-hover:translate-x-0.5" />
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">{feature.desc}</p>
              </div>
            )
          })}
        </section>

        {/* Cloudflare Pages Quick Guide */}
        <section className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-orange-400 font-semibold mb-1">
                <Cloud className="w-5 h-5" />
                <span>Cloudflare Pages Settings</span>
              </div>
              <h2 className="text-xl font-bold text-white">How to deploy to Cloudflare Pages</h2>
            </div>
            <a
              href="https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite-site/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-cyan-400 hover:text-cyan-300 transition"
            >
              <span>Cloudflare Vite Docs</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cloudflareSteps.map((step) => (
              <div key={step.step} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-800 text-cyan-400 font-bold flex items-center justify-center text-sm border border-slate-700">
                  {step.step}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-200 text-sm mb-1">{step.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Cloudflare Pages Config Reference Box */}
          <div className="mt-8 p-4 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
            <div className="space-y-1">
              <div>
                <span className="text-slate-500">Build command:</span>{' '}
                <span className="text-cyan-300">npm run build</span>
              </div>
              <div>
                <span className="text-slate-500">Output directory:</span>{' '}
                <span className="text-indigo-300">dist</span>
              </div>
              <div>
                <span className="text-slate-500">SPA Fallback:</span>{' '}
                <span className="text-emerald-300">public/_redirects configured</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Production Configured</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pb-8">
          Ready to customize. Edit{' '}
          <code className="text-slate-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            src/App.tsx
          </code>{' '}
          to start building your application.
        </footer>
      </div>
    </div>
  )
}
