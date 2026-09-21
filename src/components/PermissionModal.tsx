import { useEffect, useState, type FormEvent } from 'react'
import type { ChatEvent } from '../lib/types'

interface Props {
  request: Extract<ChatEvent, { type: 'permission_request' }> | ChatEvent
  onDecide: (decision: 'approve' | 'deny') => void
}

type Choice = 'approve' | 'deny'

/**
 * Cursor-style: pick Allow / Reject, then submit with the primary button (Enter also submits).
 */
export function PermissionModal({ request, onDecide }: Props) {
  const [choice, setChoice] = useState<Choice>('approve')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setChoice('approve')
    setSubmitting(false)
  }, [request.requestId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDecide('deny')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDecide])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (submitting) return
    setSubmitting(true)
    onDecide(choice)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <form className="modal perm-modal" onSubmit={submit}>
        <h2 id="perm-title">Run tool?</h2>
        <p className="perm-tool">
          <strong>{request.toolName ?? 'tool'}</strong>
        </p>
        <pre className="tool-input">{JSON.stringify(request.toolInput ?? {}, null, 2)}</pre>

        <fieldset className="perm-choices">
          <legend className="sr-only">Choose an action</legend>
          <label className={`perm-choice ${choice === 'approve' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="perm"
              value="approve"
              checked={choice === 'approve'}
              onChange={() => setChoice('approve')}
            />
            <span className="perm-choice-title">Allow</span>
            <span className="perm-choice-desc muted">Run this tool once</span>
          </label>
          <label className={`perm-choice ${choice === 'deny' ? 'selected' : ''}`}>
            <input
              type="radio"
              name="perm"
              value="deny"
              checked={choice === 'deny'}
              onChange={() => setChoice('deny')}
            />
            <span className="perm-choice-title">Reject</span>
            <span className="perm-choice-desc muted">Skip this tool call</span>
          </label>
        </fieldset>

        <div className="perm-actions">
          <button type="button" className="secondary" onClick={() => onDecide('deny')} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className={choice === 'approve' ? 'perm-submit allow' : 'perm-submit reject'}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : choice === 'approve' ? 'Allow' : 'Reject'}
          </button>
        </div>
      </form>
    </div>
  )
}
