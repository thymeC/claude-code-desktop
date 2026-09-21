import type { CliStatus } from '../lib/types'

interface Props {
  status: Extract<CliStatus, { found: false }>
  onRecheck: () => void
  onBrowse: () => void
}

export function Onboarding({ status, onRecheck, onBrowse }: Props) {
  return (
    <section className="onboarding">
      <h1>Claude Code Desktop</h1>
      <p className="muted">Claude Code CLI is required to continue.</p>
      <pre className="guidance">{status.guidance}</pre>
      <div className="row">
        <button type="button" onClick={onRecheck}>
          Check again
        </button>
        <button type="button" className="secondary" onClick={onBrowse}>
          Browse for claude
        </button>
      </div>
    </section>
  )
}
