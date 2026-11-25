import React, { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, LayoutGrid, Loader2 } from 'lucide-react'
import { courtBoardApi, type CourtBoardApi } from '@/lib/courtBoard'
import type { CourtAssignmentsApi } from '@/lib/courtSettings'
import { useCourtBoardEditor } from '@/hooks/useCourtBoardEditor'
import type { ToastApi } from '@/hooks/useToasts'
import { formatSessionDate } from '@/utils/rsvpSchedule'
import { ADMIN_ROUTES } from '@/pages/admin/adminRoutes'
import { ActivityDrawer } from './ActivityDrawer'
import { BoardHeader } from './BoardHeader'
import { useCanDrag } from './boardDnd'
import { CourtCard, type BoardControls } from './CourtCard'
import { SeatPicker } from './SeatPicker'
import { SelectionBar } from './SelectionBar'
import { SittingOutTray } from './SittingOutTray'

interface CourtBoardEditorProps {
  sessionDate: string
  timeZone: string
  toast: ToastApi['push']
  api?: CourtBoardApi
  generate?: CourtAssignmentsApi['generate']
}

const retryBtn = 'min-h-11 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised'

/** The admin court assignment editor for one run: courts top to bottom, then the tray. */
export const CourtBoardEditor: React.FC<CourtBoardEditorProps> = ({ sessionDate, timeZone, toast, api = courtBoardApi, generate }) => {
  const e = useCourtBoardEditor(sessionDate, { toast, api, generate })
  const draggable = useCanDrag()
  const [activityOpen, setActivityOpen] = useState(false)
  const loadCandidates = useCallback(() => api.candidates(sessionDate), [api, sessionDate])
  const loadActivity = useCallback(() => api.activity(sessionDate), [api, sessionDate])
  const entries = e.board?.entries
  const onBoard = useMemo(() => new Set((entries ?? []).map((x) => x.id)), [entries])
  const duplicateIds = useMemo(() => new Set(e.issues.duplicates.map((p) => p.id)), [e.issues])
  const selected = entries?.find((x) => x.id === e.selectedId) ?? null

  if (e.loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-ink-soft">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the board…
      </p>
    )
  }
  if (!e.board) {
    return e.error ? (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 text-sm text-ink">
        <AlertTriangle className="h-5 w-5 shrink-0 text-brand-hover" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-semibold">Couldn't load the board.</p>
          <p className="text-ink-soft">{e.error.message}</p>
        </div>
        <button type="button" onClick={() => void e.refetch(true)} className={retryBtn}>Try again</button>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-6 text-center">
        <LayoutGrid className="h-8 w-8 text-muted" aria-hidden="true" />
        <p className="font-semibold text-ink">No board for {formatSessionDate(sessionDate)} yet.</p>
        <p className="text-sm text-ink-soft">
          It is generated a few minutes after RSVPs close, or with Generate now in{' '}
          <Link to={ADMIN_ROUTES.setup} className="font-semibold text-ink underline underline-offset-2">Event setup</Link>.
        </p>
      </div>
    )
  }

  const controls: BoardControls = { selected, duplicateIds, draggable, onTapPlayer: e.tapPlayer, onTapSeat: e.tapSeat, onDrop: e.drop }
  const seat = e.pickerSeat

  return (
    <div className="flex flex-col gap-4">
      <BoardHeader
        board={e.board}
        issues={e.issues}
        publishing={e.publishing}
        regenerating={e.regenerating}
        onPublish={(publish) => void e.setPublished(publish)}
        onRegenerate={e.regenerate}
        onActivity={() => setActivityOpen(true)}
      />
      {e.error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-brand-hover">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Couldn't refresh the board: {e.error.message}
          <button type="button" onClick={() => void e.refetch(true)} className="cursor-pointer font-semibold underline">Try again</button>
        </p>
      )}
      <p className="text-sm text-ink-soft">
        Tap a player, then another player to swap them{draggable ? ', or drag one onto another' : ''}. Changes save as you go.
      </p>

      <ol aria-label="Courts, top to bottom" className="flex flex-col gap-3">
        {e.view.courts.map((court, i, all) => (
          <CourtCard
            key={court.position}
            court={court}
            edge={i === 0 ? 'TOP' : i === all.length - 1 ? 'BOTTOM' : null}
            controls={controls}
          />
        ))}
      </ol>
      <SittingOutTray tray={e.view.tray} controls={controls} />

      {selected && <SelectionBar selected={selected} onRemove={e.removeSelected} onTakeOff={e.takeOffSelected} onCancel={e.clearSelection} />}
      {seat && (
        <SeatPicker
          title={`Fill court ${e.courtOrder[seat.courtPosition]}, seat ${seat.slot + 1}`}
          tray={e.view.tray}
          onBoard={onBoard}
          loadCandidates={loadCandidates}
          onPick={e.fillSeat}
          onClose={e.closePicker}
        />
      )}
      {activityOpen && (
        <ActivityDrawer load={loadActivity} refreshKey={e.board} timeZone={timeZone} onClose={() => setActivityOpen(false)} />
      )}
    </div>
  )
}
