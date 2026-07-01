import { useState } from "react";

const API_BASE_URL = "http://localhost:8000";

/**
 * ChatMessage
 *
 * Renders one message in the chat window and manages the full
 * HITL approval lifecycle internally. The parent component passes
 * a message object and never needs to know about approval state.
 *
 * Props:
 *   message: {
 *     role: "user" | "assistant",
 *     content: string,
 *     requires_approval?: boolean,
 *     pending_answer?: string,
 *     sources?: string[],
 *     session_id?: string,
 *     matched_topics?: string[],
 *   }
 */
export default function ChatMessage({ message }) {
  // Tracks where we are in the approval flow for this specific message.
  // Only used when message.requires_approval is true.
  const [approvalState, setApprovalState] = useState("pending"); // "pending" | "approved" | "rejected"
  const [approvedAnswer, setApprovedAnswer] = useState(null);
  const [approvedSources, setApprovedSources] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalError, setApprovalError] = useState(null);

  // ── User message ─────────────────────────────────────────────
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  // ── HITL approval flow ───────────────────────────────────────
  if (message.requires_approval) {
    if (approvalState === "approved" && approvedAnswer) {
      return (
        <ApprovedAnswer answer={approvedAnswer} sources={approvedSources} />
      );
    }

    if (approvalState === "rejected") {
      return <RejectedMessage />;
    }

    // Still pending — show the approval card
    return (
      <PendingApprovalCard
        matchedTopics={message.matched_topics ?? []}
        isSubmitting={isSubmitting}
        approvalError={approvalError}
        onApprove={async () => {
          setIsSubmitting(true);
          setApprovalError(null);
          try {
            const response = await fetch(`${API_BASE_URL}/api/chat/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: message.session_id,
                pending_answer: message.pending_answer,
                sources: message.sources ?? [],
                approved: true,
              }),
            });
            if (!response.ok) {
              throw new Error(`Server returned ${response.status}`);
            }
            const data = await response.json();
            setApprovedAnswer(data.answer);
            setApprovedSources(data.sources);
            setApprovalState("approved");
          } catch (error) {
            setApprovalError("Failed to approve. Please try again.");
          } finally {
            setIsSubmitting(false);
          }
        }}
        onReject={async () => {
          setIsSubmitting(true);
          setApprovalError(null);
          try {
            const response = await fetch(`${API_BASE_URL}/api/chat/approve`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: message.session_id,
                pending_answer: message.pending_answer,
                sources: message.sources ?? [],
                approved: false,
              }),
            });
            if (!response.ok) {
              throw new Error(`Server returned ${response.status}`);
            }
            setApprovalState("rejected");
          } catch (error) {
            setApprovalError("Failed to process rejection. Please try again.");
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    );
  }

  // ── Regular assistant message ────────────────────────────────
  return (
    <AssistantMessage
      content={message.content}
      sources={message.sources ?? []}
    />
  );
}


// ── Sub-components ──────────────────────────────────────────────

function AssistantMessage({ content, sources }) {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] space-y-2">
        <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          {content}
        </div>
        {sources.length > 0 && <SourceList sources={sources} />}
      </div>
    </div>
  );
}


function PendingApprovalCard({
  matchedTopics,
  isSubmitting,
  approvalError,
  onApprove,
  onReject,
}) {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] bg-amber-50 border border-amber-400 rounded-2xl rounded-tl-sm px-4 py-4 shadow-sm space-y-3">

        {/* Header */}
        <div className="flex items-start gap-2">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Sensitive HR information detected
            </p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              This question involves sensitive HR information. Should the
              assistant proceed with this answer?
            </p>
          </div>
        </div>

        {/* Matched topic badges */}
        {matchedTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {matchedTopics.map((topic) => (
              <span
                key={topic}
                className="text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2.5 py-0.5 font-medium"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Error state */}
        {approvalError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {approvalError}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onApprove}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isSubmitting ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>✅</span>
            )}
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 text-sm font-medium rounded-lg border border-red-300 transition-colors"
          >
            <span>❌</span>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}


function ApprovedAnswer({ answer, sources }) {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] space-y-2">
        <div className="bg-amber-50 border border-amber-400 text-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-xs mb-2 pb-2 border-b border-amber-200">
            <span>✅</span>
            <span>Human-approved response</span>
          </div>
          {answer}
        </div>
        {sources.length > 0 && <SourceList sources={sources} />}
      </div>
    </div>
  );
}


function RejectedMessage() {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[75%] bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
        <div className="flex items-center gap-1.5 font-semibold mb-1">
          <span>❌</span>
          <span>Response rejected</span>
        </div>
        <p className="text-red-600 text-xs leading-relaxed">
          Please rephrase your question or contact HR directly.
        </p>
      </div>
    </div>
  );
}


function SourceList({ sources }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {sources.map((source) => (
        <span
          key={source}
          className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5"
        >
          📄 {source}
        </span>
      ))}
    </div>
  );
}