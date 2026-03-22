#!/usr/bin/env node
/**
 * Generate README.md from tools.json
 * Groups tools by category/subcategory with tables.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOOLS_FILE = resolve(__dirname, 'tools.json')
const README_FILE = resolve(__dirname, 'README.md')

const CATEGORY_LABELS = {
  'offensive-security': '🗡️ Offensive Security',
  'defensive-security': '🛡️ Defensive Security',
  'devsecops': '🔧 DevSecOps',
  'ai-agents': '🤖 AI & Agents',
  'development': '💻 Development',
  'research-learning': '📚 Research & Learning',
}

const SUBCATEGORY_LABELS = {
  'reconnaissance-osint': 'Reconnaissance & OSINT',
  'vulnerability-scanning': 'Vulnerability Scanning',
  'exploitation-frameworks': 'Exploitation Frameworks',
  'password-cracking': 'Password & Credential Tools',
  'web-app-testing': 'Web App Testing',
  'network-attacks': 'Network Attacks',
  'social-engineering': 'Social Engineering',
  'reverse-engineering': 'Reverse Engineering',
  'red-team': 'Red Team',
  'siem-monitoring': 'SIEM & Monitoring',
  'waf-firewalls': 'WAF & Firewalls',
  'forensics-ir': 'Forensics & Incident Response',
  'malware-analysis': 'Malware Analysis',
  'threat-intelligence': 'Threat Intelligence',
  'compliance-hardening': 'Compliance & Hardening',
  'endpoint-security': 'Endpoint Security',
  'network-defense': 'Network Defense',
  'sast-dast-sca': 'SAST / DAST / SCA',
  'container-security': 'Container Security',
  'cloud-security': 'Cloud Security',
  'supply-chain': 'Supply Chain',
  'ci-cd-security': 'CI/CD Security',
  'secrets-management': 'Secrets Management',
  'iac-security': 'IaC Security',
  'coding-agents': 'Coding Agents',
  'llm-tools': 'LLM Tools',
  'ai-frameworks': 'AI Frameworks',
  'automation': 'Automation',
  'prompt-engineering': 'Prompt Engineering',
  'ai-security': 'AI Security',
  'cli-terminal': 'CLI & Terminal',
  'frameworks-libraries': 'Frameworks & Libraries',
  'infrastructure-devops': 'Infrastructure & DevOps',
  'databases': 'Databases',
  'api-tools': 'API Tools',
  'build-tools': 'Build Tools',
  'editors-ide': 'Editors & IDE',
  'ctf-practice': 'CTF & Practice',
  'training-platforms': 'Training Platforms',
  'knowledge-bases': 'Knowledge Bases',
  'documentation': 'Documentation',
  'books-courses': 'Books & Courses',
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function generate() {
  const tools = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'))
  const activeTools = tools.filter((t) => t.status !== 'archived')
  const archivedTools = tools.filter((t) => t.status === 'archived')

  // Group by category, then subcategory
  const grouped = {}
  for (const tool of activeTools) {
    if (!grouped[tool.category]) grouped[tool.category] = {}
    if (!grouped[tool.category][tool.subcategory]) grouped[tool.category][tool.subcategory] = []
    grouped[tool.category][tool.subcategory].push(tool)
  }

  const lines = []

  lines.push('# The Vault')
  lines.push('')
  lines.push(
    '> A curated, auto-updating collection of security, AI, and development tools. Updated weekly.'
  )
  lines.push('')
  lines.push(
    `**${activeTools.length}** tools across **${Object.keys(grouped).length}** categories • Last updated: ${new Date().toISOString().split('T')[0]}`
  )
  lines.push('')
  lines.push('🌐 **Browse online**: [blacktemple.net/vault](https://blacktemple.net/vault)')
  lines.push('')

  // Table of contents
  lines.push('## Contents')
  lines.push('')
  const categoryOrder = [
    'offensive-security',
    'defensive-security',
    'devsecops',
    'ai-agents',
    'development',
    'research-learning',
  ]
  for (const cat of categoryOrder) {
    if (!grouped[cat]) continue
    const label = CATEGORY_LABELS[cat] || cat
    const anchor = label
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/ /g, '-')
      .replace(/-+/g, '-')
    lines.push(`- [${label}](#${anchor})`)
  }
  lines.push('')

  // Sections
  for (const cat of categoryOrder) {
    if (!grouped[cat]) continue
    const label = CATEGORY_LABELS[cat] || cat
    lines.push(`## ${label}`)
    lines.push('')

    const subcats = Object.keys(grouped[cat]).sort()
    for (const sub of subcats) {
      const tools = grouped[cat][sub].sort((a, b) => b.stars - a.stars)
      const subLabel = SUBCATEGORY_LABELS[sub] || sub
      lines.push(`### ${subLabel}`)
      lines.push('')
      lines.push('| Tool | Stars | Language | Description |')
      lines.push('|------|------:|----------|-------------|')
      for (const t of tools) {
        const name = `[${t.name}](${t.url})`
        const stars = formatStars(t.stars)
        const desc = t.note || t.description.slice(0, 120)
        lines.push(`| ${name} | ⭐ ${stars} | ${t.language || '—'} | ${desc} |`)
      }
      lines.push('')
    }
  }

  // Archived section
  if (archivedTools.length > 0) {
    lines.push('## 📦 Archived')
    lines.push('')
    lines.push('These projects are no longer actively maintained.')
    lines.push('')
    lines.push('| Tool | Stars | Note |')
    lines.push('|------|------:|------|')
    for (const t of archivedTools) {
      lines.push(`| [${t.name}](${t.url}) | ⭐ ${formatStars(t.stars)} | ${t.note || t.description.slice(0, 80)} |`)
    }
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push('')
  lines.push('## Contributing')
  lines.push('')
  lines.push('This list is maintained by [@defconxt](https://github.com/defconxt) and updated weekly via automated pipeline.')
  lines.push('')
  lines.push('Suggestions? Open an issue or submit a PR adding entries to `tools.json`.')
  lines.push('')
  lines.push('## License')
  lines.push('')
  lines.push('CC0 1.0 Universal — see [LICENSE](LICENSE)')
  lines.push('')

  writeFileSync(README_FILE, lines.join('\n'))
  console.log(`Generated README.md with ${activeTools.length} active tools (${archivedTools.length} archived)`)
}

generate()
