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

/** Topics with at least one approved problem for this competition/event. */
export function useTopics(competition: string, event?: string | null): TopicOption[] {
  const [topics, setTopics] = useState<TopicOption[]>([])

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ competition })
    if (event) params.set('event', event)

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
  }, [competition, event])

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
