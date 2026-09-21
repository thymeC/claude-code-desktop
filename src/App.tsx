import { useEffect, useState } from 'react'
import { ccd } from './lib/ipc'
import type { AttachmentRef, ChatEvent, CliStatus } from './lib/types'
import { Onboarding } from './components/Onboarding'
import { ProjectBar } from './components/ProjectBar'
import { ChatTranscript, type TranscriptItem } from './components/ChatTranscript'
import { Composer } from './components/Composer'

export function App() {
  const [cli, setCli] = useState<CliStatus | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  async function refreshCli() {
    const status = await ccd().cliCheck()
    setCli(status)
    return status
  }

  useEffect(() => {
    void (async () => {
      const status = await refreshCli()
      if (status.found) {
        const path = await ccd().projectGet()
        setProjectPath(path)
      }
    })()

    return ccd().onChatEvent((event: ChatEvent) => {
      if (event.type === 'partial' && event.text) {
        setStreaming((prev) => prev + event.text)
        setBusy(true)
      } else if (event.type === 'message' && event.text) {
        setStreaming('')
        setItems((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: event.role ?? 'assistant', text: event.text! },
        ])
        setBusy(false)
      } else if (event.type === 'error' && event.error) {
        setError(event.error)
        setBusy(false)
      } else if (event.type === 'done') {
        setBusy(false)
        setStreaming((prev) => {
          if (prev) {
            setItems((items) => [
              ...items,
              { id: crypto.randomUUID(), role: 'assistant', text: prev },
            ])
          }
          return ''
        })
      }
    })
  }, [])

  async function ensureSession(path: string) {
    await ccd().sessionNew(path)
    setSessionReady(true)
    setItems([])
    setStreaming('')
  }

  async function openProject() {
    const path = await ccd().projectOpen()
    if (!path) return
    setProjectPath(path)
    await ensureSession(path)
  }

  async function send(text: string) {
    if (!projectPath) return
    if (!sessionReady) await ensureSession(projectPath)
    setItems((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }])
    setBusy(true)
    setError(null)
    try {
      await ccd().chatSend(text, attachments)
      setAttachments([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (!cli) {
    return <main className="app-shell">Loading…</main>
  }

  if (!cli.found) {
    return (
      <main className="app-shell">
        <Onboarding
          status={cli}
          onRecheck={() => void refreshCli()}
          onBrowse={() => void ccd().cliBrowse().then((s) => s && setCli(s))}
        />
      </main>
    )
  }

  return (
    <div className="layout">
      <ProjectBar projectPath={projectPath} onOpen={() => void openProject()} />
      <main className="chat-main">
        {!projectPath ? (
          <div className="empty">
            <p>Open a project folder to start chatting with Claude Code.</p>
            <button type="button" onClick={() => void openProject()}>
              Open folder
            </button>
          </div>
        ) : (
          <>
            <div className="cli-meta muted">
              Using {cli.path} · {cli.version}
            </div>
            {error ? <div className="error-banner">{error}</div> : null}
            <ChatTranscript items={items} streaming={streaming} />
            <Composer
              attachments={attachments}
              onRemoveAttachment={(p) => setAttachments((prev) => prev.filter((a) => a.path !== p))}
              onAttach={() => setError('Attachments arrive in the next step — use Open folder chat for now.')}
              onSend={(t) => void send(t)}
              onStop={() => void ccd().chatStop()}
              busy={busy}
            />
          </>
        )}
      </main>
    </div>
  )
}
