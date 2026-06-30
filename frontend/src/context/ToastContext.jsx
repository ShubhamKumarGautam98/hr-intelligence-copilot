import { createContext, useContext, useState, useCallback } from "react"
import { CheckCircle, AlertCircle, Info, X } from "lucide-react"

const ToastContext = createContext(null)

const TOAST_CONFIG = {
  success: { icon: CheckCircle, className: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  error:   { icon: AlertCircle, className: "bg-red-50 text-red-700 border-red-100" },
  info:    { icon: Info,        className: "bg-stone-50 text-stone-700 border-stone-200" },
}

const AUTO_DISMISS_MS = 4000

/**
 * ToastProvider — wraps the app once in main.jsx.
 * Exposes a `toast(message, type)` function via useToast() that any
 * component can call without prop drilling.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((previous) => previous.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, type = "info") => {
      const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
      setToasts((previous) => [...previous, { id, message, type }])
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* Toast stack — fixed bottom-right, stacks upward */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(({ id, message, type }) => {
          const config = TOAST_CONFIG[type] ?? TOAST_CONFIG.info
          const Icon = config.icon
          return (
            <div
              key={id}
              role="status"
              className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-sm text-sm
                          toast-enter ${config.className}`}
            >
              <Icon size={15} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{message}</span>
              <button
                onClick={() => dismiss(id)}
                aria-label="Dismiss notification"
                className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** useToast() — call toast("message", "success" | "error" | "info") from any component. */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}
