export type RiskLevel = 'High' | 'Medium' | 'Low'

export interface RepositoryFile {
  path: string
  name: string
  kind: string
  description: string
  dependencies: string[]
  dependents: string[]
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; kind: string; description: string; risk: RiskLevel }>
  edges: Array<{ source: string; target: string }>
}

export interface TestSuggestion {
  category: 'Unit' | 'Integration' | 'Regression'
  title: string
  description: string
  priority: 'Required' | 'Recommended'
}

export interface Analysis {
  changed_file: string
  risk: RiskLevel
  risk_score: number
  summary: string
  explanation: string[]
  direct_dependencies: string[]
  indirect_dependencies: string[]
  affected_files: string[]
  tests: TestSuggestion[]
}
