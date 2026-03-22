#!/usr/bin/env node
/**
 * Seed the-vault tools.json from GitHub starred repos.
 * Filters for IT/security/AI/dev-relevant repos and categorizes via Claude API.
 * 
 * Usage: node seed-from-stars.mjs [--dry-run]
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STARS_FILE = resolve(__dirname, 'stars-parsed.json')
const TOOLS_FILE = resolve(__dirname, 'tools.json')
const DRY_RUN = process.argv.includes('--dry-run')

// Categories and subcategories
const TAXONOMY = {
  'offensive-security': [
    'reconnaissance-osint',
    'vulnerability-scanning',
    'exploitation-frameworks',
    'password-cracking',
    'web-app-testing',
    'network-attacks',
    'social-engineering',
    'reverse-engineering',
    'red-team',
  ],
  'defensive-security': [
    'siem-monitoring',
    'waf-firewalls',
    'forensics-ir',
    'malware-analysis',
    'threat-intelligence',
    'compliance-hardening',
    'endpoint-security',
    'network-defense',
  ],
  'devsecops': [
    'sast-dast-sca',
    'container-security',
    'cloud-security',
    'supply-chain',
    'ci-cd-security',
    'secrets-management',
    'iac-security',
  ],
  'ai-agents': [
    'coding-agents',
    'llm-tools',
    'ai-frameworks',
    'automation',
    'prompt-engineering',
    'ai-security',
  ],
  'development': [
    'cli-terminal',
    'frameworks-libraries',
    'infrastructure-devops',
    'databases',
    'api-tools',
    'build-tools',
    'editors-ide',
  ],
  'research-learning': [
    'ctf-practice',
    'training-platforms',
    'knowledge-bases',
    'documentation',
    'books-courses',
  ],
}

const CATEGORY_LIST = Object.entries(TAXONOMY)
  .map(([cat, subs]) => `${cat}: ${subs.join(', ')}`)
  .join('\n')

async function categorizeRepos(repos, client) {
  const BATCH_SIZE = 20
  const results = []

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(repos.length / BATCH_SIZE)
    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} repos)...`)

    const repoList = batch
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.full_name} — ${r.description || 'No description'} [lang: ${r.language || 'N/A'}, topics: ${(r.topics || []).join(', ') || 'none'}]`
      )
      .join('\n')

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
  "note": "<one-line editorial note, max 100 chars, what it does and why it's useful>"
}

Set "relevant": false for repos that are:
- Personal configs/dotfiles (unless they're widely useful tool configs)
- Game mods, game-specific tools (not security/dev related)
- Art/music/entertainment projects
- Single-person hobby projects with no clear IT/security/dev utility
- Repos that are just templates or boilerplates with minimal value

Be inclusive — if it's a useful tool for developers, security professionals, or AI practitioners, it's relevant.

REPOS:
${repoList}

Respond with ONLY the JSON array, no other text.`,
        },
      ],
    })

    const text = msg.content[0].text
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error(`  Failed to parse batch ${batchNum}, skipping`)
      continue
    }

    try {
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
    } catch (e) {
      console.error(`  JSON parse error batch ${batchNum}: ${e.message}`)
    }

    // Rate limiting
    if (i + BATCH_SIZE < repos.length) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  return results
}

async function main() {
  console.log('=== The Vault — Seed from Stars ===\n')

  // Load stars
  const stars = JSON.parse(readFileSync(STARS_FILE, 'utf8'))
  console.log(`Loaded ${stars.length} starred repos`)

  // Load existing tools to avoid re-processing
  let existing = []
  if (existsSync(TOOLS_FILE)) {
    existing = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'))
    console.log(`Found ${existing.length} existing tools`)
  }
  const existingRepos = new Set(existing.map((t) => t.repo))

  // Filter out already-processed repos
  const newStars = stars.filter((s) => !existingRepos.has(s.full_name))
  console.log(`${newStars.length} new repos to categorize\n`)

  if (newStars.length === 0) {
    console.log('Nothing new to process.')
    return
  }

  if (DRY_RUN) {
    console.log('DRY RUN — would categorize these repos:')
    newStars.forEach((s) => console.log(`  ${s.full_name}`))
    return
  }

  // Categorize via Claude
  const client = new Anthropic()
  console.log('Categorizing repos via Claude API...\n')
  const categorized = await categorizeRepos(newStars, client)

  console.log(`\nCategorized ${categorized.length}/${newStars.length} as relevant`)

  // Merge with existing
  const merged = [...existing, ...categorized]

  // Sort by category, then stars descending
  merged.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return b.stars - a.stars
  })

  writeFileSync(TOOLS_FILE, JSON.stringify(merged, null, 2))
  console.log(`\nWrote ${merged.length} tools to ${TOOLS_FILE}`)

  // Stats
  const categories = {}
  for (const tool of merged) {
    categories[tool.category] = (categories[tool.category] || 0) + 1
  }
  console.log('\nCategory breakdown:')
  Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => console.log(`  ${cat}: ${count}`))
}

main().catch(console.error)
