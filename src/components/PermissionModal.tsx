import type { ChatEvent } from '../lib/types'

interface Props {
  request: Extract<ChatEvent, { type: 'permission_request' }> | ChatEvent
  onDecide: (decision: 'approve' | 'deny') => void
}

export function PermissionModal({ request, onDecide }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>Allow tool use?</h2>
        <p>
          <strong>{request.toolName ?? 'tool'}</strong>
        </p>
        <pre className="tool-input">{JSON.stringify(request.toolInput ?? {}, null, 2)}</pre>
        <div className="row">
          <button type="button" className="secondary" onClick={() => onDecide('deny')}>
            Deny
          </button>
          <button type="button" className="secondary" onClick={() => onDecide('deny')}>
            Cancel
          </button>
          <button type="button" onClick={() => onDecide('approve')}>
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}
