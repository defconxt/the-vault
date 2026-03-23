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
  const activeTools = tools.filter((t) => t.status === 'active')
  const staleTools = tools.filter((t) => t.status === 'stale')
  const archivedTools = tools.filter((t) => t.status === 'archived' || t.status === 'unavailable')

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

  // Stale section (not updated in 2+ years)
  if (staleTools.length > 0) {
    lines.push('## ⚠️ Stale')
    lines.push('')
    lines.push('These projects have not been updated in over 2 years. They may still be useful but should be evaluated carefully.')
    lines.push('')
    lines.push('| Tool | Stars | Last Updated | Note |')
    lines.push('|------|------:|:------------:|------|')
    for (const t of staleTools.sort((a, b) => b.stars - a.stars)) {
      lines.push(`| [${t.name}](${t.url}) | ⭐ ${formatStars(t.stars)} | ${t.updated || '?'} | ${t.note || t.description.slice(0, 80)} |`)
    }
    lines.push('')
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
  lines.push('## How It Works')
  lines.push('')
  lines.push('The Vault is fully automated — no manual curation needed after initial setup.')
  lines.push('')
  lines.push('```')
  lines.push('Every Sunday 8AM UTC')
  lines.push('  └─ GitHub Actions workflow runs')
  lines.push('       ├─ Discovers new repos (GitHub topic search + starred repos)')
  lines.push('       ├─ Deduplicates against existing tools.json')
  lines.push('       ├─ Categorizes new finds via Claude API')
  lines.push('       ├─ Refreshes star counts & flags archived repos')
  lines.push('       ├─ Generates this README from tools.json')
  lines.push('       ├─ Commits & pushes to this repo')
  lines.push('       └─ Triggers Vercel redeploy of blacktemple.net')
  lines.push('             └─ Prebuild fetches latest tools.json')
  lines.push('                  └─ blacktemple.net/vault shows fresh data')
  lines.push('```')
  lines.push('')
  lines.push('### Pipeline Details')
  lines.push('')
  lines.push('| Component | Description |')
  lines.push('|-----------|-------------|')
  lines.push('| **Discovery** | Searches GitHub API across 30 security/AI/dev topic queries (≥500 stars), plus syncs starred repos (≥250 stars) |')
  lines.push('| **Deduplication** | Checks against existing `tools.json` by repo full name |')
  lines.push('| **Quality gate** | Star thresholds filter out unvetted repos: 500+ for search, 250+ for starred, 200+ for existing |')
  lines.push('| **Categorization** | Claude API (`claude-sonnet-4-20250514`) assigns category, subcategory, and editorial note |')
  lines.push('| **Metadata refresh** | Rotates through 1/4 of all tools per run, updating star counts, archived/stale status, and pruning sub-threshold entries |')
  lines.push('| **Rate limiting** | 15s between Claude API batches, 60s backoff + retry on 429s, 3s between GitHub search calls |')
  lines.push('| **Website sync** | Vercel deploy hook triggers rebuild; prebuild fetches `tools.json` from this repo |')
  lines.push('')
  lines.push('### Data Model')
  lines.push('')
  lines.push('Each entry in `tools.json`:')
  lines.push('')
  lines.push('```json')
  lines.push('{')
  lines.push('  "name": "hashcat",')
  lines.push('  "repo": "hashcat/hashcat",')
  lines.push('  "url": "https://github.com/hashcat/hashcat",')
  lines.push('  "description": "World\'s fastest password recovery utility",')
  lines.push('  "category": "offensive-security",')
  lines.push('  "subcategory": "password-cracking",')
  lines.push('  "language": "C",')
  lines.push('  "stars": 25618,')
  lines.push('  "note": "GPU-accelerated, supports 300+ hash types",')
  lines.push('  "added": "2026-03-21",')
  lines.push('  "updated": "2026-03-22",')
  lines.push('  "status": "active"')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('### Categories')
  lines.push('')
  lines.push('| Category | Scope |')
  lines.push('|----------|-------|')
  lines.push('| 🗡️ Offensive Security | Recon, exploitation, password cracking, web testing, red team, reverse engineering |')
  lines.push('| 🛡️ Defensive Security | SIEM, WAF, forensics, malware analysis, threat intel, compliance |')
  lines.push('| 🔧 DevSecOps | SAST/DAST/SCA, container & cloud security, supply chain, secrets management |')
  lines.push('| 🤖 AI & Agents | Coding agents, LLM tools, AI frameworks, prompt engineering, AI security |')
  lines.push('| 💻 Development | CLI tools, frameworks, infrastructure, databases, editors |')
  lines.push('| 📚 Research & Learning | CTF platforms, training, knowledge bases, documentation |')
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
