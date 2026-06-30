import { useState, useRef, useEffect } from "react"
import {
  Send, Brain, User, FileText, AlertCircle, RefreshCw,
  Plus, MessageSquare, Trash2,
} from "lucide-react"
import { useChat } from "../hooks/useChat"
import { useChatSessions } from "../hooks/useChatSessions"
import { useToast } from "../context/ToastContext"

const CATEGORIES = ["All", "General", "Policies", "Benefits", "Onboarding", "Compliance", "Training"]

const SUGGESTED_QUESTIONS = [
  "What is the annual leave policy?",
  "How do I submit an expense claim?",
  "What are the performance review criteria?",
]

/** Generates a unique ID that works in all modern browsers. */
function generateId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Strips the 32-char UUID prefix the backend adds to stored filenames. */
function getDisplayFilename(filename) {
  return filename.replace(/^[0-9a-f]{32}_/, "")
}

/** Formats a Date to "9:42 AM". */
function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

/** Truncates a string for use as a session title in the rail. */
function truncateTitle(text, maxLength = 32) {
  const trimmed = text.trim()
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed
}

// ─── Session rail ──────────────────────────────────────────────────────────────

/**
 * Left rail listing past chat sessions, shown alongside the message thread.
 * Sessions are titled from their first user message (cached in localStorage
 * via useChatSessions, since the backend only stores raw session IDs).
 */
function SessionRail({ sessionIds, titles, currentSessionId, isLoading, onSelect, onNewChat, onDelete }) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)

  async function handleDelete(sessionId) {
    const result = await onDelete(sessionId)
    if (result.success && sessionId === currentSessionId) {
      onNewChat()
    }
    setConfirmingDeleteId(null)
  }

  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-stone-200 bg-hr-bg">

      {/* New chat button */}
      <div className="p-3 border-b border-stone-200">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-hr-navy text-white
                     text-sm font-medium rounded-lg hover:bg-opacity-90 transition-all"
        >
          <Plus size={14} />
          New chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="space-y-2 px-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sessionIds.length === 0 ? (
          <p className="text-xs text-stone-400 text-center px-3 py-6 leading-relaxed">
            No past conversations yet — your chats will appear here.
          </p>
        ) : (
          sessionIds.map((sessionId) => {
            const isActive = sessionId === currentSessionId
            const title = titles[sessionId] || "New conversation"

            return (
              <div
                key={sessionId}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 cursor-pointer transition-colors ${
                  isActive ? "bg-white shadow-nav-active" : "hover:bg-white/60"
                }`}
                onClick={() => onSelect(sessionId)}
              >
                <MessageSquare
                  size={13}
                  className={`flex-shrink-0 ${isActive ? "text-amber-500" : "text-stone-400"}`}
                />
                <span
                  className={`flex-1 text-xs truncate ${isActive ? "text-hr-navy font-medium" : "text-stone-500"}`}
                  title={title}
                >
                  {title}
                </span>

                {confirmingDeleteId === sessionId ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(sessionId)}
                      className="text-[10px] font-medium text-red-600 hover:text-red-700"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="text-[10px] text-stone-400 hover:text-stone-600"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(sessionId) }}
                    aria-label="Delete conversation"
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity
                               p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onSuggestedQuestion }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      <div>
        <div className="w-12 h-12 rounded-xl bg-hr-navy flex items-center justify-center mx-auto mb-4">
          <Brain size={22} className="text-amber-400" />
        </div>
        <h2 className="text-base font-semibold text-stone-700">How can I help?</h2>
        <p className="text-sm text-stone-400 mt-1.5 max-w-sm leading-relaxed">
          Ask me anything about the documents in your knowledge base.
          I'll find the answer and show you exactly where it came from.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestedQuestion(question)}
            className="text-left text-sm px-4 py-2.5 rounded-xl border border-stone-200
                       bg-white text-stone-600 hover:border-amber-300 hover:bg-amber-50/30
                       hover:text-stone-800 transition-all duration-150"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Loading skeleton (shown while switching to an existing session) ──────────

function MessageSkeleton() {
  return (
    <div className="py-4 max-w-4xl mx-auto w-full space-y-1">
      {[
        { isUser: true,  width: "w-1/3" },
        { isUser: false, width: "w-2/3" },
        { isUser: true,  width: "w-1/4" },
        { isUser: false, width: "w-1/2" },
      ].map((row, i) => (
        <div key={i} className={`flex gap-3 px-4 py-2 ${row.isUser ? "flex-row-reverse" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-stone-100 flex-shrink-0 animate-pulse" />
          <div className={`h-9 ${row.width} rounded-2xl bg-stone-100 animate-pulse`} />
        </div>
      ))}
    </div>
  )
}

// ─── Source citation pills ─────────────────────────────────────────────────────

function SourceCitations({ sources }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((source) => (
        <span
          key={source}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5
                     bg-stone-100 text-stone-500 rounded-full border border-stone-200"
        >
          <FileText size={10} className="flex-shrink-0" />
          {getDisplayFilename(source)}
        </span>
      ))}
    </div>
  )
}

// ─── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-full bg-hr-navy flex items-center justify-center flex-shrink-0 mt-0.5">
        <Brain size={13} className="text-amber-400" />
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex gap-3 px-4 py-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser ? "bg-stone-200" : "bg-hr-navy"
        }`}
      >
        {isUser
          ? <User size={13} className="text-stone-500" />
          : <Brain size={13} className="text-amber-400" />
        }
      </div>

      <div className={`flex flex-col max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-hr-navy text-white rounded-tr-sm"
              : "bg-white border border-stone-200 text-stone-700 rounded-tl-sm"
          }`}
        >
          {message.content}
        </div>

        {!isUser && <SourceCitations sources={message.sources} />}

        <span className="text-[10px] text-stone-300 mt-1 px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

/**
 * ChatInterface — the Chat view.
 *
 * Layout (fills the content area):
 *   ┌────────────┬──────────────────────────────┐
 *   │ Session     │ Message thread (scrollable)  │
 *   │ rail        │                              │
 *   │ (240px)     ├──────────────────────────────┤
 *   │             │ Input bar (fixed bottom)     │
 *   └────────────┴──────────────────────────────┘
 *
 * Session switching works by changing `currentSessionId`, which useChat
 * reacts to by fetching that session's history from the backend.
 */
export default function ChatInterface() {
  const [currentSessionId, setCurrentSessionId] = useState(generateId)
  const { messages, isLoading, isHistoryLoading, error, sendMessage } = useChat(currentSessionId)
  const {
    sessionIds, titles, isLoading: isSessionsLoading,
    refreshSessions, setTitleIfMissing, deleteSession,
  } = useChatSessions()

  const [inputValue, setInputValue] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  // Surface fetch/send errors as toasts in addition to the inline banner
  useEffect(() => {
    if (error) toast(error, "error")
  }, [error, toast])

  function handleInputChange(e) {
    setInputValue(e.target.value)
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
    }
  }

  async function handleSend() {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    const isFirstMessageInSession = messages.length === 0
    setInputValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    const result = await sendMessage(trimmed, selectedCategory)

    // The first message in a brand-new session becomes its title, and the
    // session needs to be added to the rail since the backend only learns
    // about it once a message has actually been sent
    if (result?.success && isFirstMessageInSession) {
      setTitleIfMissing(currentSessionId, truncateTitle(trimmed))
      refreshSessions()
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSuggestedQuestion(question) {
    setInputValue(question)
    textareaRef.current?.focus()
  }

  function handleNewChat() {
    setCurrentSessionId(generateId())
    setInputValue("")
  }

  function handleSelectSession(sessionId) {
    if (sessionId === currentSessionId) return
    setCurrentSessionId(sessionId)
    setInputValue("")
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">

      {/* ── Session rail ─────────────────────────────────────── */}
      <SessionRail
        sessionIds={sessionIds}
        titles={titles}
        currentSessionId={currentSessionId}
        isLoading={isSessionsLoading}
        onSelect={handleSelectSession}
        onNewChat={handleNewChat}
        onDelete={deleteSession}
      />

      {/* ── Conversation column ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto">
          {isHistoryLoading ? (
            <MessageSkeleton />
          ) : messages.length === 0 ? (
            <EmptyState onSuggestedQuestion={handleSuggestedQuestion} />
          ) : (
            <div className="py-4 max-w-4xl mx-auto w-full">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && <TypingIndicator />}

              {error && (
                <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 text-xs rounded-lg">
                  <AlertCircle size={13} className="flex-shrink-0" />
                  {error} — please try again.
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 border-t border-stone-200 bg-white px-4 py-3">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex-shrink-0 h-9 text-xs border border-stone-200 rounded-lg px-2.5
                         bg-white text-stone-600 focus:outline-none focus:ring-2
                         focus:ring-amber-400/40 focus:border-amber-400"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your HR documents…"
              rows={1}
              disabled={isLoading || isHistoryLoading}
              className="flex-1 resize-none border border-stone-200 rounded-xl px-4 py-2.5
                         text-sm text-stone-700 placeholder-stone-400 leading-relaxed
                         focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400
                         disabled:opacity-60 disabled:cursor-not-allowed max-h-[120px] overflow-y-auto"
            />

            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading || isHistoryLoading}
              aria-label="Send message"
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-hr-navy text-white
                         flex items-center justify-center transition-all
                         hover:bg-opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading
                ? <RefreshCw size={14} className="animate-spin" />
                : <Send size={14} />
              }
            </button>
          </div>

          <p className="text-[10px] text-stone-300 text-center mt-2 max-w-4xl mx-auto">
            Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
    </div>
  )
}