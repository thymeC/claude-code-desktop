interface Props {
  projectPath: string | null
  onOpen: () => void
}

export function ProjectBar({ projectPath, onOpen }: Props) {
  return (
    <header className="project-bar">
      <div className="project-path" title={projectPath ?? undefined}>
        {projectPath ?? 'No project selected'}
      </div>
      <button type="button" onClick={onOpen}>
        Open folder
      </button>
    </header>
  )
}
