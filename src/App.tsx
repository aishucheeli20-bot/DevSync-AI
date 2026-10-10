import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, MarkerType, MiniMap, Position, type Edge, type Node } from 'reactflow'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Boxes, Check,
  ChevronDown, CircleHelp, Code2, GitBranch, GitCommitHorizontal, GitFork, GitPullRequest, LogIn, LogOut,
  LayoutDashboard, LoaderCircle, Menu, Play, Search, Settings2, ShieldCheck, Sparkles,
  TestTube2, X, Zap,
} from 'lucide-react'
import { analyzeChange, getCurrentUser, getGraph, getRepository, logout, type AuthUser } from './api'
import AuthPage from './AuthPage'
import type { Analysis, GraphData, RepositoryFile, RiskLevel } from './types'

type Section = 'Dashboard' | 'Repositories' | 'Dependency Graph' | 'Change Analysis' | 'Risk Alerts' | 'Test Suggestions'

const navigation: Array<{ label: Section; icon: typeof LayoutDashboard }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Repositories', icon: GitBranch },
  { label: 'Dependency Graph', icon: Boxes },
  { label: 'Change Analysis', icon: Activity },
  { label: 'Risk Alerts', icon: AlertTriangle },
  { label: 'Test Suggestions', icon: TestTube2 },
]

const shortName = (path: string) => path.split('/').pop() ?? path
const riskTone: Record<RiskLevel, string> = {
  High: 'bg-rose-50 text-rose-700 ring-rose-200',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  Low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}
const fileIcon: Record<string, string> = { javascript: 'JS', jsx: 'JSX', typescript: 'TS', tsx: 'TSX' }

function App() {
  const [section, setSection] = useState<Section>('Dashboard')
  const [authRoute, setAuthRoute] = useState<'login' | 'signup' | null>(() => {
    if (window.location.pathname === '/login') return 'login'
    if (window.location.pathname === '/signup') return 'signup'
    return null
  })
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [files, setFiles] = useState<RepositoryFile[]>([])
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [selectedFile, setSelectedFile] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getCurrentUser(), getRepository(), getGraph()])
      .then(([currentUser, repository, nextGraph]) => {
        if (!active) return
        setUser(currentUser)
        setFiles(repository.files)
        setSelectedFile(repository.files[0]?.path ?? '')
        setGraph(nextGraph)
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load repository data.') })
      .finally(() => { if (active) setLoadingData(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname
      setAuthRoute(path === '/login' ? 'login' : path === '/signup' ? 'signup' : null)
      if (path === '/') setSection('Dashboard')
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const runAnalysis = useCallback(async (file = selectedFile) => {
    if (!file) return
    setAnalyzing(true)
    setError('')
    try {
      const result = await analyzeChange(file)
      setAnalysis(result)
      setSection('Change Analysis')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Change analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }, [selectedFile])
  const handleAnalyze = useCallback(() => { void runAnalysis() }, [runAnalysis])
  const navigatePath = (path: string) => {
    window.history.pushState({}, '', path)
    setAuthRoute(path === '/login' ? 'login' : path === '/signup' ? 'signup' : null)
    setProfileOpen(false)
    if (path === '/') setSection('Dashboard')
  }
  const handleAuthenticated = (authenticatedUser: AuthUser) => {
    setUser(authenticatedUser)
    setError('')
    navigatePath('/')
  }
  const handleLogout = () => {
    setUser(null)
    setProfileOpen(false)
    setSection('Dashboard')
    navigatePath('/')
    void logout().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Could not complete sign out with the server.')
    })
  }

  const flowNodes = useMemo<Node[]>(() => (graph?.nodes ?? []).map((node, index) => {
    const positions = [
      { x: 60, y: 210 }, { x: 340, y: 210 }, { x: 340, y: 40 },
      { x: 620, y: 210 }, { x: 620, y: 40 }, { x: 900, y: 125 },
    ]
    const result = analysis
    const impacted = !!result && result.affected_files.includes(node.id)
    const changed = result?.changed_file === node.id
    return {
      id: node.id, position: positions[index] ?? { x: 60 + index * 240, y: 200 },
      data: { label: <div className="min-w-[165px]"><div className="flex items-center gap-2"><span className={`file-chip ${node.kind === 'jsx' || node.kind === 'tsx' ? 'chip-purple' : 'chip-blue'}`}>{fileIcon[node.kind] ?? 'JS'}</span><span className="font-semibold text-slate-800">{shortName(node.label)}</span></div><div className="mt-2 text-xs text-slate-500">{node.description}</div>{(impacted || changed) && <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-indigo-600">{changed ? 'Changed file' : 'Impacted'}</div>}</div> },
      style: { width: 220, padding: '13px 14px', borderRadius: 12, border: `1px solid ${changed ? '#6366f1' : impacted ? '#a5b4fc' : '#e2e8f0'}`, background: changed ? '#eef2ff' : impacted ? '#f5f3ff' : '#fff', boxShadow: changed || impacted ? '0 5px 18px rgba(99,102,241,.12)' : '0 2px 8px rgba(15,23,42,.04)' },
      sourcePosition: Position.Right, targetPosition: Position.Left,
    }
  }), [graph, analysis])
  const flowEdges = useMemo<Edge[]>(() => (graph?.edges ?? []).map((edge, index) => ({
    id: `e${index}-${edge.source}-${edge.target}`, source: edge.source, target: edge.target, animated: !!analysis && analysis.affected_files.includes(edge.target),
    style: { stroke: !!analysis && analysis.affected_files.includes(edge.target) ? '#818cf8' : '#cbd5e1', strokeWidth: 1.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: !!analysis && analysis.affected_files.includes(edge.target) ? '#818cf8' : '#cbd5e1' },
  })), [graph, analysis])

  if (authRoute) return <AuthPage mode={authRoute} onNavigate={navigatePath} onAuthenticated={handleAuthenticated} />
  if (loadingData) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc]"><div className="flex items-center gap-3 text-sm font-medium text-slate-600"><LoaderCircle className="animate-spin text-indigo-600" size={20} />Connecting to your demo repository…</div></div>

  const currentFile = files.find(file => file.path === (analysis?.changed_file ?? selectedFile))
  const greetingName = user?.name.trim().split(/\s+/)[0] || 'Developer'
  const navTo = (item: Section) => { setSection(item); setMobileNav(false) }
  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="flex h-[76px] items-center gap-3 px-6"><div className="brand-mark"><GitFork size={20} /></div><div><div className="text-[17px] font-bold tracking-tight text-slate-900">devsync<span className="text-indigo-600">.</span></div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">AI code intelligence</div></div><button className="ml-auto text-slate-400 md:hidden" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
        <div className="px-4 pt-7"><div className="section-label px-3">Workspace</div><nav className="mt-2 space-y-1">{navigation.map(item => { const Icon = item.icon; return <button key={item.label} onClick={() => navTo(item.label)} className={`nav-item ${section === item.label ? 'nav-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.label === 'Risk Alerts' && <span className="ml-auto rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">2</span>}</button> })}</nav></div>
        <div className="mt-8 px-4"><div className="section-label px-3">Connected repository</div><button className="repo-switch mt-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><Code2 size={16} /></span><span className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-semibold text-slate-700">commerce-platform</span><span className="mt-0.5 block text-[10px] text-slate-400">main · synced now</span></span><ChevronDown size={15} className="text-slate-400" /></button></div>
        <div className="sidebar-bottom"><div className="plan-card"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">Analysis credits</span><Sparkles size={15} className="text-indigo-500" /></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[72%] rounded-full bg-indigo-500" /></div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>72 of 100 used</span><span>Resets in 12d</span></div></div><button className="nav-item mt-3"><Settings2 size={17} /><span>Settings</span></button><div className="mt-4 flex items-center gap-2 border-t border-slate-100 px-3 pt-4">{user ? <><div className="avatar">{user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-700">{user.name}</div><div className="truncate text-[10px] text-slate-400">{user.email}</div></div></> : <><div className="avatar">D</div><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-700">Demo workspace</div><div className="text-[10px] text-slate-400">Exploring as a guest</div></div><CircleHelp size={16} className="text-slate-400" /></>}</div></div>
      </aside>
      {mobileNav && <button className="fixed inset-0 z-30 bg-slate-900/30 md:hidden" onClick={() => setMobileNav(false)} aria-label="Close menu overlay" />}

      <main className="main-shell">
        <header className="topbar"><div className="flex items-center gap-3"><button className="icon-button md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span className="text-slate-300">/</span><span className="font-semibold text-slate-700">{section}</span></div></div><div className="flex items-center gap-2 sm:gap-3"><div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 sm:flex"><Search size={14} /><span>Search anything…</span><kbd className="ml-5 rounded border border-slate-200 px-1 py-0.5 text-[9px]">⌘ K</kbd></div><button className="icon-button relative" aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button><div className="hidden h-7 w-px bg-slate-200 sm:block" />{user ? <div className="relative"><button className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-50" onClick={() => setProfileOpen(value => !value)} aria-expanded={profileOpen} aria-label="Open profile menu"><span className="avatar">{user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><ChevronDown size={13} className="hidden text-slate-400 sm:block" /></button>{profileOpen && <div className="profile-menu"><div className="border-b border-slate-100 px-3 py-2"><div className="text-xs font-semibold text-slate-800">{user.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{user.email}</div></div><button onClick={handleLogout}><LogOut size={14} />Logout</button></div>}</div> : <div className="flex items-center gap-2"><button className="guest-login" onClick={() => navigatePath('/login')}><LogIn size={14} />Login</button><button className="guest-signup" onClick={() => navigatePath('/signup')}>Sign up</button></div>}</div></header>
        <div className="page-content">
          {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button onClick={() => { setError(''); if (!graph) window.location.reload() }} className="text-rose-500" aria-label="Dismiss error"><X size={16} /></button></div>}
          {section === 'Dashboard' && <Dashboard greetingName={greetingName} files={files} graph={graph} analysis={analysis} selectedFile={selectedFile} setSelectedFile={setSelectedFile} onAnalyze={handleAnalyze} analyzing={analyzing} flowNodes={flowNodes} flowEdges={flowEdges} navigate={navTo} />}
          {section === 'Repositories' && <Repositories files={files} selectedFile={selectedFile} setSelectedFile={setSelectedFile} onAnalyze={handleAnalyze} analyzing={analyzing} />}
          {section === 'Dependency Graph' && <GraphPage nodes={flowNodes} edges={flowEdges} />}
          {section === 'Change Analysis' && <AnalysisPage analysis={analysis} files={files} selectedFile={selectedFile} setSelectedFile={setSelectedFile} currentFile={currentFile} onAnalyze={handleAnalyze} analyzing={analyzing} />}
          {section === 'Risk Alerts' && <RiskPage analysis={analysis} onAnalyze={handleAnalyze} analyzing={analyzing} />}
          {section === 'Test Suggestions' && <TestsPage analysis={analysis} onAnalyze={handleAnalyze} analyzing={analyzing} />}
          <footer className="mt-9 flex flex-col justify-between gap-2 border-t border-slate-200/70 py-5 text-[11px] text-slate-400 sm:flex-row"><span>© 2025 DevSync AI · Built for teams that ship with confidence</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />All systems operational</span></footer>
        </div>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="eyebrow">{eyebrow}</div><h1 className="mt-2 text-[25px] font-bold tracking-[-.04em] text-slate-900 sm:text-[29px]">{title}</h1><p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-slate-500">{description}</p></div>{action}</div>
}

function SimulateButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return <button className="primary-button" onClick={onClick} disabled={busy}><span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}</span>{busy ? 'Analyzing change…' : 'Simulate code change'}<span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-medium">AI</span></button>
}

function Dashboard(props: { greetingName: string; files: RepositoryFile[]; graph: GraphData | null; analysis: Analysis | null; selectedFile: string; setSelectedFile: (value: string) => void; onAnalyze: () => void; analyzing: boolean; flowNodes: Node[]; flowEdges: Edge[]; navigate: (section: Section) => void }) {
  const { greetingName, files, graph, analysis, selectedFile, setSelectedFile, onAnalyze, analyzing, flowNodes, flowEdges, navigate } = props
  return <>
    <PageHeading eyebrow="MONDAY, OCTOBER 20, 2025" title={`Good morning, ${greetingName} 👋`} description="Here's what's happening across your codebase today." action={<div className="flex items-center gap-2"><button className="secondary-button" onClick={() => navigate('Repositories')}><GitBranch size={15} />View repository</button></div>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard icon={GitBranch} iconTone="indigo" label="Tracked files" value={String(files.length).padStart(2, '0')} trend="+3 this week" positive />
      <MetricCard icon={GitPullRequest} iconTone="blue" label="Changes analyzed" value={analysis ? '13' : '12'} trend="↑ 18% vs last week" positive />
      <MetricCard icon={AlertTriangle} iconTone="amber" label="Open risk alerts" value={analysis?.risk === 'High' ? '3' : '2'} trend="Needs attention" />
      <MetricCard icon={ShieldCheck} iconTone="green" label="Test coverage" value="87.4%" trend="↑ 2.1% this month" positive />
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.8fr)]">
      <section className="panel overflow-hidden">
        <div className="panel-heading"><div><div className="flex items-center gap-2"><h2 className="panel-title">Dependency overview</h2><span className="live-pill"><span />LIVE</span></div><p className="panel-subtitle">How modules in commerce-platform connect</p></div><button onClick={() => navigate('Dependency Graph')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Explore graph <ArrowRight size={13} className="ml-1 inline" /></button></div>
        <div className="graph-preview"><ReactFlow nodes={flowNodes} edges={flowEdges} fitView fitViewOptions={{ padding: 0.16 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}><Background color="#dbe2ee" gap={20} size={1} /><MiniMap pannable zoomable nodeColor={(node) => node.style?.border?.toString().includes('#6366f1') ? '#818cf8' : '#cbd5e1'} /><Controls showInteractive={false} /></ReactFlow></div>
        <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />Module</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Impacted file</span><span className="ml-auto">{graph?.nodes.length ?? 0} modules · {graph?.edges.length ?? 0} connections</span></div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2 className="panel-title">Simulate a change</h2><p className="panel-subtitle">Preview the impact before you commit</p></div><div className="icon-tile icon-indigo"><Zap size={16} /></div></div>
        <div className="px-5 pb-5">
          <label className="field-label" htmlFor="change-file">Select a file to change</label>
          <div className="relative mt-2"><select id="change-file" className="select-input" value={selectedFile} onChange={event => setSelectedFile(event.target.value)}>{files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" /></div>
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3.5"><div className="flex gap-2.5"><Sparkles size={15} className="mt-0.5 shrink-0 text-indigo-600" /><p className="text-[11px] leading-relaxed text-indigo-900/75">DevSync traces direct and indirect dependencies, flags integration risks, and recommends exactly what to test.</p></div></div>
          <button className="primary-button mt-4 w-full justify-center" onClick={onAnalyze} disabled={analyzing || !selectedFile}>{analyzing ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={13} fill="currentColor" />} {analyzing ? 'Analyzing impact…' : 'Simulate code change'} {!analyzing && <ArrowRight size={14} className="ml-auto" />}</button>
          {analysis && <button className="mt-3 w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-800" onClick={() => navigate('Change Analysis')}>View latest analysis ({analysis.affected_files.length} affected files)</button>}
        </div>
      </section>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.8fr)]">
      <RecentActivity analysis={analysis} navigate={navigate} />
      <RiskSummary analysis={analysis} navigate={navigate} />
    </div>
  </>
}

function MetricCard({ icon: Icon, iconTone, label, value, trend, positive }: { icon: typeof Activity; iconTone: string; label: string; value: string; trend: string; positive?: boolean }) {
  return <div className="metric-card"><div className="flex items-start justify-between"><div className={`icon-tile icon-${iconTone}`}><Icon size={16} /></div><span className="text-[9px] font-medium text-slate-300">•••</span></div><div className="mt-4 text-[11px] font-medium text-slate-500">{label}</div><div className="mt-0.5 flex items-end justify-between"><div className="text-[25px] font-bold tracking-tight text-slate-900">{value}</div><div className={`mb-1 flex items-center gap-1 text-[9px] ${positive ? 'text-emerald-600' : 'text-amber-600'}`}>{positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{trend}</div></div></div>
}

function RecentActivity({ analysis, navigate }: { analysis: Analysis | null; navigate: (section: Section) => void }) {
  return <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Recent activity</h2><p className="panel-subtitle">Latest changes across your repository</p></div><button className="text-xs font-semibold text-indigo-600" onClick={() => navigate('Change Analysis')}>View all</button></div>
    <div className="divide-y divide-slate-100 px-5">
      <ActivityRow icon={GitCommitHorizontal} tone="indigo" title={analysis ? shortName(analysis.changed_file) : 'PaymentService: add retry logic'} detail={analysis ? 'Impact analysis completed' : 'A team member merged a commit'} time={analysis ? 'Just now' : '24 min ago'} />
      <ActivityRow icon={GitPullRequest} tone="blue" title="feat/discount-codes" detail="3 files changed · 1 potential risk" time="2 hours ago" badge="Review" />
      <ActivityRow icon={Check} tone="green" title="Checkout.test.jsx" detail="All suggested tests passing" time="Yesterday" badge="Passed" />
    </div>
  </section>
}
function ActivityRow({ icon: Icon, tone, title, detail, time, badge }: { icon: typeof Activity; tone: string; title: string; detail: string; time: string; badge?: string }) {
  return <div className="flex items-center gap-3 py-3.5"><div className={`activity-icon activity-${tone}`}><Icon size={14} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-700">{title}</div><div className="mt-1 truncate text-[10px] text-slate-400">{detail}</div></div>{badge && <span className={`hidden rounded-md px-2 py-1 text-[9px] font-semibold sm:inline-flex ${badge === 'Passed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{badge}</span>}<span className="whitespace-nowrap text-[10px] text-slate-400">{time}</span></div>
}
function RiskSummary({ analysis, navigate }: { analysis: Analysis | null; navigate: (section: Section) => void }) {
  return <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Risk alerts</h2><p className="panel-subtitle">Items that may need your attention</p></div><button className="text-xs font-semibold text-indigo-600" onClick={() => navigate('Risk Alerts')}>See all</button></div>
    <div className="space-y-3 px-5 pb-5"><RiskItem level={analysis?.risk ?? 'High'} title={analysis ? `${shortName(analysis.changed_file)} has a ${analysis.risk.toLowerCase()} integration risk` : 'PaymentService has no retry coverage'} detail="Payment flow · 2 files may be impacted" /><RiskItem level="Medium" title="Checkout.jsx has untested edge cases" detail="Checkout flow · Last updated 2 days ago" /></div>
  </section>
}
function RiskItem({ level, title, detail }: { level: RiskLevel; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl border border-slate-100 p-3"><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${level === 'High' ? 'bg-rose-500' : level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} /><div><div className="text-[11px] font-semibold leading-relaxed text-slate-700">{title}</div><div className="mt-1 text-[10px] text-slate-400">{detail}</div></div><span className={`ml-auto h-fit rounded px-1.5 py-0.5 text-[9px] font-semibold ${riskTone[level]}`}>{level}</span></div>
}

function Repositories({ files, selectedFile, setSelectedFile, onAnalyze, analyzing }: { files: RepositoryFile[]; selectedFile: string; setSelectedFile: (value: string) => void; onAnalyze: () => void; analyzing: boolean }) {
  return <><PageHeading eyebrow="CODEBASE" title="Repositories" description="Explore your connected repository and choose a file to trace its downstream impact." action={<div className="secondary-button"><span className="h-2 w-2 rounded-full bg-emerald-500" />Connected</div>} />
    <div className="panel overflow-hidden"><div className="panel-heading"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Code2 size={19} /></div><div><h2 className="panel-title">commerce-platform</h2><p className="panel-subtitle">E-commerce sample · main branch</p></div></div><span className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-500"><GitBranch size={13} className="mr-1.5 inline" />main</span></div>
      <div className="border-t border-slate-100"><div className="grid grid-cols-[minmax(0,1fr)_100px_120px] gap-3 bg-slate-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><span>File</span><span>Type</span><span>Dependencies</span></div>{files.map(file => <button key={file.path} onClick={() => setSelectedFile(file.path)} className={`grid w-full grid-cols-[minmax(0,1fr)_100px_120px] items-center gap-3 border-t border-slate-100 px-5 py-3 text-left transition hover:bg-indigo-50/40 ${selectedFile === file.path ? 'bg-indigo-50/50' : 'bg-white'}`}><span className="flex min-w-0 items-center gap-2.5"><span className={`file-chip ${file.kind === 'jsx' || file.kind === 'tsx' ? 'chip-purple' : 'chip-blue'}`}>{fileIcon[file.kind] ?? file.kind}</span><span className="truncate text-xs font-medium text-slate-700">{file.path}</span></span><span className="text-[11px] text-slate-500">{file.kind.toUpperCase()}</span><span className="text-[11px] text-slate-500">{file.dependencies.length} direct</span></button>)}</div>
      <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center"><div className="text-[11px] text-slate-500">Select a file, then simulate a change to see its impact.</div><SimulateButton busy={analyzing} onClick={onAnalyze} /></div>
    </div>
  </>
}

function GraphPage({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  return <><PageHeading eyebrow="CODEBASE MAP" title="Dependency graph" description="Explore how modules depend on one another. Simulate a change to highlight the affected paths." action={<span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">{nodes.length} modules · {edges.length} connections</span>} />
    <section className="panel overflow-hidden"><div className="graph-large"><ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.14 }} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background color="#dbe2ee" gap={22} size={1} /><MiniMap pannable zoomable /><Controls /></ReactFlow></div><div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-slate-300" />Repository file</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-indigo-500" />Changed file</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-violet-300" />Impacted file</span><span className="ml-auto text-slate-400">Arrows indicate import / usage direction</span></div></section>
  </>
}

function AnalysisPage({ analysis, files, selectedFile, setSelectedFile, currentFile, onAnalyze, analyzing }: { analysis: Analysis | null; files: RepositoryFile[]; selectedFile: string; setSelectedFile: (value: string) => void; currentFile?: RepositoryFile; onAnalyze: () => void; analyzing: boolean }) {
  return <><PageHeading eyebrow="CHANGE INTELLIGENCE" title="Change analysis" description="Understand blast radius, integration risks, and suggested tests before you merge." action={<div className="flex gap-2"><div className="relative"><select className="select-input min-w-[210px] pr-8" value={selectedFile} onChange={event => setSelectedFile(event.target.value)}>{files.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-slate-400" /></div><SimulateButton busy={analyzing} onClick={onAnalyze} /></div>} />
    {!analysis ? <EmptyState onAnalyze={onAnalyze} analyzing={analyzing} /> : <div className="space-y-5"><div className="panel p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ${riskTone[analysis.risk]}`}>{analysis.risk} integration risk</span><span className="text-[10px] text-slate-400">Analyzed just now</span></div><h2 className="mt-3 text-lg font-bold text-slate-900">{shortName(analysis.changed_file)} changed</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">{analysis.summary}</p></div><div className="risk-score"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Risk score</span><strong className={analysis.risk === 'High' ? 'text-rose-600' : analysis.risk === 'Medium' ? 'text-amber-600' : 'text-emerald-600'}>{analysis.risk_score}</strong><span className="text-[9px] text-slate-400">/ 100</span></div></div><div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3"><ImpactCount label="Direct dependencies" count={analysis.direct_dependencies.length} tone="blue" /><ImpactCount label="Indirect dependencies" count={analysis.indirect_dependencies.length} tone="purple" /><ImpactCount label="Total affected files" count={analysis.affected_files.length} tone="indigo" /></div></div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]"><section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Impact path</h2><p className="panel-subtitle">Files directly and indirectly affected</p></div><GitFork size={17} className="text-slate-400" /></div><div className="px-5 pb-5">{currentFile && <ImpactFile file={currentFile.path} tag="Changed" level="change" />}{analysis.direct_dependencies.map((file, index) => <ImpactFile key={file} file={file} tag="Direct" level="direct" index={index} />)}{analysis.indirect_dependencies.map((file, index) => <ImpactFile key={file} file={file} tag="Indirect" level="indirect" index={index} />)}</div></section>
        <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Why this matters</h2><p className="panel-subtitle">AI-generated change explanation</p></div><div className="icon-tile icon-indigo"><Sparkles size={15} /></div></div><div className="space-y-3 px-5 pb-5">{analysis.explanation.map((point, index) => <div key={point} className="flex gap-2.5 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span>{point}</div>)}</div></section></div>
      <TestList tests={analysis.tests} /></div>}
  </>
}
function ImpactCount({ label, count, tone }: { label: string; count: number; tone: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3"><div className={`impact-dot impact-${tone}`} /><div><div className="text-lg font-bold leading-none text-slate-800">{count}</div><div className="mt-1 text-[10px] text-slate-500">{label}</div></div></div>
}
function ImpactFile({ file, tag, level, index = 0 }: { file: string; tag: string; level: string; index?: number }) {
  return <div className="impact-row"><div className={`impact-connector impact-line-${level}`}><span className={`impact-dot impact-${level}`} /></div><div className="flex min-w-0 flex-1 items-center gap-2.5"><Code2 size={14} className="shrink-0 text-slate-400" /><span className="truncate text-[11px] font-medium text-slate-700">{file}</span></div><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${level === 'change' ? 'bg-indigo-100 text-indigo-700' : level === 'direct' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{tag}{index > 0 && level === 'direct' ? ` · ${index + 1}` : ''}</span></div>
}
function EmptyState({ onAnalyze, analyzing }: { onAnalyze: () => void; analyzing: boolean }) {
  return <section className="panel grid min-h-[300px] place-items-center p-8 text-center"><div className="max-w-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Activity size={21} /></div><h2 className="mt-4 text-base font-bold text-slate-800">No change analyzed yet</h2><p className="mt-2 text-xs leading-relaxed text-slate-500">Run a simulation to trace affected modules, assess integration risk, and get tailored test suggestions.</p><div className="mt-4 inline-flex"><SimulateButton busy={analyzing} onClick={onAnalyze} /></div></div></section>
}
function TestList({ tests }: { tests: Analysis['tests'] }) {
  return <section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Recommended tests</h2><p className="panel-subtitle">Prioritized test plan based on the dependency impact</p></div><TestTube2 size={17} className="text-slate-400" /></div><div className="grid gap-3 px-5 pb-5 md:grid-cols-3">{tests.map((test, index) => <div key={`${test.category}-${test.title}`} className="test-card"><div className="flex items-center justify-between"><span className={`test-category test-${test.category.toLowerCase()}`}>{test.category}</span><span className="text-[9px] text-slate-400">{test.priority}</span></div><div className="mt-3 text-xs font-semibold leading-relaxed text-slate-700">{test.title}</div><p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{test.description}</p><div className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-400"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100">{index + 1}</span> Suggested test</div></div>)}</div></section>
}

function RiskPage({ analysis, onAnalyze, analyzing }: { analysis: Analysis | null; onAnalyze: () => void; analyzing: boolean }) {
  const alerts: Array<{ level: RiskLevel; title: string; detail: string; file: string }> = [
    { level: analysis?.risk ?? 'High', title: analysis ? `${shortName(analysis.changed_file)} may impact downstream flows` : 'Payment retry logic has no failure-path coverage', detail: 'A change here could affect checkout reliability and payment completion.', file: analysis?.changed_file ?? 'src/services/PaymentService.js' },
    { level: 'Medium', title: 'Checkout validation edge cases need coverage', detail: 'Empty carts and fractional quantities are not explicitly tested.', file: 'src/components/Checkout.jsx' },
    { level: 'Low', title: 'Cart module has an indirect dependency on totals', detail: 'Changes to item shape can affect total calculation.', file: 'src/components/Cart.jsx' },
  ]
  return <><PageHeading eyebrow="QUALITY GUARDRAILS" title="Risk alerts" description="Prioritized integration risks surfaced from your repository dependency graph." action={<SimulateButton busy={analyzing} onClick={onAnalyze} />} /><div className="mb-5 grid grid-cols-3 gap-3"><div className="risk-summary-card border-rose-100 bg-rose-50/70"><span className="text-[10px] font-semibold text-rose-600">HIGH PRIORITY</span><div className="mt-1 text-2xl font-bold text-rose-700">{alerts.filter(alert => alert.level === 'High').length}</div></div><div className="risk-summary-card border-amber-100 bg-amber-50/70"><span className="text-[10px] font-semibold text-amber-600">MEDIUM</span><div className="mt-1 text-2xl font-bold text-amber-700">{alerts.filter(alert => alert.level === 'Medium').length}</div></div><div className="risk-summary-card border-emerald-100 bg-emerald-50/70"><span className="text-[10px] font-semibold text-emerald-600">LOW</span><div className="mt-1 text-2xl font-bold text-emerald-700">{alerts.filter(alert => alert.level === 'Low').length}</div></div></div><section className="panel"><div className="divide-y divide-slate-100 px-5">{alerts.map(alert => <div key={alert.title} className="flex gap-3 py-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${alert.level === 'High' ? 'bg-rose-500' : alert.level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold text-slate-800">{alert.title}</h3><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${riskTone[alert.level]}`}>{alert.level}</span></div><p className="mt-1.5 text-[11px] text-slate-500">{alert.detail}</p><div className="mt-2 font-mono text-[10px] text-slate-400">{alert.file}</div></div><button className="hidden self-center text-[10px] font-semibold text-indigo-600 sm:block" onClick={onAnalyze}>Analyze <ArrowRight size={12} className="ml-1 inline" /></button></div>)}</div></section></>
}
function TestsPage({ analysis, onAnalyze, analyzing }: { analysis: Analysis | null; onAnalyze: () => void; analyzing: boolean }) {
  return <><PageHeading eyebrow="QUALITY ASSURANCE" title="Test suggestions" description="A targeted test plan grounded in what your code change actually touches." action={<SimulateButton busy={analyzing} onClick={onAnalyze} />} />{analysis ? <div className="space-y-5"><div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-800"><Sparkles size={15} /><span>Test plan generated for <strong>{shortName(analysis.changed_file)}</strong> · {analysis.tests.length} suggested tests</span></div><TestList tests={analysis.tests} /><section className="panel"><div className="panel-heading"><div><h2 className="panel-title">Coverage checklist</h2><p className="panel-subtitle">Recommended order for validating your change</p></div></div><div className="space-y-2 px-5 pb-5">{analysis.tests.map((test, index) => <div key={test.title} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">{index + 1}</span><div className="flex-1 text-[11px] font-medium text-slate-700">{test.title}</div><span className={`test-category test-${test.category.toLowerCase()}`}>{test.category}</span></div>)}</div></section></div> : <EmptyState onAnalyze={onAnalyze} analyzing={analyzing} />}</>
}

export default App
