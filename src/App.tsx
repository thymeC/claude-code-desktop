import { useCallback, useEffect, useState } from 'react'
import { ccd } from './lib/ipc'
import type { AttachmentRef, ChatEvent, CliStatus, SessionSummary } from './lib/types'
import { Onboarding } from './components/Onboarding'
import { ProjectBar } from './components/ProjectBar'
import { ChatTranscript, type TranscriptItem } from './components/ChatTranscript'
import { Composer } from './components/Composer'
import { SessionSidebar } from './components/SessionSidebar'
import { PermissionModal } from './components/PermissionModal'

export function App() {
  const [cli, setCli] = useState<CliStatus | null>(null)
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
  const [permissionMode, setPermissionMode] = useState<
    'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  >('default')

  async function refreshCli() {
    const status = await ccd().cliCheck()
    setCli(status)
    return status
  }

  const refreshSessions = useCallback(async (path: string) => {
    const list = await ccd().sessionList(path)
    setSessions(list)
  }, [])

  useEffect(() => {
    void (async () => {
      const status = await refreshCli()
      const settings = await ccd().settingsGet()
      if (settings.permissionMode) setPermissionMode(settings.permissionMode)
      if (status.found) {
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
        if (event.sessionId) setActiveSessionId(event.sessionId)
      }
    })
  }, [refreshSessions])

  async function ensureSession(path: string) {
    const result = await ccd().sessionNew(path)
    setSessionReady(true)
    setActiveSessionId(result.sessionId)
    setItems([])
    setStreaming('')
    await refreshSessions(path)
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

  async function attachFiles() {
    try {
      const refs = await ccd().filesPick()
      setAttachments((prev) => [...prev, ...refs])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onDropFiles(paths: string[]) {
    try {
      const refs = await ccd().filesStagePaths(paths)
      setAttachments((prev) => [...prev, ...refs])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function resume(sessionId: string) {
    if (!projectPath) return
    await ccd().sessionResume(projectPath, sessionId)
    setActiveSessionId(sessionId)
    setSessionReady(true)
    setItems([
      {
        id: crypto.randomUUID(),
        role: 'system',
        text: `Resumed session ${sessionId.slice(0, 8)}…`,
      },
    ])
    setStreaming('')
  }

  async function changePermissionMode(mode: typeof permissionMode) {
    setPermissionMode(mode)
    await ccd().settingsSet({ permissionMode: mode })
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
    <div className="layout with-sidebar">
      {projectPath ? (
        <SessionSidebar
          sessions={sessions}
          activeId={activeSessionId}
          onNew={() => void ensureSession(projectPath)}
          onSelect={(id) => void resume(id)}
        />
      ) : (
        <aside className="session-sidebar" />
      )}
      <div className="main-column">
        <ProjectBar projectPath={projectPath} onOpen={() => void openProject()} />
        <main
          className="chat-main"
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            const paths = Array.from(e.dataTransfer.files)
              .map((f) => (f as File & { path?: string }).path)
              .filter((p): p is string => Boolean(p))
            if (paths.length) void onDropFiles(paths)
          }}
        >
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
                <label className="perm-mode">
                  Permission mode
                  <select
                    value={permissionMode}
                    onChange={(e) =>
                      void changePermissionMode(
                        e.target.value as typeof permissionMode,
                      )
                    }
                  >
                    <option value="default">default</option>
                    <option value="acceptEdits">acceptEdits</option>
                    <option value="plan">plan</option>
                    <option value="bypassPermissions">bypassPermissions</option>
                  </select>
                </label>
              </div>
              {error ? <div className="error-banner">{error}</div> : null}
              <ChatTranscript items={items} streaming={streaming} />
              <Composer
                disabled={!!permission}
                attachments={attachments}
                onRemoveAttachment={(p) =>
                  setAttachments((prev) => prev.filter((a) => a.path !== p))
                }
                onAttach={() => void attachFiles()}
                onSend={(t) => void send(t)}
                onStop={() => void ccd().chatStop()}
                busy={busy}
              />
            </>
          )}
        </main>
      </div>
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
