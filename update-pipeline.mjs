#!/usr/bin/env node
/**
 * The Vault — Weekly Update Pipeline
 * 
 * Discovers new tools via:
 * 1. GitHub trending repos in security/AI/dev topics
 * 2. GitHub topic search for relevant keywords
 * 3. User's new starred repos since last run
 * 
 * Deduplicates against existing tools.json, categorizes via Claude, updates metadata.
 * 
 * Usage: node update-pipeline.mjs [--dry-run] [--skip-discover] [--skip-refresh]
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOOLS_FILE = resolve(__dirname, 'tools.json')
const MANIFEST_FILE = resolve(__dirname, 'update-manifest.json')
const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_DISCOVER = process.argv.includes('--skip-discover')
const SKIP_REFRESH = process.argv.includes('--skip-refresh')

// Search queries for discovering new tools
const SEARCH_QUERIES = [
  'security tool',
  'penetration testing',
  'vulnerability scanner',
  'threat intelligence',
  'malware analysis',
  'incident response',
  'OSINT tool',
  'coding agent',
  'LLM tool',
  'AI framework',
  'DevSecOps',
  'container security',
  'cloud security',
  'SAST DAST',
  'red team tool',
  'blue team tool',
  'forensics tool',
  'CTF tool',
  'reverse engineering',
  'fuzzing',
  'WAF',
  'IDS IPS',
  'password cracking',
  'network scanner',
  'exploit framework',
  'bug bounty tool',
  'supply chain security',
  'secrets scanner',
  'kubernetes security',
  'terraform security',
]

// Minimum stars to consider a repo
const MIN_STARS = 100

// Maximum new tools to add per run
const MAX_NEW_PER_RUN = 50

const TAXONOMY = {
  'offensive-security': [
    'reconnaissance-osint', 'vulnerability-scanning', 'exploitation-frameworks',
    'password-cracking', 'web-app-testing', 'network-attacks', 'social-engineering',
    'reverse-engineering', 'red-team',
  ],
  'defensive-security': [
    'siem-monitoring', 'waf-firewalls', 'forensics-ir', 'malware-analysis',
    'threat-intelligence', 'compliance-hardening', 'endpoint-security', 'network-defense',
  ],
  'devsecops': [
    'sast-dast-sca', 'container-security', 'cloud-security', 'supply-chain',
    'ci-cd-security', 'secrets-management', 'iac-security',
  ],
  'ai-agents': [
    'coding-agents', 'llm-tools', 'ai-frameworks', 'automation',
    'prompt-engineering', 'ai-security',
  ],
  'development': [
    'cli-terminal', 'frameworks-libraries', 'infrastructure-devops',
    'databases', 'api-tools', 'build-tools', 'editors-ide',
  ],
  'research-learning': [
    'ctf-practice', 'training-platforms', 'knowledge-bases',
    'documentation', 'books-courses',
  ],
}

function loadManifest() {
  if (existsSync(MANIFEST_FILE)) {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))
  }
  return { lastRun: null, discoveredRepos: [] }
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
}

function ghApi(endpoint) {
  try {
    const result = execSync(`gh api "${endpoint}" 2>/dev/null`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    return JSON.parse(result)
  } catch {
    return null
  }
}

async function discoverRepos(existingRepos) {
  const candidates = new Map()

  console.log('Discovering new repos...\n')

  // 1. Search GitHub by topics
  const querySubset = SEARCH_QUERIES.sort(() => Math.random() - 0.5).slice(0, 10)
  for (const query of querySubset) {
    console.log(`  Searching: "${query}"...`)
    const encodedQuery = encodeURIComponent(`${query} stars:>${MIN_STARS}`)
    const result = ghApi(
      `search/repositories?q=${encodedQuery}&sort=stars&order=desc&per_page=30`
    )
    if (result?.items) {
      for (const repo of result.items) {
        if (!existingRepos.has(repo.full_name) && repo.stargazers_count >= MIN_STARS) {
          candidates.set(repo.full_name, {
            name: repo.name,
            full_name: repo.full_name,
            url: repo.html_url,
            description: repo.description || '',
            language: repo.language || '',
            stars: repo.stargazers_count,
            topics: repo.topics || [],
            archived: repo.archived,
            updated_at: repo.updated_at,
            homepage: repo.homepage || '',
          })
        }
      }
    }
    // Rate limiting for search API
    await new Promise((r) => setTimeout(r, 3000))
  }

  // 2. Check user's new stars
  console.log('\n  Checking new stars...')
  try {
    const starsRaw = execSync('gh api user/starred --paginate --jq \'.[] | {name: .name, full_name: .full_name, url: .html_url, description: (.description // ""), language: (.language // ""), stars: .stargazers_count, topics: (.topics // []), archived: .archived, updated_at: .updated_at, homepage: (.homepage // "")}\'', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    })
    // --paginate + --jq outputs one JSON object per line (NDJSON)
    const stars = starsRaw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    for (const repo of stars) {
      if (!existingRepos.has(repo.full_name)) {
        candidates.set(repo.full_name, repo)
      }
    }
    console.log(`  Found ${stars.filter(s => !existingRepos.has(s.full_name)).length} new starred repos`)
  } catch (e) {
    console.log(`  Stars check failed: ${e.message}`)
  }

  console.log(`\n  Total unique candidates: ${candidates.size}`)
  return Array.from(candidates.values())
}

async function categorizeRepos(repos, client) {
  const BATCH_SIZE = 20
  const results = []
  const CATEGORY_LIST = Object.entries(TAXONOMY)
    .map(([cat, subs]) => `${cat}: ${subs.join(', ')}`)
    .join('\n')

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(repos.length / BATCH_SIZE)
    console.log(`  Categorizing batch ${batchNum}/${totalBatches}...`)

    const repoList = batch
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.full_name} — ${r.description || 'No description'} [lang: ${r.language || 'N/A'}, stars: ${r.stars}, topics: ${(r.topics || []).join(', ') || 'none'}]`
      )
      .join('\n')

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: `You are categorizing GitHub repositories for "The Vault" — a curated collection of security, AI, and development tools.

CATEGORIES AND SUBCATEGORIES:
${CATEGORY_LIST}

For each repo below, respond with a JSON array. Each element:
{
  "index": <1-based index>,
  "relevant": true/false,
  "category": "<category-slug>",
  "subcategory": "<subcategory-slug>",
  "note": "<one-line editorial note, max 100 chars>"
}

Set "relevant": false for non-IT repos (games, art, personal projects, etc.)

REPOS:
${repoList}

Respond with ONLY the JSON array.`,
          },
        ],
      })

      const text = msg.content[0].text
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        for (const item of parsed) {
          if (item.relevant) {
            const repo = batch[item.index - 1]
            if (repo) {
              results.push({
                name: repo.name,
                repo: repo.full_name,
                url: repo.url,
                description: repo.description || '',
                category: item.category,
                subcategory: item.subcategory,
                language: repo.language || '',
                stars: repo.stars,
                topics: repo.topics || [],
                note: item.note,
                added: new Date().toISOString().split('T')[0],
                updated: repo.updated_at?.split('T')[0] || '',
                status: repo.archived ? 'archived' : 'active',
                homepage: repo.homepage || '',
              })
            }
          }
        }
      }
    } catch (e) {
      if (e.status === 429 || (e.message && e.message.includes('429'))) {
        console.log(`  Batch ${batchNum} rate limited — waiting 60s and retrying...`)
        await new Promise((r) => setTimeout(r, 60000))
        try {
          const retry = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [
              {
                role: 'user',
                content: `You are categorizing GitHub repositories for "The Vault" — a curated collection of security, AI, and development tools.

CATEGORIES AND SUBCATEGORIES:
${CATEGORY_LIST}

For each repo below, respond with a JSON array. Each element:
{
  "index": <1-based index>,
  "relevant": true/false,
  "category": "<category-slug>",
  "subcategory": "<subcategory-slug>",
  "note": "<one-line editorial note, max 100 chars>"
}

Set "relevant": false for non-IT repos (games, art, personal projects, etc.)

REPOS:
${repoList}

Respond with ONLY the JSON array.`,
              },
            ],
          })
          const retryText = retry.content[0].text
          const retryMatch = retryText.match(/\[[\s\S]*\]/)
          if (retryMatch) {
            const parsed = JSON.parse(retryMatch[0])
            for (const item of parsed) {
              if (item.relevant) {
                const repo = batch[item.index - 1]
                if (repo) {
                  results.push({
                    name: repo.name,
                    repo: repo.full_name,
                    url: repo.url,
                    description: repo.description || '',
                    category: item.category,
                    subcategory: item.subcategory,
                    language: repo.language || '',
                    stars: repo.stars,
                    topics: repo.topics || [],
                    note: item.note,
                    added: new Date().toISOString().split('T')[0],
                    updated: repo.updated_at?.split('T')[0] || '',
                    status: repo.archived ? 'archived' : 'active',
                    homepage: repo.homepage || '',
                  })
                }
              }
            }
            console.log(`  Batch ${batchNum} retry succeeded`)
          }
        } catch (retryErr) {
          console.error(`  Batch ${batchNum} retry failed: ${retryErr.message}`)
        }
      } else {
        console.error(`  Batch ${batchNum} error: ${e.message}`)
      }
    }

    if (i + BATCH_SIZE < repos.length) {
      await new Promise((r) => setTimeout(r, 15000))
    }
  }

  return results
}

async function refreshMetadata(tools) {
  console.log('Refreshing metadata for existing tools...\n')
  let updated = 0
  let archived = 0

  // Process in batches via gh api
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i]
    if (!tool.repo) continue

    // Only refresh 1/4 of tools per run to stay within rate limits
    if (i % 4 !== Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % 4) continue

    try {
      const data = ghApi(`repos/${tool.repo}`)
      if (data) {
        if (data.stargazers_count !== tool.stars) {
          tool.stars = data.stargazers_count
          updated++
        }
        if (data.archived && tool.status !== 'archived') {
          tool.status = 'archived'
          archived++
        }
        tool.updated = data.updated_at?.split('T')[0] || tool.updated
      }
    } catch {
      // skip failed lookups
    }

    // Gentle rate limiting
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 1000))
  }

  console.log(`  Updated ${updated} star counts, ${archived} newly archived`)
  return tools
}

async function main() {
  console.log('=== The Vault — Weekly Update ===\n')

  // Load existing tools
  let tools = []
  if (existsSync(TOOLS_FILE)) {
    tools = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'))
  }
  console.log(`Existing tools: ${tools.length}`)

  const existingRepos = new Set(tools.map((t) => t.repo))
  const manifest = loadManifest()

  // Phase 1: Discover new repos
  let newTools = []
  if (!SKIP_DISCOVER) {
    const candidates = await discoverRepos(existingRepos)

    if (candidates.length > 0 && !DRY_RUN) {
      // Limit candidates to avoid excessive API usage
      const limited = candidates.slice(0, MAX_NEW_PER_RUN * 2)
      console.log(`\nCategorizing ${limited.length} candidates...\n`)

      const client = new Anthropic()
      newTools = await categorizeRepos(limited, client)
      console.log(`\nAccepted ${newTools.length} new tools`)
    } else if (DRY_RUN) {
      console.log(`\nDRY RUN — ${candidates.length} candidates found`)
      candidates.slice(0, 20).forEach((c) => console.log(`  ${c.full_name} (⭐ ${c.stars})`))
    }
  }

  // Phase 2: Refresh metadata on existing tools
  if (!SKIP_REFRESH && !DRY_RUN) {
    tools = await refreshMetadata(tools)
  }

  if (!DRY_RUN) {
    // Merge new tools
    const merged = [...tools, ...newTools]
    merged.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return b.stars - a.stars
    })

    writeFileSync(TOOLS_FILE, JSON.stringify(merged, null, 2))
    console.log(`\nWrote ${merged.length} total tools`)

    // Update manifest
    manifest.lastRun = new Date().toISOString()
    manifest.discoveredRepos.push(
      ...newTools.map((t) => ({ repo: t.repo, added: t.added }))
    )
    saveManifest(manifest)

    // Generate README
    const { execSync: exec } = await import('child_process')
    exec('node generate-readme.mjs', { cwd: __dirname, stdio: 'inherit' })
  }

  // Stats
  const categories = {}
  for (const tool of [...tools, ...newTools]) {
    categories[tool.category] = (categories[tool.category] || 0) + 1
  }
  console.log('\nCategory breakdown:')
  Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))
}

main().catch(console.error)
