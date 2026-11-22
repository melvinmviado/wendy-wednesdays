import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLeft, MessageCircleQuestion } from 'lucide-react'
import { WebsiteLogo } from '../components/WebsiteLogo'
import { CopyLinkButton } from '../components/CopyLinkButton'
import { RulesSection } from '../components/rules/RulesSection'
import { RULES_CONTACT, RULES_INTRO, RULES_SECTIONS, RULES_TITLE } from '../content/rules'

/** Public Rules & FAQ page at /rules. Copy lives in src/content/rules.ts. */
export function RulesPage() {
  const { hash } = useLocation()

  useEffect(() => {
    const previous = document.title
    document.title = RULES_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  // A direct visit to /rules#section renders after the browser's own anchor scroll, so do it here
  useEffect(() => {
    if (!hash) return
    let id = hash.slice(1)
    try {
      id = decodeURIComponent(id)
    } catch {
      return // malformed escape in the URL: leave the page at the top
    }
    document.getElementById(id)?.scrollIntoView()
  }, [hash])

  return (
    <div className="min-h-screen bg-ground text-ink">
      <nav aria-label="Main" className="sticky top-0 z-30 w-full border-b border-line bg-ground">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 text-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <WebsiteLogo size="sm" />
            <span className="hidden font-bold text-ink sm:inline">Wendy Wednesdays</span>
          </div>
          <Link to="/" className="inline-flex min-h-10 items-center gap-1.5 text-ink-soft transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Leaderboard
          </Link>
        </div>
      </nav>

      <nav aria-label="On this page" className="sticky top-14 z-20 border-b border-line bg-ground">
        <ul className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2 sm:px-6">
          {RULES_SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 text-sm text-ink-soft transition-colors hover:text-ink"
              >
                {s.shortTitle}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-4xl font-black tracking-tight text-ink [text-wrap:balance] sm:text-5xl">{RULES_TITLE}</h1>
            <CopyLinkButton url={`${window.location.origin}/rules`} />
          </div>
          <p className="max-w-prose text-ink-soft">{RULES_INTRO}</p>
        </header>

        {RULES_SECTIONS.map((section) => (
          <RulesSection key={section.id} section={section} />
        ))}

        <aside className="flex items-start gap-3 rounded-xl border border-line bg-raised p-5">
          <MessageCircleQuestion className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">{RULES_CONTACT.title}</p>
            <p className="text-ink-soft">{RULES_CONTACT.text}</p>
          </div>
        </aside>
      </main>
    </div>
  )
}
