import { useState, useEffect, useCallback } from "react";

const API_BASE_URL = "http://localhost:8000";

/**
 * DocumentList
 *
 * Displays all uploaded documents with their metadata and a delete
 * button per row. Handles its own data fetching, loading states,
 * per-document delete confirmation, and error display.
 *
 * No props required — fetches directly from /api/documents/.
 */
export default function DocumentList() {
  const [documents, setDocuments]           = useState([]);
  const [isFetching, setIsFetching]         = useState(true);
  const [fetchError, setFetchError]         = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId]       = useState(null);
  const [deleteError, setDeleteError]       = useState(null);

  // ── Fetch document list ──────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const data = await response.json();
      setDocuments(data.documents);
    } catch (error) {
      setFetchError("Failed to load documents. Is the backend running?");
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Delete a document ────────────────────────────────────────
  const handleDeleteConfirmed = async (documentId) => {
    setDeletingDocumentId(documentId);
    setDeleteError(null);
    setConfirmDeleteId(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/documents/${documentId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      // Remove the deleted document from local state immediately
      // so the UI updates without waiting for a re-fetch
      setDocuments((previous) =>
        previous.filter((document) => document.id !== documentId)
      );
    } catch (error) {
      setDeleteError(`Failed to delete document. Please try again.`);
    } finally {
      setDeletingDocumentId(null);
    }
  };

  // ── Loading state ────────────────────────────────────────────
  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <span className="inline-block w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-3" />
        Loading documents...
      </div>
    );
  }

  // ── Fetch error state ────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-3">
        <span className="text-lg">⚠️</span>
        <div>
          <p className="font-semibold mb-1">Could not load documents</p>
          <p>{fetchError}</p>
          <button
            onClick={fetchDocuments}
            className="mt-2 text-red-600 underline hover:no-underline text-xs"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-3">📂</p>
        <p className="font-medium text-gray-500">No documents uploaded yet</p>
        <p className="text-sm mt-1">
          Upload a PDF, Word, or text file to get started.
        </p>
      </div>
    );
  }

  // ── Document list ────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Delete error banner */}
      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>⚠️ {deleteError}</span>
          <button
            onClick={() => setDeleteError(null)}
            className="text-red-400 hover:text-red-600 ml-4 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Header row */}
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
        <span className="col-span-5">File</span>
        <span className="col-span-2">Category</span>
        <span className="col-span-2">Chunks</span>
        <span className="col-span-2">Status</span>
        <span className="col-span-1"></span>
      </div>

      {/* Document rows */}
      {documents.map((document) => {
        const isBeingDeleted  = deletingDocumentId === document.id;
        const isAwaitingConfirm = confirmDeleteId === document.id;

        return (
          <div
            key={document.id}
            className={`grid grid-cols-12 gap-3 items-center px-4 py-3 rounded-xl border transition-colors ${
              isBeingDeleted
                ? "bg-red-50 border-red-200 opacity-60"
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            {/* Filename + type icon */}
            <div className="col-span-5 flex items-center gap-2 min-w-0">
              <span className="text-lg flex-shrink-0">
                {fileTypeIcon(document.file_type)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {document.filename}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(document.uploaded_at)}
                </p>
              </div>
            </div>

            {/* Category */}
            <div className="col-span-2">
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 font-medium">
                {document.category}
              </span>
            </div>

            {/* Chunk count */}
            <div className="col-span-2 text-sm text-gray-600">
              {document.chunk_count ?? "—"} chunks
            </div>

            {/* Status badge */}
            <div className="col-span-2">
              <StatusBadge status={document.status} />
            </div>

            {/* Delete control */}
            <div className="col-span-1 flex justify-end">
              {isBeingDeleted ? (
                <span className="inline-block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : isAwaitingConfirm ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDeleteConfirmed(document.id)}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-md font-medium transition-colors"
                    title="Confirm delete"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-md font-medium transition-colors"
                    title="Cancel"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(document.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50"
                  title={`Delete ${document.filename}`}
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Footer summary */}
      <p className="text-xs text-gray-400 text-right pt-1 pr-1">
        {documents.length} document{documents.length !== 1 ? "s" : ""} in knowledge base
      </p>
    </div>
  );
}


// ── Helper components ──────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    ready: "bg-green-50 text-green-700 border-green-200",
    processing: "bg-yellow-50 text-yellow-700 border-yellow-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  const labels = {
    ready: "✅ Ready",
    processing: "⏳ Processing",
    error: "❌ Error",
  };

  const styleClass = styles[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const label      = labels[status] ?? status;

  return (
    <span className={`text-xs border rounded-full px-2.5 py-0.5 font-medium ${styleClass}`}>
      {label}
    </span>
  );
}


// ── Helper functions ───────────────────────────────────────────

function fileTypeIcon(fileType) {
  const icons = {
    pdf:  "📄",
    docx: "📝",
    txt:  "📃",
    md:   "📋",
  };
  return icons[fileType] ?? "📁";
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric",
  });
}