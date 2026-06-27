import { useState } from "react"
import { MessageSquare, FolderOpen, Brain, Database } from "lucide-react"
import DocumentPanel from "./components/DocumentPanel"
import ChatInterface from "./components/ChatInterface"

// Navigation items — adding views here automatically adds them to the sidebar
const NAV_ITEMS = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    heading: "Chat",
    subheading: "Ask questions about your HR documents",
  },
  {
    id: "documents",
    label: "Knowledge base",
    icon: FolderOpen,
    heading: "Knowledge base",
    subheading: "Upload and manage your HR documents",
  },
]

/**
 * Sidebar navigation button.
 * Active state: white card lift with amber icon — feels like a selected document tab.
 * Inactive state: transparent with muted text, full hover treatment.
 */
function NavButton({ item, isActive, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-1
        transition-all duration-150 text-left
        ${isActive
          ? "bg-white shadow-nav-active text-hr-navy font-medium"
          : "text-stone-500 hover:bg-white/60 hover:text-stone-700"
        }
      `}
    >
      <Icon
        size={16}
        className={`flex-shrink-0 transition-colors ${
          isActive ? "text-amber-500" : "text-stone-400"
        }`}
      />
      {item.label}
    </button>
  )
}

/**
 * Placeholder shown in the content area for views not yet built.
 * Replaced step by step as we add ChatInterface.
 */
function ViewPlaceholder({ heading, subheading, icon: Icon }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mb-1">
        <Icon size={22} className="text-stone-400" />
      </div>
      <p className="text-sm font-medium text-stone-600">{heading}</p>
      <p className="text-xs text-stone-400 max-w-xs">{subheading}</p>
    </div>
  )
}

/**
 * App — the two-panel shell.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ Sidebar (256px fixed) │ Content (flex-1)     │
 *   │  · Logo               │  · Top bar           │
 *   │  · Nav items          │  · Active view       │
 *   │  · Footer             │                      │
 *   └──────────────────────────────────────────────┘
 */
export default function App() {
  const [activeView, setActiveView] = useState("chat")
  const currentNavItem = NAV_ITEMS.find((item) => item.id === activeView)

  return (
    <div className="flex h-full bg-hr-bg font-sans text-hr-ink">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-hr-sidebar border-r border-stone-200">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-stone-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-hr-navy flex items-center justify-center flex-shrink-0">
              <Brain size={16} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-hr-navy leading-none truncate">HR Copilot</p>
              <p className="text-xs text-stone-400 mt-0.5">Intelligence Assistant</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 pt-4 overflow-y-auto">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-widest px-2 mb-2">
            Navigation
          </p>
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeView === item.id}
              onClick={() => setActiveView(item.id)}
            />
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-5 py-4 border-t border-stone-200">
          <div className="flex items-center gap-2">
            <Database size={12} className="text-stone-300 flex-shrink-0" />
            <p className="text-xs text-stone-400 truncate">Groq · LLaMA 3.1 · ChromaDB</p>
          </div>
        </div>

      </aside>

      {/* ── Content area ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-stone-200 flex items-center px-6">
          <div>
            <h1 className="text-sm font-semibold text-stone-800 leading-none">
              {currentNavItem?.heading}
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">{currentNavItem?.subheading}</p>
          </div>
        </header>

        {/* Active view */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeView === "chat" && <ChatInterface />}
          {activeView === "documents" && <DocumentPanel />}
        </div>

      </div>
    </div>
  )
}