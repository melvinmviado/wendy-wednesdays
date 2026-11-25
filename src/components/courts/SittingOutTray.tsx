import React from 'react'
import { Armchair } from 'lucide-react'
import type { BoardEntry } from '@/utils/courtBoardModel'
import { PlayerChip } from './BoardSeat'
import { dropTarget } from './boardDnd'
import type { BoardControls } from './CourtCard'

/** "Sitting out / alternates": tap one to select, then a seated player to swap them in. */
export const SittingOutTray: React.FC<{ tray: BoardEntry[]; controls: BoardControls }> = ({ tray, controls: c }) => (
  <section
    aria-labelledby="tray-heading"
    {...dropTarget((dragged) => c.onDrop(dragged, { kind: 'tray' }), c.draggable)}
    className="rounded-xl border border-dashed border-line bg-surface p-3"
  >
    <h3 id="tray-heading" className="mb-2 flex items-center gap-2 text-base font-bold text-ink">
      <Armchair className="h-4 w-4 text-muted" aria-hidden="true" />
      Sitting out / alternates ({tray.length})
    </h3>
    {tray.length === 0 ? (
      <p className="text-sm text-ink-soft">
        Nobody is sitting out.{c.draggable ? ' Drag a player here to take them off their court.' : ''}
      </p>
    ) : (
      <ul className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 lg:grid-cols-3">
        {tray.map((entry) => (
          <li key={entry.id}>
            <PlayerChip
              entry={entry}
              selected={c.selected?.id === entry.id}
              duplicate={c.duplicateIds.has(entry.id)}
              draggable={c.draggable}
              onTap={c.onTapPlayer}
              onDrop={(dragged, target) => c.onDrop(dragged, { kind: 'player', id: target })}
            />
          </li>
        ))}
      </ul>
    )}
  </section>
)
