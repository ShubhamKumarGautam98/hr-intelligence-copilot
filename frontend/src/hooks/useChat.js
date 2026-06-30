import { useState, useCallback, useEffect } from "react"

/** Generates a unique ID that works in all modern browsers. */
function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * useChat
 *
 * Manages conversation state for the session identified by `sessionId`.
 * The sessionId is now controlled by the parent (ChatInterface) rather than
 * generated internally, so switching sessions or starting a new chat is just
 * a matter of changing the ID passed in — this hook reacts to that change by
 * loading the corresponding history from the backend.
 *
 * Message shape:
 *   { id, role: "user"|"assistant", content, sources?, chunks_used?, timestamp }
 */
export function useChat(sessionId) {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Loads existing history whenever the session ID changes.
   * A brand-new session (one that's never been sent a message) simply
   * returns an empty list from the backend, which is fine.
   */
  useEffect(() => {
    if (!sessionId) return

    let isCancelled = false

    async function loadHistory() {
      setIsHistoryLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/chat/history/${sessionId}`)
        if (!response.ok) throw new Error("Failed to load conversation history.")
        const data = await response.json()

        if (isCancelled) return

        setMessages(
          data.messages.map((msg) => ({
            id: generateId(),
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            // Source citations aren't stored historically by the backend —
            // they're only available on the response that created the message
            sources: [],
          }))
        )
      } catch (err) {
        if (!isCancelled) setError(err.message)
      } finally {
        if (!isCancelled) setIsHistoryLoading(false)
      }
    }

    loadHistory()

    return () => { isCancelled = true }
  }, [sessionId])

  /**
   * Sends a question to the RAG endpoint for the current session.
   * Optimistically adds the user bubble immediately so the UI feels instant,
   * then appends the assistant reply once the API responds.
   */
  const sendMessage = useCallback(
    async (question, category = "All") => {
      const trimmedQuestion = question.trim()
      if (!trimmedQuestion || isLoading || !sessionId) return

      setError(null)

      const userMessage = {
        id: generateId(),
        role: "user",
        content: trimmedQuestion,
        timestamp: new Date(),
      }
      setMessages((previous) => [...previous, userMessage])
      setIsLoading(true)

      try {
        const response = await fetch("/api/chat/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmedQuestion,
            session_id: sessionId,
            category,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || "Failed to get a response.")
        }

        const assistantMessage = {
          id: generateId(),
          role: "assistant",
          content: data.answer,
          sources: data.sources ?? [],
          chunks_used: data.chunks_used,
          timestamp: new Date(),
        }
        setMessages((previous) => [...previous, assistantMessage])
        return { success: true, firstMessage: trimmedQuestion }
      } catch (err) {
        // Keep the user message visible so they can see what failed
        setError(err.message)
        return { success: false, error: err.message }
      } finally {
        setIsLoading(false)
      }
    },
    [sessionId, isLoading]
  )

  return {
    messages,
    isLoading,
    isHistoryLoading,
    error,
    sendMessage,
  }
}