import { useState, useCallback, useEffect } from "react"

/**
 * useDocuments
 *
 * Centralises all document-related API calls so components stay clean.
 * Fetches the document list and stats in parallel on mount, and refreshes
 * both after every upload or delete.
 */
export function useDocuments() {
  const [documents, setDocuments] = useState([])
  const [stats, setStats] = useState({
    total_documents: 0,
    ready_documents: 0,
    total_chunks: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Fetches the document list and stats in parallel.
   * Called on mount and after every mutation.
   */
  const fetchDocuments = useCallback(async () => {
    try {
      const [docsResponse, statsResponse] = await Promise.all([
        fetch("/api/documents/"),
        fetch("/api/documents/stats"),
      ])

      if (!docsResponse.ok) throw new Error("Failed to load documents.")
      if (!statsResponse.ok) throw new Error("Failed to load stats.")

      const docsData = await docsResponse.json()
      const statsData = await statsResponse.json()

      setDocuments(docsData.documents)
      setStats(statsData)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Uploads a file with a category label.
   * Returns { success: boolean, data?, error? } so the UI can react.
   */
  const uploadDocument = useCallback(
    async (file, category) => {
      setIsUploading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("category", category)

        const response = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || "Upload failed.")
        }

        // Refresh the list so the new document appears immediately
        await fetchDocuments()
        return { success: true, data }
      } catch (err) {
        setError(err.message)
        return { success: false, error: err.message }
      } finally {
        setIsUploading(false)
      }
    },
    [fetchDocuments]
  )

  /**
   * Deletes a document by its database ID.
   * The backend removes it from disk, ChromaDB, and SQLite.
   */
  const deleteDocument = useCallback(
    async (documentId) => {
      try {
        const response = await fetch(`/api/documents/${documentId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.detail || "Delete failed.")
        }

        await fetchDocuments()
        return { success: true }
      } catch (err) {
        setError(err.message)
        return { success: false, error: err.message }
      }
    },
    [fetchDocuments]
  )

  // Fetch on mount
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return {
    documents,
    stats,
    isLoading,
    isUploading,
    error,
    uploadDocument,
    deleteDocument,
    refreshDocuments: fetchDocuments,
  }
}
