import { useState, useRef, useEffect } from "react"
import { Send, Brain, User, FileText, AlertCircle, RefreshCw, Trash2 } from "lucide-react"
import { useChat } from "../hooks/useChat"

const CATEGORIES = ["All", "General", "Policies", "Benefits", "Onboarding", "Compliance", "Training"]

const SUGGESTED_QUESTIONS = [
  "What is the annual leave policy?",
  "How do I submit an expense claim?",
  "What are the performance review criteria?",
]

/** Strips the 32-char UUID prefix the backend adds to stored filenames. */
function getDisplayFilename(filename) {
  return filename.replace(/^[0-9a-f]{32}_/, "")
}

/** Formats a Date to "9:42 AM". */
function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

// ─── Empty state ───────────────────────────────────────────────────────────────

/**
 * Shown before the first message. The suggested question chips pre-fill
 * the input so the user can edit before sending — not auto-send on click.
 */
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

/** Three bouncing dots shown while the API is processing. */
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
      {/* Avatar */}
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

      {/* Bubble + metadata */}
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

        {/* Source citations — assistant messages only */}
        {!isUser && <SourceCitations sources={message.sources} />}

        {/* Timestamp */}
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
 *   ┌─────────────────────────────────────────┐
 *   │ Message thread (scrollable, flex-1)     │
 *   ├─────────────────────────────────────────┤
 *   │ Input bar (fixed at bottom)             │
 *   │ [Category] [Textarea ──────────] [Send] │
 *   └─────────────────────────────────────────┘
 */
export default function ChatInterface() {
  const { messages, isLoading, error, sendMessage, clearMessages } = useChat()
  const [inputValue, setInputValue] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Scroll to the bottom whenever the message list or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  /** Grows the textarea with the content, capped at 120px. */
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
    setInputValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    await sendMessage(trimmed, selectedCategory)
  }

  /** Enter sends; Shift+Enter inserts a newline. */
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /** Pre-fills the input with a suggested question without sending it. */
  function handleSuggestedQuestion(question) {
    setInputValue(question)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Message thread ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isLoading ? (
          <EmptyState onSuggestedQuestion={handleSuggestedQuestion} />
        ) : (
          <div className="py-4 max-w-4xl mx-auto w-full">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && <TypingIndicator />}

            {/* Error shown inline below the last message */}
            {error && (
              <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 text-xs rounded-lg">
                <AlertCircle size={13} className="flex-shrink-0" />
                {error} — please try again.
              </div>
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ───────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-stone-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">

          {/* Category filter */}
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

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your HR documents…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none border border-stone-200 rounded-xl px-4 py-2.5
                       text-sm text-stone-700 placeholder-stone-400 leading-relaxed
                       focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400
                       disabled:opacity-60 disabled:cursor-not-allowed max-h-[120px] overflow-y-auto"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
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

          {/* Clear thread button — only visible once there are messages */}
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isLoading}
              aria-label="Clear conversation"
              title="Clear conversation"
              className="flex-shrink-0 w-9 h-9 rounded-xl border border-stone-200 text-stone-400
                         flex items-center justify-center hover:bg-red-50 hover:text-red-400
                         hover:border-red-200 disabled:opacity-40 transition-all"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <p className="text-[10px] text-stone-300 text-center mt-2 max-w-4xl mx-auto">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

    </div>
  )
}
