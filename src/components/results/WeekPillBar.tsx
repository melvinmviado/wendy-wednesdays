import React, { useEffect, useRef } from 'react'

interface WeekPillBarProps {
  weeks: number[]
  selected: number | null
  onSelect: (weekNumber: number) => void
}

// Horizontally scrolling week picker. The selected pill is kept in view.
export const WeekPillBar: React.FC<WeekPillBarProps> = ({ weeks, selected, onSelect }) => {
  const pills = useRef(new Map<number, HTMLButtonElement>())

  useEffect(() => {
    if (selected === null) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // block: 'nearest' keeps the page from scrolling vertically
    pills.current.get(selected)?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduce ? 'auto' : 'smooth',
    })
  }, [selected])

  return (
    <div
      role="tablist"
      aria-label="Select week"
      className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]"
    >
      {weeks.map((weekNumber) => (
        <button
          key={weekNumber}
          ref={(el) => {
            if (el) pills.current.set(weekNumber, el)
            else pills.current.delete(weekNumber)
          }}
          role="tab"
          aria-selected={selected === weekNumber}
          onClick={() => onSelect(weekNumber)}
          className={`shrink-0 min-h-10 px-4 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
            selected === weekNumber
              ? 'bg-brand text-brand-ink border-brand'
              : 'bg-surface text-ink-soft border-line hover:text-ink hover:bg-raised'
          }`}
        >
          Week {weekNumber}
        </button>
      ))}
    </div>
  )
}
