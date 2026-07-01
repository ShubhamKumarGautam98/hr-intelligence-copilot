import { useState, useCallback, useEffect } from "react"

function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useChat(sessionId) {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [error, setError] = useState(null)

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
            sources: [],
            requires_approval: false,
            pending_answer: null,
            matched_topics: [],
            session_id: sessionId,
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
        session_id: sessionId,
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
          // HITL fields — passed through from backend
          requires_approval: data.requires_approval ?? false,
          pending_answer: data.pending_answer ?? null,
          matched_topics: data.matched_topics ?? [],
          session_id: sessionId,
        }
        setMessages((previous) => [...previous, assistantMessage])
        return { success: true, firstMessage: trimmedQuestion }
      } catch (err) {
        setError(err.message)
        return { success: false, error: err.message }
      } finally {
        setIsLoading(false)
      }
    },
    [sessionId, isLoading]
  )

  return { messages, isLoading, isHistoryLoading, error, sendMessage }
}