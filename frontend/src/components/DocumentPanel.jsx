import { useState, useRef } from "react"
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Database,
} from "lucide-react"
import { useDocuments } from "../hooks/useDocuments"

const CATEGORIES = ["General", "Policies", "Benefits", "Onboarding", "Compliance", "Training"]
const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"]

/**
 * Strips the 32-character UUID prefix the backend adds to prevent filename
 * collisions. Stored: "7b15261ad01143809a98310afb1a375d_report.pdf"
 * Displayed: "report.pdf"
 */
function getDisplayFilename(filename) {
  return filename.replace(/^[0-9a-f]{32}_/, "")
}

/** Formats an ISO date string to "27 Jun 2026". */
function formatDate(isoString) {
  if (!isoString) return "—"
  return new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// ─── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  ready:      { wrapperClass: "bg-emerald-50 text-emerald-700", dotClass: "bg-emerald-500", label: "Ready" },
  processing: { wrapperClass: "bg-amber-50 text-amber-700",    dotClass: "bg-amber-400",   label: "Processing" },
  error:      { wrapperClass: "bg-red-50 text-red-700",        dotClass: "bg-red-500",     label: "Error" },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.processing
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.wrapperClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
      {config.label}
    </span>
  )
}

// ─── Document table row ────────────────────────────────────────────────────────

/**
 * Single document row with an inline delete confirmation flow.
 * First click shows "Delete? Yes / No". This avoids a modal while still
 * preventing accidental deletions.
 */
function DocumentRow({ doc, onDelete }) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const displayName = getDisplayFilename(doc.filename)

  async function handleConfirmDelete() {
    setIsDeleting(true)
    await onDelete(doc.id)
    // Component may unmount after delete — no need to reset state
  }

  return (
    <tr className="group border-b border-stone-100 hover:bg-stone-50/40 transition-colors">
      {/* Filename */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={14} className="text-stone-300 flex-shrink-0" />
          <span
            className="text-sm text-stone-700 font-medium truncate"
            title={displayName}
          >
            {displayName}
          </span>
        </div>
      </td>

      {/* Category */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
          {doc.category}
        </span>
      </td>

      {/* Chunks */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-stone-500 tabular-nums">
          {doc.chunk_count ?? "—"}
        </span>
      </td>

      {/* Upload date */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-stone-400">{formatDate(doc.uploaded_at)}</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={doc.status} />
      </td>

      {/* Delete action */}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {isConfirmingDelete ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-stone-500">Delete?</span>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Yes"}
            </button>
            <button
              onClick={() => setIsConfirmingDelete(false)}
              className="text-xs text-stone-400 hover:text-stone-600"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsConfirmingDelete(true)}
            aria-label={`Delete ${displayName}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-50 text-stone-300 hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Upload zone ───────────────────────────────────────────────────────────────

/**
 * UploadZone handles three states:
 *   1. Default — shows the drop target
 *   2. File selected — shows filename, category picker, and upload button
 *   3. Uploading — shows spinner, all controls disabled
 *
 * The drag-and-drop and click-to-browse share the same file validation
 * and selection flow so there's no duplicated logic.
 */
function UploadZone({ onUpload, isUploading }) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [category, setCategory] = useState("General")
  const [uploadResult, setUploadResult] = useState(null) // { success, message }
  const fileInputRef = useRef(null)

  function validateAndSelectFile(file) {
    if (!file) return
    const extension = file.name.split(".").pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setUploadResult({
        success: false,
        message: `Unsupported file type ".${extension}". Use PDF, DOCX, TXT, or MD.`,
      })
      return
    }
    setSelectedFile(file)
    setUploadResult(null)
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e) {
    // Only clear the drag state when leaving the zone itself, not a child element
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    validateAndSelectFile(e.dataTransfer.files[0])
  }

  function handleInputChange(e) {
    validateAndSelectFile(e.target.files[0])
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return

    const result = await onUpload(selectedFile, category)

    if (result.success) {
      setUploadResult({
        success: true,
        message: `"${getDisplayFilename(selectedFile.name)}" processed and added to the knowledge base.`,
      })
      setSelectedFile(null)
      // Reset so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = ""
    } else {
      setUploadResult({ success: false, message: result.error })
    }
  }

  function handleCancelSelection() {
    setSelectedFile(null)
    setUploadResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="p-5">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !selectedFile && !isUploading && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center transition-all duration-150
          ${isDragging
            ? "border-amber-400 bg-amber-50 cursor-copy"
            : selectedFile
              ? "border-stone-200 bg-white cursor-default"
              : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/20 cursor-pointer"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={handleInputChange}
        />

        {selectedFile ? (
          // ── File selected ───────────────────────────────────────
          <div className="flex flex-col items-center gap-4">
            {/* File preview */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <FileText size={16} className="text-amber-600" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-stone-700 truncate max-w-[240px]">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-stone-400">
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                disabled={isUploading}
                className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white text-stone-700
                           focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <button
                onClick={(e) => { e.stopPropagation(); handleUpload() }}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-1.5 bg-hr-navy text-white text-sm font-medium
                           rounded-lg hover:bg-opacity-90 disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all"
              >
                {isUploading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    Upload
                  </>
                )}
              </button>

              {!isUploading && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleCancelSelection() }}
                  className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          // ── Default drop zone ───────────────────────────────────
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-1">
              <Upload
                size={18}
                className={`transition-colors ${isDragging ? "text-amber-500" : "text-stone-400"}`}
              />
            </div>
            <p className="text-sm font-medium text-stone-600">
              {isDragging ? "Drop to upload" : "Drop a file here or click to browse"}
            </p>
            <p className="text-xs text-stone-400">PDF, DOCX, TXT, MD · Max 25 MB</p>
          </div>
        )}
      </div>

      {/* Upload result feedback */}
      {uploadResult && (
        <div
          className={`mt-3 flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg ${
            uploadResult.success
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-600"
          }`}
        >
          {uploadResult.success
            ? <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />
            : <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          }
          {uploadResult.message}
        </div>
      )}
    </div>
  )
}

// ─── Main panel ────────────────────────────────────────────────────────────────

/**
 * DocumentPanel — the Knowledge base view.
 *
 * Layout (fills the content area):
 *   ┌─────────────────────────────────────────┐
 *   │ Stats strip (fixed)                     │
 *   ├─────────────────────────────────────────┤
 *   │ Upload zone (fixed)                     │
 *   ├─────────────────────────────────────────┤
 *   │ Document table (scrollable)             │
 *   └─────────────────────────────────────────┘
 */
export default function DocumentPanel() {
  const { documents, stats, isLoading, isUploading, error, uploadDocument, deleteDocument } =
    useDocuments()

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* Stats strip */}
      <div className="flex-shrink-0 bg-white border-b border-stone-200 px-5 py-3 flex items-center gap-5">
        <div className="flex items-center gap-2">
          <Database size={13} className="text-stone-400" />
          <span className="text-xs text-stone-500">
            <span className="font-semibold text-stone-700">{stats.ready_documents}</span>
            {" "}document{stats.ready_documents !== 1 ? "s" : ""} ready
          </span>
        </div>
        <div className="w-px h-3 bg-stone-200" />
        <span className="text-xs text-stone-500">
          <span className="font-semibold text-stone-700">{stats.total_chunks}</span>
          {" "}chunks indexed
        </span>
      </div>

      {/* Upload zone */}
      <div className="flex-shrink-0 border-b border-stone-200 bg-hr-bg">
        <UploadZone onUpload={uploadDocument} isUploading={isUploading} />
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">

        {/* Global error (e.g. network failure on fetch) */}
        {error && (
          <div className="m-5 flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 text-sm rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          // Loading skeleton
          <div className="p-5 space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-11 bg-stone-100 rounded-lg animate-pulse" />
            ))}
          </div>

        ) : documents.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-8">
            <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center mb-1">
              <FileText size={18} className="text-stone-300" />
            </div>
            <p className="text-sm font-medium text-stone-500">No documents yet</p>
            <p className="text-xs text-stone-400 max-w-xs">
              Upload a file above to start building your knowledge base
            </p>
          </div>

        ) : (
          // Document table
          <table className="w-full">
            <thead className="sticky top-0 bg-white border-b border-stone-200 z-10">
              <tr>
                {["Document", "Category", "Chunks", "Uploaded", "Status", ""].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onDelete={deleteDocument} />
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
