// All Rules & FAQ copy lives here so wording can change without touching layout.
// A `null` constant means "not confirmed yet": the page leaves that detail out until it is filled in.

export const RULES_TITLE = 'Rules & FAQ'
export const RULES_INTRO =
  'Everything you need for a Wednesday night: how courts move, how points work, when to RSVP, and what to bring.'

/** People to contact for drops and questions. */
export const CONTACTS = ['Jacob Garcia', 'Jasper Viado'] as const
const contactNames = CONTACTS.join(' or ')

// ---- Details still to confirm (null = hidden from the page) ----

/** TODO: confirm the RSVP cutoff time on Tuesday, e.g. '6:00pm'. */
export const RSVP_CUTOFF_TIME: string | null = null
/** TODO: confirm the court a first-time guest starts on, e.g. 'Court 3'. */
export const NEW_GUEST_START_COURT: string | null = null
/** TODO: add the street address of Pickleplex Oshawa. */
export const VENUE_STREET_ADDRESS: string | null = null

// ---- Fixed facts ----

export const VENUE_NAME = 'Pickleplex Oshawa, Ontario'
export const VENUE_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=Pickleplex+Oshawa+Ontario'
export const PLAY_TIME = 'Wednesdays, 6:00pm to 10:00pm'

export type RulesIconKey = 'courts' | 'points' | 'rsvp' | 'guests' | 'gym' | 'games'

export interface TimelineStep {
  when: string
  what: string
}

export type RulesBlock =
  | { kind: 'text'; text: string }
  | { kind: 'bullets'; items: string[]; heading?: string; ordered?: boolean }
  | { kind: 'timeline'; steps: TimelineStep[] }
  | { kind: 'location'; name: string; address: string | null; mapsUrl: string }

export interface RulesSectionContent {
  id: string
  title: string
  shortTitle: string // label in the "On this page" list
  icon: RulesIconKey
  blocks: RulesBlock[]
}

export const RULES_SECTIONS: RulesSectionContent[] = [
  {
    id: 'court-movement',
    title: 'How Up-and-Down Court Movement Works',
    shortTitle: 'Court movement',
    icon: 'courts',
    blocks: [
      {
        kind: 'bullets',
        items: [
          'Starting courts are seeded by the current standings.',
          'Winners move up one court and split partners.',
          'Losers move down one court and split partners.',
          'Winners on Court 1 stay on Court 1. Losers on the bottom court stay on the bottom court.',
        ],
      },
    ],
  },
  {
    id: 'points',
    title: 'How Weekly Points & Standings Are Calculated',
    shortTitle: 'Points & standings',
    icon: 'points',
    blocks: [
      {
        kind: 'bullets',
        items: [
          'Points are based on where you place on your court.',
          'The loser of the bottom court receives 1 point.',
          'Every placement above that gains 1 more point. For example, with 6 courts the winner of Court 6 receives 2 points, the loser of Court 5 receives 3 points, and so on up the courts.',
          'Total points across the 8-week season decide the season champion.',
        ],
      },
    ],
  },
  {
    id: 'rsvp',
    title: 'RSVP Deadlines, Waitlists & Drops',
    shortTitle: 'RSVPs & waitlist',
    icon: 'rsvp',
    blocks: [
      {
        kind: 'timeline',
        steps: [
          { when: 'After the Wednesday event', what: 'RSVPs open for the following week.' },
          {
            when: RSVP_CUTOFF_TIME ? `Tuesday, ${RSVP_CUTOFF_TIME}` : 'Tuesday',
            what: 'RSVP cutoff.',
          },
          { when: 'Tuesday night', what: 'Scheduled starting courts go live.' },
          {
            when: 'Wednesday afternoon',
            what: `Emergency drops: contact ${contactNames} right away so a spot can be offered to the waitlist.`,
          },
        ],
      },
      {
        kind: 'bullets',
        heading: 'Waitlist',
        items: ['When a player cancels, the next player on the waitlist is automatically added to the RSVP list.'],
      },
    ],
  },
  {
    id: 'guests',
    title: 'How New Guests & Missed Weeks Work',
    shortTitle: 'Guests & missed weeks',
    icon: 'guests',
    blocks: [
      {
        kind: 'bullets',
        items: [
          'Missing a week does not disqualify anyone.',
          NEW_GUEST_START_COURT
            ? `First-time guests start their first night on ${NEW_GUEST_START_COURT}.`
            : null,
          'New guests appear on the public leaderboard as soon as they finish their first run.',
        ].filter((item): item is string => item !== null),
      },
    ],
  },
  {
    id: 'gym',
    title: 'Gym Logistics & Etiquette',
    shortTitle: 'Gym & etiquette',
    icon: 'gym',
    blocks: [
      { kind: 'location', name: VENUE_NAME, address: VENUE_STREET_ADDRESS, mapsUrl: VENUE_MAPS_URL },
      {
        kind: 'bullets',
        items: [
          PLAY_TIME,
          'Bring your paddle. Please help supply balls.',
          "Rotate in cleanly when games finish: move promptly to your next court, and don't linger on a finished court.",
        ],
      },
    ],
  },
  {
    id: 'games',
    title: 'Games',
    shortTitle: 'Games',
    icon: 'games',
    blocks: [
      {
        kind: 'bullets',
        items: [
          'Games are played with traditional scoring to 11.',
          'Once at least one court has finished, all remaining courts switch to rally scoring.',
          'At that point players may switch to their preferred side.',
        ],
      },
    ],
  },
]

export const RULES_CONTACT = {
  title: 'Questions?',
  text: `Contact ${contactNames}.`,
}
