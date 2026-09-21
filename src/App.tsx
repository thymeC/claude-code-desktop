import { useCallback, useEffect, useState } from 'react'
import { ccd } from './lib/ipc'
import type { AttachmentRef, AuthStatus, ChatEvent, CliStatus, SessionSummary } from './lib/types'
import { Onboarding } from './components/Onboarding'
import { ApiKeyPrompt } from './components/ApiKeyPrompt'
import { ChatTranscript, type TranscriptItem } from './components/ChatTranscript'
import { Composer } from './components/Composer'
import { LeftNav } from './components/LeftNav'
import { RightPanel } from './components/RightPanel'
import { PermissionModal } from './components/PermissionModal'

export function App() {
  const [cli, setCli] = useState<CliStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [permission, setPermission] = useState<ChatEvent | null>(null)
  const [rightOpen, setRightOpen] = useState(true)
  const [toolCount, setToolCount] = useState(0)
  const [title, setTitle] = useState('New chat')
  const [copyToast, setCopyToast] = useState(false)

  async function refreshCli() {
    const status = await ccd().cliCheck()
    setCli(status)
    return status
  }

  async function refreshAuth() {
    const status = await ccd().authStatus()
    setAuth(status)
    return status
  }

  const refreshSessions = useCallback(async (path: string) => {
    const list = await ccd().sessionList(path)
    setSessions(list)
  }, [])

  useEffect(() => {
    void (async () => {
      const status = await refreshCli()
      const authStatus = await refreshAuth()
      if (status.found && authStatus.authenticated) {
        const path = await ccd().projectGet()
        setProjectPath(path)
        if (path) await refreshSessions(path)
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
      } else if (event.type === 'tool') {
        setToolCount((n) => n + 1)
      } else if (event.type === 'permission_request') {
        setPermission(event)
      } else if (event.type === 'error' && event.error) {
        setError(event.error)
        setBusy(false)
      } else if (event.type === 'done') {
        setBusy(false)
        setStreaming((prev) => {
          if (prev) {
            setItems((curr) => [
              ...curr,
              { id: crypto.randomUUID(), role: 'assistant', text: prev },
            ])
          }
          return ''
        })
        if (event.sessionId) {
          setActiveSessionId(event.sessionId)
          void (async () => {
            const path = await ccd().projectGet()
            if (path) await refreshSessions(path)
          })()
        }
      }
    })
  }, [refreshSessions])

  async function startNewChat(path = projectPath) {
    if (!path) {
      setError('Open a project first (Projects).')
      return
    }
    setError(null)
    setBusy(false)
    setStreaming('')
    setItems([])
    setAttachments([])
    setPermission(null)
    setToolCount(0)
    setTitle('New chat')
    setActiveSessionId(null)
    try {
      await ccd().chatStop()
      await ccd().sessionNew(path)
      setSessionReady(true)
      await refreshSessions(path)
    } catch (e) {
      setSessionReady(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function openProject() {
    const path = await ccd().projectOpen()
    if (!path) return
    setProjectPath(path)
    await startNewChat(path)
  }

  async function send(text: string) {
    if (!projectPath) return
    if (!sessionReady) await startNewChat(projectPath)
    if (text.trim()) {
      setItems((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }])
      if (title === 'New chat') setTitle(text.slice(0, 40))
    }
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

  async function stageFromFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const paths = files.map((f) => ccd().getPathForFile(f)).filter(Boolean)
    if (paths.length === 0) {
      setError('Could not read file path. Use the attach buttons instead.')
      return
    }
    try {
      const refs = await ccd().filesStagePaths(paths)
      setAttachments((prev) => [...prev, ...refs])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function pasteImage() {
    try {
      const ref = await ccd().filesPasteImage()
      setAttachments((prev) => [...prev, ref])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function resume(sessionId: string) {
    if (!projectPath) return
    try {
      await ccd().chatStop()
      await ccd().sessionResume(projectPath, sessionId)
      setActiveSessionId(sessionId)
      setSessionReady(true)
      setTitle(sessions.find((s) => s.id === sessionId)?.preview?.slice(0, 40) || 'Resumed chat')
      setItems([])
      setStreaming('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function copyText(text: string) {
    await ccd().clipboardWriteText(text)
    setCopyToast(true)
    window.setTimeout(() => setCopyToast(false), 1200)
  }

  if (!cli || !auth) {
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

  if (!auth.authenticated) {
    return (
      <main className="app-shell">
        <ApiKeyPrompt
          hasStoredKey={auth.hasStoredKey}
          source={auth.source}
          onSave={async (apiKey) => {
            const next = await ccd().authSetApiKey(apiKey)
            setAuth(next)
          }}
          onClear={async () => {
            const next = await ccd().authClearApiKey()
            setAuth(next)
          }}
        />
      </main>
    )
  }

  const modelLabel = cli.version.includes('Claude') ? 'Claude Code' : cli.version

  return (
    <div className={`desktop-shell${rightOpen ? ' with-right' : ''}`}>
      <LeftNav
        projectPath={projectPath}
        sessions={sessions}
        activeId={activeSessionId}
        onNew={() => void startNewChat()}
        onOpenProject={() => void openProject()}
        onSelect={(id) => void resume(id)}
      />

      <div
        className="center-pane"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files?.length) void stageFromFiles(e.dataTransfer.files)
        }}
      >
        <header className="center-header">
          <div className="title-wrap">
            <h1>{projectPath ? title : 'Claude Code Desktop'}</h1>
          </div>
          <button
            type="button"
            className="icon-btn"
            title={rightOpen ? 'Hide panel' : 'Show panel'}
            onClick={() => setRightOpen((v) => !v)}
          >
            ▤
          </button>
        </header>

        {!projectPath ? (
          <div className="empty">
            <p>Choose a project to start coding with Claude.</p>
            <button type="button" className="primary-btn" onClick={() => void openProject()}>
              Open project
            </button>
          </div>
        ) : (
          <>
            {error ? <div className="error-banner">{error}</div> : null}
            {copyToast ? <div className="toast">Copied</div> : null}
            <ChatTranscript items={items} streaming={streaming} onCopy={(t) => void copyText(t)} />
            <div className="composer-wrap">
              <Composer
                disabled={!!permission}
                attachments={attachments}
                modelLabel={modelLabel}
                onRemoveAttachment={(p) => setAttachments((prev) => prev.filter((a) => a.path !== p))}
                onAttachFile={() =>
                  void ccd()
                    .filesPick()
                    .then((refs) => setAttachments((prev) => [...prev, ...refs]))
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                }
                onAttachImage={() =>
                  void ccd()
                    .filesPickImages()
                    .then((refs) => setAttachments((prev) => [...prev, ...refs]))
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                }
                onPasteImage={() => void pasteImage()}
                onSend={(t) => void send(t)}
                onStop={() => void ccd().chatStop()}
                busy={busy}
              />
              <p className="disclaimer muted">Claude is AI and can make mistakes. Please double-check responses.</p>
            </div>
          </>
        )}
      </div>

      <RightPanel
        open={rightOpen}
        projectPath={projectPath}
        attachments={attachments}
        toolCount={toolCount}
      />

      {permission?.type === 'permission_request' ? (
        <PermissionModal
          request={permission}
          onDecide={(decision) => {
            const requestId = permission.requestId ?? ''
            void ccd().chatRespondPermission({ requestId, decision })
            setPermission(null)
          }}
        />
      ) : null}
    </div>
  )
}
