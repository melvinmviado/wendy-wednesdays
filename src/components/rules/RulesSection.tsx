import React from 'react'
import { ArrowUpDown, CalendarClock, MapPin, Swords, Trophy, UserPlus, type LucideIcon } from 'lucide-react'
import type { RulesBlock, RulesIconKey, RulesSectionContent } from '../../content/rules'

const ICONS: Record<RulesIconKey, LucideIcon> = {
  courts: ArrowUpDown,
  points: Trophy,
  rsvp: CalendarClock,
  guests: UserPlus,
  gym: MapPin,
  games: Swords,
}

const Block: React.FC<{ block: RulesBlock }> = ({ block }) => {
  switch (block.kind) {
    case 'text':
      return <p className="text-ink-soft leading-relaxed">{block.text}</p>
    case 'bullets': {
      const List = block.ordered ? 'ol' : 'ul'
      return (
        <div className="flex flex-col gap-2">
          {block.heading && <h3 className="text-sm font-semibold text-ink">{block.heading}</h3>}
          <List className={`flex flex-col gap-2 pl-5 text-ink-soft leading-relaxed marker:text-brand ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </List>
        </div>
      )
    }
    case 'timeline':
      return (
        <dl className="flex flex-col gap-4 border-l-2 border-line pl-4">
          {block.steps.map((step) => (
            <div key={step.when} className="relative">
              <span className="absolute -left-[1.375rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" />
              <dt className="font-semibold text-ink">{step.when}</dt>
              <dd className="text-ink-soft leading-relaxed">{step.what}</dd>
            </div>
          ))}
        </dl>
      )
    case 'location':
      return (
        <a
          href={block.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-raised p-3 transition-colors hover:border-brand"
        >
          <MapPin className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{block.name}</span>
            {block.address && <span className="block text-sm text-ink-soft">{block.address}</span>}
            <span className="block text-sm text-brand-hover underline underline-offset-2">
              Open in Maps<span className="sr-only"> (opens in a new tab)</span>
            </span>
          </span>
        </a>
      )
  }
}

export const RulesSection: React.FC<{ section: RulesSectionContent }> = ({ section }) => {
  const Icon = ICONS[section.icon]
  return (
    <section id={section.id} aria-labelledby={`${section.id}-h`} className="scroll-mt-28 rounded-xl border border-line bg-surface p-5">
      <h2 id={`${section.id}-h`} className="mb-4 flex items-start gap-3 text-xl font-black tracking-tight text-ink [text-wrap:balance]">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
        {section.title}
      </h2>
      <div className="flex flex-col gap-4">
        {section.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
    </section>
  )
}
