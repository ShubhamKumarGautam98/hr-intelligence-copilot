import { useState, useCallback, useEffect } from "react"

const TITLES_STORAGE_KEY = "hr-copilot-session-titles"

/** Reads the sessionId → title map from localStorage. Returns {} if absent or corrupt. */
function loadTitles() {
  try {
    const raw = localStorage.getItem(TITLES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveTitles(titles) {
  try {
    localStorage.setItem(TITLES_STORAGE_KEY, JSON.stringify(titles))
  } catch {
    // localStorage can throw in private-browsing edge cases — non-critical, just skip persisting
  }
}

/**
 * useChatSessions
 *
 * The backend only stores raw session IDs (GET /api/chat/sessions returns a
 * flat list of UUID strings — no titles, no timestamps). To make the session
 * list usable, we keep a local sessionId → title map in localStorage, derived
 * from each session's first user message the first time it's opened or sent.
 */
export function useChatSessions() {
  const [sessionIds, setSessionIds] = useState([])
  const [titles, setTitles] = useState(loadTitles)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/sessions")
      if (!response.ok) throw new Error("Failed to load chat sessions.")
      const data = await response.json()
      // Newest sessions first — UUIDs aren't sortable, so we rely on the
      // backend's insertion order and simply reverse it as an approximation
      setSessionIds([...data.sessions].reverse())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /** Sets a title for a session and persists it. Skips if a title already exists. */
  const setTitleIfMissing = useCallback((sessionId, title) => {
    setTitles((previous) => {
      if (previous[sessionId]) return previous
      const next = { ...previous, [sessionId]: title }
      saveTitles(next)
      return next
    })
  }, [])

  /** Permanently clears a session's history on the backend and removes it locally. */
  const deleteSession = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete session.")

      setSessionIds((previous) => previous.filter((id) => id !== sessionId))
      setTitles((previous) => {
        const next = { ...previous }
        delete next[sessionId]
        saveTitles(next)
        return next
      })
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  return {
    sessionIds,
    titles,
    isLoading,
    error,
    refreshSessions: fetchSessions,
    setTitleIfMissing,
    deleteSession,
  }
}
