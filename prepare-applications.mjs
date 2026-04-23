#!/usr/bin/env node
/**
 * prepare-applications.mjs
 *
 * 1. Scans 45+ portals for jobs
 * 2. Scores each one with Claude AI
 * 3. For score >= 4.0: generates tailored resume PDF + cover letter
 * 4. Prints a ready-to-apply list with links + file paths
 * 5. Offers to delete all generated files when done
 *
 * Usage: node prepare-applications.mjs
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as readline from 'readline'
import { execSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ANTHROPIC_KEY      = process.env.ANTHROPIC_API_KEY || ''
const MIN_SCORE          = 4.0
const ALREADY_DONE_PATH  = './data/auto-applied.json'
const RESULTS_PATH       = './data/ready-to-apply.md'

const profile = yaml.load(fs.readFileSync('./config/profile.yml', 'utf8'))
const cvText  = fs.readFileSync('./cv.md', 'utf8')
const c       = profile.candidate

const MY_SKILLS = [
  'java','spring boot','spring','spring cloud','spring security','spring mvc',
  'kafka','microservices','rest api','restful','grpc',
  'aws','kubernetes','docker','helm','terraform','ci/cd','jenkins','github actions',
  'postgresql','mysql','mongodb','dynamodb','redis','sql',
  'react','javascript','typescript','html','css','node',
  'oauth2','oauth','jwt','pci','pci-dss',
  'junit','mockito','tdd','git','maven','gradle',
  'python','scala','kotlin','bash','linux',
  'azure','gcp','cloud','serverless','lambda',
  'graphql','elasticsearch','splunk','datadog',
]

let alreadyDone = new Set()
if (fs.existsSync(ALREADY_DONE_PATH)) {
  alreadyDone = new Set(JSON.parse(fs.readFileSync(ALREADY_DONE_PATH, 'utf8')))
}

function markDone(url) {
  alreadyDone.add(url)
  fs.writeFileSync(ALREADY_DONE_PATH, JSON.stringify([...alreadyDone], null, 2))
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()) }))
}

async function claude(prompt, maxTokens = 1500) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content[0].text
}

// ── Scan portals ──────────────────────────────────────────────────────────
async function scanJobs() {
  console.log('\n🔍 Scanning portals...')
  fs.mkdirSync('./data', { recursive: true })
  if (!fs.existsSync('./data/pipeline.md'))     fs.writeFileSync('./data/pipeline.md', '')
  if (!fs.existsSync('./data/scan-history.tsv')) fs.writeFileSync('./data/scan-history.tsv', '')

  try { execSync('node scan.mjs', { stdio: 'inherit' }) } catch {}

  const content = fs.readFileSync('./data/pipeline.md', 'utf8')
  const urls = []
  for (const line of content.split('\n')) {
    const m = line.match(/https?:\/\/[^\s)]+/)
    if (m) {
      const url = m[0].replace(/[)>]+$/, '')
      if (!alreadyDone.has(url)) urls.push(url)
    }
  }
  console.log(`   ${urls.length} new jobs to evaluate`)
  return urls
}

// ── Score job ─────────────────────────────────────────────────────────────
async function scoreJob(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1200)
    const jdText = await page.evaluate(() => document.body.innerText.slice(0, 6000))
    const jdLower = jdText.toLowerCase()

    // Hard filters — skip immediately without using API tokens
    if (/no sponsorship|not.*sponsor|cannot.*sponsor|us citizen.*only|only.*us citizen|must be.*citizen/i.test(jdText)) {
      return { score: 1.0, skipReason: 'No sponsorship / citizens only', url }
    }
    if (/active.*clearance|security clearance|public trust|top secret|ts\/sci|secret clearance/i.test(jdText)) {
      return { score: 1.0, skipReason: 'Requires security clearance', url }
    }

    // Location filter — must be US-based
    const US_STATES = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|remote|united states|usa|\b[A-Z]{2}\b)\b/i
    const NON_US = /\b(india|canada|uk|united kingdom|germany|australia|singapore|europe|london|toronto|berlin|bangalore|mumbai|hyderabad|chennai|pune)\b/i
    if (!US_STATES.test(jdText) || NON_US.test(jdText.slice(0, 500))) {
      return { score: 1.0, skipReason: 'Not a US-based role', url }
    }

    const matched = MY_SKILLS.filter(s => jdLower.includes(s))
    const pct = Math.round((matched.length / MY_SKILLS.length) * 100)

    const resp = await claude(`Score this job for Sahith Bolli, Senior Software Engineer, 5+ yrs Java/Spring Boot/AWS/React/Kafka/Kubernetes. STEM OPT needs H-1B.

Matched skills (${pct}%): ${matched.join(', ')}
CV: ${cvText.slice(0, 1200)}
JD: ${jdText.slice(0, 3500)}

Rules:
- Score 4.0-5.0 if 50%+ skills match
- Score 3.0-3.9 if 30-49% match
- Score < 3.0 if < 30% match
- Score 1.0 if JD says no sponsorship / citizens only / requires clearance / top secret / public trust
- Score 1.0 if role is outside United States
- Director/VP/Head/Executive → score 1.5
- Lead/Manager/Staff OK if years required <= 6
- Years required > 7 → score 1.5
- Sponsorship not mentioned → assume OK, apply

Return ONLY JSON:
{"score":4.2,"company":"Name","role":"Title","location":"City, ST","salaryRange":"$X-$Y","yearsRequired":5,"levelOk":true,"skillMatchPct":${pct},"matchedSkills":${JSON.stringify(matched.slice(0,8))},"skipReason":null,"tailorFocus":"what to emphasize","coverNote":"why great fit"}`,
    700)

    const s = resp.indexOf('{'), e = resp.lastIndexOf('}') + 1
    if (s < 0) return null
    const result = JSON.parse(resp.slice(s, e))
    if ((result.yearsRequired || 0) > 7) result.score = 1.5
    return { ...result, url, jdText }
  } catch { return null }
}

// ── Generate resume + cover letter ────────────────────────────────────────
async function generateMaterials(score) {
  const slug = `${score.company}-${score.role}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const generatedFiles = []

  // Cover letter
  try {
    const coverText = await claude(`Write a 3-paragraph cover letter for Sahith Bolli applying to ${score.role} at ${score.company}.

Role focus: ${score.tailorFocus}
Why fit: ${score.coverNote}
Matched skills: ${(score.matchedSkills || []).join(', ')}

Background: 5+ years Java/Spring Boot at Honeywell (30+ microservices AWS EKS), American Express (PCI-DSS OAuth2), JELD-WEN (8 legacy modernizations), Teva. AWS Certified Developer, Oracle Java SE 11 Certified. MS CS UNC Charlotte GPA 3.6. STEM OPT, needs H-1B sponsorship.

Para 1: Compelling opener specific to ${score.company} — why THIS company
Para 2: 2-3 proof points directly matching the JD (use real numbers from background above)
Para 3: Close mentioning STEM OPT/H-1B, enthusiasm, next step

Max 280 words. No "I am writing to apply" opener.`, 600)

    const coverPath = `./output/${slug}-cover.txt`
    fs.writeFileSync(coverPath, coverText)
    generatedFiles.push(coverPath)
    console.log(`      ✓ Cover letter: ${path.basename(coverPath)}`)
  } catch (e) {
    console.log(`      ⚠️  Cover letter failed: ${e.message}`)
  }

  // Tailored resume PDF
  const templatePath = './templates/cv-template.html'
  if (fs.existsSync(templatePath)) {
    try {
      const template = fs.readFileSync(templatePath, 'utf8')
      const html = await claude(`Rewrite this resume HTML for: ${score.role} at ${score.company}.

Emphasize: ${score.tailorFocus}
Highlight these skills: ${(score.matchedSkills || []).join(', ')}

Rules: Keep EXACT HTML/CSS structure. Reorder bullets to put most relevant experience first. Do NOT add skills candidate doesn't have. Quantify where possible.

CV DATA:
${cvText.slice(0, 2500)}

TEMPLATE (keep this structure exactly):
${template.slice(0, 3500)}

Return ONLY complete HTML.`, 4000)

      const htmlPath = `./output/${slug}.html`
      const pdfPath  = `./output/${slug}.pdf`
      fs.writeFileSync(htmlPath, html)
      generatedFiles.push(htmlPath)

      spawnSync('node', ['generate-pdf.mjs', htmlPath, pdfPath], { stdio: 'ignore' })
      if (fs.existsSync(pdfPath)) {
        generatedFiles.push(pdfPath)
        console.log(`      ✓ Resume PDF: ${path.basename(pdfPath)}`)
      }
    } catch (e) {
      console.log(`      ⚠️  Resume generation failed: ${e.message}`)
    }
  } else {
    // Use best existing PDF
    const pdfs = fs.readdirSync('./output').filter(f => f.endsWith('.pdf') && !f.includes('cover'))
    if (pdfs.length > 0) {
      const best = `./output/${pdfs[pdfs.length - 1]}`
      console.log(`      ✓ Resume: ${path.basename(best)} (existing)`)
      generatedFiles.push(best)
    }
  }

  return generatedFiles
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(58))
  console.log('🤖 HireTrack — Prepare Applications')
  console.log('═'.repeat(58))

  if (!ANTHROPIC_KEY) {
    console.error('\n❌ Run: export ANTHROPIC_API_KEY=your-key\n')
    process.exit(1)
  }

  fs.mkdirSync('./output', { recursive: true })

  const urls = await scanJobs()
  if (urls.length === 0) { console.log('\n✅ No new jobs.\n'); return }

  const browser = await chromium.launch({ headless: true }) // silent, no browser window
  const page    = await (await browser.newContext()).newPage()

  const qualified = []
  const allGeneratedFiles = []
  let idx = 0

  for (const url of urls) {
    idx++
    process.stdout.write(`\n[${idx}/${urls.length}] Scoring... `)
    const score = await scoreJob(page, url)
    if (!score) { console.log('failed'); markDone(url); continue }

    console.log(`${score.score}/5 — ${score.company || '?'} | ${score.role || '?'}`)

    if (score.score < MIN_SCORE) {
      process.stdout.write(`   ⛔ Skip (${score.skipReason || 'low match'})\n`)
      markDone(url)
      continue
    }

    console.log(`   ✅ Qualified! Generating materials...`)
    const files = await generateMaterials(score)
    allGeneratedFiles.push(...files)
    markDone(url)

    // Save to HireTrack and upload files
    let appId = null
    try {
      const res = await fetch(`${HIRETRACK_API}/applications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company: score.company, role: score.role, jobUrl: url,
          location: score.location, salaryRange: score.salaryRange,
          score: score.score, sponsorshipConfirmed: score.sponsorsH1b,
          status: 'EVALUATED',
          notes: `AI scored ${score.score}/5. ${score.skillMatchPct}% skill match.`,
        }),
      })
      if (res.ok) {
        const app = await res.json()
        appId = app.id

        // Upload resume
        const pdfFile = files.find(f => f.endsWith('.pdf'))
        if (pdfFile && appId) {
          const pdfBytes = fs.readFileSync(pdfFile)
          const base64 = pdfBytes.toString('base64')
          await fetch(`${HIRETRACK_API}/applications/${appId}/resume`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ base64, fileName: path.basename(pdfFile) }),
          })
        }

        // Upload cover letter
        const coverFile = files.find(f => f.endsWith('.txt'))
        if (coverFile && appId) {
          const coverText = fs.readFileSync(coverFile, 'utf8')
          await fetch(`${HIRETRACK_API}/applications/${appId}/cover`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: coverText }),
          })
        }
        console.log(`      ✓ Saved to HireTrack (id: ${appId})`)
      }
    } catch { console.log('      ⚠️  HireTrack save failed') }

    qualified.push({
      company:   score.company,
      role:      score.role,
      score:     score.score,
      location:  score.location,
      salary:    score.salaryRange,
      match:     score.skillMatchPct,
      url,
      resume:    files.find(f => f.endsWith('.pdf')) || 'see ./output/',
      cover:     files.find(f => f.endsWith('.txt')) || null,
    })
  }

  await browser.close()

  // ── Print ready-to-apply list ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(58))
  console.log(`🎯 READY TO APPLY — ${qualified.length} jobs`)
  console.log('═'.repeat(58))

  let reportMd = `# Ready to Apply — ${new Date().toLocaleDateString()}\n\n`
  reportMd += `${qualified.length} jobs scored >= ${MIN_SCORE}/5\n\n`

  qualified.sort((a, b) => b.score - a.score).forEach((j, i) => {
    console.log(`\n${i + 1}. ${j.company} — ${j.role}`)
    console.log(`   Score:    ${j.score}/5  |  Match: ${j.match}%  |  ${j.location || ''}  ${j.salary || ''}`)
    console.log(`   Apply:    ${j.url}`)
    console.log(`   Resume:   ${j.resume}`)
    if (j.cover) console.log(`   Cover:    ${j.cover}`)

    reportMd += `## ${i + 1}. ${j.company} — ${j.role}\n`
    reportMd += `- **Score:** ${j.score}/5 | **Match:** ${j.match}% | ${j.location || ''} ${j.salary || ''}\n`
    reportMd += `- **Apply:** ${j.url}\n`
    reportMd += `- **Resume:** \`${j.resume}\`\n`
    if (j.cover) reportMd += `- **Cover letter:** \`${j.cover}\`\n`
    reportMd += '\n'
  })

  fs.writeFileSync(RESULTS_PATH, reportMd)
  console.log(`\n📄 Full list saved: ${RESULTS_PATH}`)
  console.log('═'.repeat(58))

  // ── Cleanup option ─────────────────────────────────────────────────────
  if (allGeneratedFiles.length > 0) {
    const sizeMB = allGeneratedFiles.reduce((sum, f) => {
      try { return sum + fs.statSync(f).size } catch { return sum }
    }, 0) / (1024 * 1024)

    console.log(`\n🗂️  Generated ${allGeneratedFiles.length} files (${sizeMB.toFixed(1)} MB)`)
    console.log('   After you finish applying, run this to delete them:')
    console.log('\n   node prepare-applications.mjs --cleanup\n')
  }
}

// Cleanup mode
if (process.argv.includes('--cleanup')) {
  console.log('\n🗑️  Cleaning up generated files...')
  const outputFiles = fs.readdirSync('./output')
  let deleted = 0, freed = 0
  for (const f of outputFiles) {
    const fp = path.join('./output', f)
    try {
      freed += fs.statSync(fp).size
      fs.unlinkSync(fp)
      deleted++
    } catch {}
  }
  console.log(`   Deleted ${deleted} files, freed ${(freed / 1024 / 1024).toFixed(1)} MB`)
  console.log('   Done.\n')
  process.exit(0)
}

main().catch(console.error)
