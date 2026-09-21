import { useState, type FormEvent } from 'react'
import type { AuthSource, ChatProvider } from '../lib/types'

interface Props {
  onSaveClaude: (apiKey: string) => Promise<void>
  onSaveOpenAi: (payload: { apiKey: string; baseUrl: string; model: string }) => Promise<void>
  onClearClaude?: () => Promise<void>
  hasStoredKey?: boolean
  source?: AuthSource
  initialProvider?: ChatProvider
}

export function ApiKeyPrompt({
  onSaveClaude,
  onSaveOpenAi,
  onClearClaude,
  hasStoredKey,
  source,
  initialProvider = 'claude',
}: Props) {
  const [provider, setProvider] = useState<ChatProvider>(initialProvider)
  const [key, setKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [model, setModel] = useState('gpt-4o-mini')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError(provider === 'openai' ? 'Paste your OpenAI API key.' : 'Paste your Anthropic API key.')
      return
    }
    if (provider === 'openai' && !baseUrl.trim()) {
      setError('Base URL is required.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (provider === 'openai') {
        await onSaveOpenAi({
          apiKey: trimmed,
          baseUrl: baseUrl.trim().replace(/\/$/, ''),
          model: model.trim() || 'gpt-4o-mini',
        })
      } else {
        await onSaveClaude(trimmed)
      }
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
        {provider === 'openai'
          ? 'OpenAI-compatible test mode — enter base URL and API key to try chat context without Claude Code.'
          : source === 'claude-login'
            ? 'Claude Code CLI login was detected, but this app still needs an Anthropic API key.'
            : 'No Anthropic API key found. Paste your key, or switch to OpenAI test mode.'}
      </p>

      <div className="provider-toggle" role="tablist">
        <button
          type="button"
          className={provider === 'claude' ? 'mode-btn active' : 'mode-btn'}
          onClick={() => setProvider('claude')}
        >
          Claude Code
        </button>
        <button
          type="button"
          className={provider === 'openai' ? 'mode-btn active' : 'mode-btn'}
          onClick={() => setProvider('openai')}
        >
          OpenAI (test)
        </button>
      </div>

      <form onSubmit={(e) => void submit(e)}>
        {provider === 'openai' ? (
          <>
            <label className="field-label" htmlFor="base-url">
              Base URL
            </label>
            <input
              id="base-url"
              type="url"
              spellCheck={false}
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={busy}
            />
            <label className="field-label" htmlFor="model">
              Model
            </label>
            <input
              id="model"
              type="text"
              spellCheck={false}
              placeholder="gpt-4o-mini"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={busy}
            />
            <label className="field-label" htmlFor="api-key">
              OpenAI API key
            </label>
          </>
        ) : (
          <label className="field-label" htmlFor="api-key">
            Anthropic API key
          </label>
        )}
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
        />
        {error ? <p className="field-error">{error}</p> : null}
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
          {provider === 'claude' && hasStoredKey && onClearClaude ? (
            <button type="button" className="secondary" disabled={busy} onClick={() => void onClearClaude()}>
              Clear saved key
            </button>
          ) : null}
        </div>
      </form>
      <p className="muted" style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
        {provider === 'openai'
          ? 'Works with OpenAI, Azure OpenAI-compatible gateways, or local servers that expose /v1/chat/completions.'
          : 'Keys are stored encrypted when the OS keychain is available.'}
      </p>
    </section>
  )
}
