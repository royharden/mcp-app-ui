import { useEffect, useRef, type KeyboardEvent } from "react";
import type { PrepareOutput } from "../server/domain/schemas.ts";

interface ConfirmDialogProps {
  prepared: PrepareOutput;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Where focus goes when the dialog closes. After a submit finished (recorded, failed or
 * unknown) the Review button is about to disappear, so focus the outcome region, which stays.
 * After Cancel, focus the Review button. The drawer heading (tabIndex -1) is the fallback.
 */
function returnFocus(afterSubmit: boolean): void {
  const heading = document.getElementById("detail-heading");
  const target = afterSubmit
    ? document.querySelector<HTMLElement>("[data-outcome]")
    : document.querySelector<HTMLElement>('[data-action="prepare"]:not([disabled])');
  (target ?? heading)?.focus();
}

/**
 * Focus-managed confirmation. The statement is the server's exact string, rendered as text.
 * Escape cancels; Tab stays inside the dialog; while recording, focus rests on the dialog
 * heading so it never falls out of the modal; on close focus returns to the drawer.
 */
export function ConfirmDialog({ prepared, submitting, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Set once a submit starts; the dialog then closes only because that submit finished.
  const submittedRef = useRef(false);

  useEffect(() => {
    cancelRef.current?.focus();
    // The opener (Review button) is disabled while preparing, so return focus explicitly.
    // Passive-effect cleanup runs after the commit that rendered the outcome region.
    return () => returnFocus(submittedRef.current);
  }, []);

  useEffect(() => {
    if (submitting) {
      submittedRef.current = true;
      headingRef.current?.focus();
    }
  }, [submitting]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
    if (focusable.length === 0) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-heading"
        aria-describedby="confirm-statement confirm-note"
        className="dialog"
        onKeyDown={onKeyDown}
      >
        <h2 id="confirm-heading" ref={headingRef} tabIndex={-1}>
          Confirm this exact statement
        </h2>
        <p id="confirm-statement" className="statement" data-field="statement">
          {prepared.statement}
        </p>
        <p id="confirm-note" className="muted small">
          Confirming records a synthetic decision for version {prepared.requestVersion} only. It does not prove who
          pressed the button, and no purchase, email or other external action happens. Expires {prepared.expiresAt}.
        </p>
        <div className="actions">
          <button ref={cancelRef} type="button" data-action="cancel" disabled={submitting} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" data-action="confirm" className="primary" disabled={submitting} onClick={onConfirm}>
            {submitting ? "Recording…" : prepared.decision === "approve" ? "Confirm approval" : "Confirm rejection"}
          </button>
        </div>
      </div>
    </div>
  );
}
