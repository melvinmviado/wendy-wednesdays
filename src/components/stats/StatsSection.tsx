import React from 'react'

/** A titled block of the player stats dialog, labelled by its heading. */
export const StatsSection: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="flex flex-col gap-2">
    <h3 id={id} className="text-sm font-semibold text-ink-soft">
      {title}
    </h3>
    {children}
  </section>
)
