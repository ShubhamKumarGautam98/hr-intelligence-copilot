import { useState, useCallback } from "react"

/** Generates a unique ID that works in all modern browsers. */
function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * useChat
 *
 * Manages conversation state for a single session.
 * The session ID is generated once on mount and stays stable for the
 * lifetime of the component — each page refresh starts a fresh session.
 *
 * Message shape:
 *   { id, role: "user"|"assistant", content, sources?, chunks_used?, timestamp }
 */
export function useChat() {
  const [messages, setMessages] = useState([])
  const [sessionId] = useState(generateId)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Sends a question to the RAG endpoint.
   * Optimistically adds the user bubble immediately so the UI feels instant,
   * then appends the assistant reply once the API responds.
   */
  const sendMessage = useCallback(
    async (question, category = "All") => {
      const trimmedQuestion = question.trim()
      if (!trimmedQuestion || isLoading) return

      setError(null)

      // Add the user message right away — no waiting for the API
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
      } catch (err) {
        // Keep the user message visible so they can see what failed
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    },
    [sessionId, isLoading]
  )

  /** Clears the local message thread (does not touch the backend session). */
  function clearMessages() {
    setMessages([])
    setError(null)
  }

  return {
    messages,
    sessionId,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  }
}
