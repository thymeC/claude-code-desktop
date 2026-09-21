import { useState, type FormEvent } from 'react'
import type { AuthSource } from '../lib/types'

interface Props {
  onSave: (apiKey: string) => Promise<void>
  onClear?: () => Promise<void>
  hasStoredKey?: boolean
  source?: AuthSource
}

export function ApiKeyPrompt({ onSave, onClear, hasStoredKey, source }: Props) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Paste your Anthropic API key to continue.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(trimmed)
      setKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="onboarding api-key-prompt">
      <h1>Claude Code Desktop</h1>
      <p className="muted">
        {source === 'claude-login'
          ? 'Claude Code CLI login was detected, but this app still needs an Anthropic API key to run sessions.'
          : 'No Anthropic API key found. Paste your API key to continue.'}
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <label className="field-label" htmlFor="api-key">
          Anthropic API key
        </label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
        />
        {error ? <p className="field-error">{error}</p> : null}
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
          {hasStoredKey && onClear ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void onClear()}
            >
              Clear saved key
            </button>
          ) : null}
        </div>
      </form>
      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        Keys are stored encrypted with the OS keychain when available. You can also set{' '}
        <code>ANTHROPIC_API_KEY</code> in your environment.
      </p>
    </section>
  )
}
