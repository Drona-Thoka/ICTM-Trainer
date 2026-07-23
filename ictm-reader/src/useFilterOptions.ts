import { useEffect, useState } from 'react'

/**
 * Filter options come from the data, not hardcoded lists.
 *
 * The app previously shipped curated topic/event lists that had drifted from
 * the bank: 29 of 39 topic labels matched no topic at all, and every ICTM event
 * mapping was stale (the bank now prefixes them "Regional "/"State "), so those
 * dropdowns silently filtered nothing.
 *
 * THIS FILE IS THE SEAM. When the ingestion pipeline tags finer-grained topics,
 * the dropdowns pick them up with no code change here; and if the taxonomy ever
 * needs grouping or renaming for display, do it here rather than in the pages.
 */

export type TopicOption = { name: string; count: number }

/** Topics with at least one approved problem for this competition/event(s). */
export function useTopics(competition: string, events?: string[] | null): TopicOption[] {
  const [topics, setTopics] = useState<TopicOption[]>([])
  // Array identity changes every render; key the effect on the contents.
  const eventKey = (events ?? []).join('|')

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ competition })
    for (const e of eventKey ? eventKey.split('|') : []) params.append('event', e)

    fetch(`/api/topics?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TopicOption[]) => {
        if (!cancelled) setTopics(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setTopics([])
      })

    return () => {
      cancelled = true
    }
  }, [competition, eventKey])

  return topics
}

/** Real comp_event values for a competition, straight from the bank. */
export function useEvents(competition: string): string[] {
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events?competition=${encodeURIComponent(competition)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: string[]) => {
        if (!cancelled) setEvents(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })

    return () => {
      cancelled = true
    }
  }, [competition])

  return events
}

export const ALL_TOPICS = 'All topics'
export const ALL_LEVELS = 'All levels'
export const ALL_EVENTS = 'All events'

// Ingestion recorded one round under two names. Folding the odd one in keeps a
// duplicate out of the dropdown; both values are still queried, so its problems
// stay reachable. Extend this if more inconsistencies turn up.
const EVENT_ALIASES: Record<string, string> = {
  'FS 8-Person': 'Frosh-Soph 8-Person Team',
}

// Curriculum order (individual rounds by course, then team rounds), not
// alphabetical — "Algebra II" sorting next to "Algebra I" ahead of Geometry
// reads wrong to anyone who knows the sequence. Anything unlisted sorts to the
// end alphabetically, so newly ingested events still show up.
const EVENT_ORDER = [
  'Algebra I',
  'Geometry',
  'Algebra II',
  'Precalculus',
  'Frosh-Soph 8-Person Team',
  'Junior-Senior 8-Person Team',
  'Frosh-Soph 2-Person Team',
  'Junior-Senior 2-Person Team',
  'Calculator Team',
]

function byCurriculum(a: string, b: string): number {
  const ia = EVENT_ORDER.indexOf(a)
  const ib = EVENT_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

/**
 * ICTM events are stored as one string that fuses two dimensions —
 * "Regional Algebra I", "State Precalculus". Split them so the UI can offer
 * level and event separately instead of one long combined list.
 */
export type IctmEvents = {
  levels: string[]
  eventNames: string[]
  /** Stored comp_event values matching a level/event choice. */
  resolve: (level: string, name: string) => string[]
}

export function useIctmEvents(): IctmEvents {
  const raw = useEvents('ICTM')

  const parsed = raw.map((value) => {
    const m = /^(Regional|State)\s+(.*)$/.exec(value)
    const level = m ? m[1] : 'Other'
    const rest = m ? m[2] : value
    return { value, level, name: EVENT_ALIASES[rest] ?? rest }
  })

  const levels = [...new Set(parsed.map((p) => p.level))].sort()
  const eventNames = [...new Set(parsed.map((p) => p.name))].sort(byCurriculum)

  const resolve = (level: string, name: string) =>
    parsed
      .filter((p) => (level === ALL_LEVELS || p.level === level) && (name === ALL_EVENTS || p.name === name))
      .map((p) => p.value)

  return { levels, eventNames, resolve }
}
