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
const HIRETRACK_API      = process.env.HIRETRACK_API || 'https://career-ops-production-fbb0.up.railway.app/api'

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
  const model = global._CLAUDE_MODEL || 'claude-haiku-4-5-20251001'
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(`API error: ${data.error.message}`)
  if (data.type === 'error') throw new Error(`API error type: ${JSON.stringify(data)}`)
  if (!data.content || !data.content[0]) throw new Error(`No content in response: ${JSON.stringify(data).slice(0, 200)}`)
  return data.content[0].text
}

// ── Scan portals ──────────────────────────────────────────────────────────
async function scanJobs() {
  console.log('\n🔍 Scanning portals for new jobs...')
  fs.mkdirSync('./data', { recursive: true })
  if (!fs.existsSync('./data/pipeline.md'))      fs.writeFileSync('./data/pipeline.md', '')
  if (!fs.existsSync('./data/scan-history.tsv')) fs.writeFileSync('./data/scan-history.tsv', '')

  // Run scan to add any brand new jobs
  try { execSync('node scan.mjs', { stdio: 'inherit' }) } catch {}

  // Read ALL unchecked jobs from pipeline.md (not just new ones)
  const content = fs.readFileSync('./data/pipeline.md', 'utf8')
  const urls = []
  for (const line of content.split('\n')) {
    // Only pick unchecked items (- [ ] lines)
    if (!line.includes('- [ ]') && !line.includes('- [x]') && line.includes('http')) {
      const m = line.match(/https?:\/\/[^\s)|]+/)
      if (m) {
        const url = m[0].replace(/[)>|]+$/, '')
        if (!alreadyDone.has(url)) urls.push(url)
      }
    } else if (line.includes('- [ ]')) {
      const m = line.match(/https?:\/\/[^\s)|]+/)
      if (m) {
        const url = m[0].replace(/[)>|]+$/, '')
        if (!alreadyDone.has(url)) urls.push(url)
      }
    }
  }
  const unique = [...new Set(urls)]
  console.log(`   ${unique.length} jobs to evaluate (from pipeline.md)`)
  return unique
}

// ── JD cache (Ashby board per slug, avoids re-fetching) ────────────────────
const _ashbyCache = {}

// ── Fetch JD text via API (fast, reliable) or Playwright fallback ──────────
async function fetchJdText(url) {
  // Ashby: jobs.ashbyhq.com/{slug}/{id}
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{36})/i)
  if (ashbyMatch) {
    const [, slug, jobId] = ashbyMatch
    try {
      // Load & cache board
      if (!_ashbyCache[slug]) {
        const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`, { signal: AbortSignal.timeout(10000) })
        if (r.ok) _ashbyCache[slug] = (await r.json()).jobs || []
      }
      const jobs = _ashbyCache[slug] || []
      const job = jobs.find(j => j.id === jobId || j.externalId === jobId || (j.jobUrl || '').includes(jobId))
      if (job) {
        const txt = [job.title, job.location, job.descriptionPlain || ''].join(' ')
        return txt.replace(/\s+/g, ' ').slice(0, 6000)
      }
    } catch {}
  }

  // Custom Greenhouse career pages with ?gh_jid= (e.g. pinterestcareers.com?gh_jid=123)
  // Load portals.yml to map domain → board slug
  const ghJidMatch = url.match(/[?&]gh_jid=(\d+)/)
  if (ghJidMatch) {
    try {
      const portalsYaml = (await import('fs')).readFileSync('portals.yml', 'utf-8')
      const portalsConfig = (await import('js-yaml')).default.load(portalsYaml)
      const jobId = ghJidMatch[1]
      const urlHost = new URL(url).hostname.replace(/^www\./, '')
      for (const co of (portalsConfig.tracked_companies || [])) {
        const apiUrl = co.api || ''
        const slugMatch = apiUrl.match(/\/boards\/([^/]+)\/jobs/)
        if (!slugMatch) continue
        const careersHost = co.careers_url ? new URL(co.careers_url).hostname.replace(/^www\./, '') : ''
        if (careersHost && urlHost.includes(careersHost.split('.')[0])) {
          const slug = slugMatch[1]
          const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`, { signal: AbortSignal.timeout(8000) })
          if (r.ok) {
            const d = await r.json()
            const parts = [d.title, d.location?.name, d.content || ''].join(' ')
            return parts
              .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
              .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
          }
        }
      }
    } catch {}
  }

  // Greenhouse: job-boards.greenhouse.io/{slug}/jobs/{id}  OR  boards.greenhouse.io/{slug}/jobs/{id}
  const ghMatch = url.match(/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/)
  if (ghMatch) {
    try {
      const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${ghMatch[1]}/jobs/${ghMatch[2]}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) {
        const d = await r.json()
        const parts = [d.title, d.location?.name, d.content || ''].join(' ')
        return parts
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
      }
    } catch {}
  }

  // Lever: jobs.lever.co/{slug}/{id}
  const leverMatch = url.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{36})/i)
  if (leverMatch) {
    try {
      const r = await fetch(`https://api.lever.co/v0/postings/${leverMatch[1]}/${leverMatch[2]}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) {
        const d = await r.json()
        const parts = [d.text, d.categories?.location, d.description || d.descriptionBody || '', (d.lists || []).map(l => l.content).join(' ')].join(' ')
        return parts.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
      }
    } catch {}
  }

  // Playwright fallback for everything else (Indeed, custom sites, etc.)
  return null  // caller will use Playwright
}

// ── Score job ─────────────────────────────────────────────────────────────
async function scoreJob(page, url) {
  try {
    let jdText = ''

    // Try fast API fetch first (Ashby/Greenhouse/Lever)
    jdText = await fetchJdText(url) || ''

    // Playwright fallback if API didn't work
    if (!jdText || jdText.length < 100) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 })
        // Wait for actual content to render (SPA support)
        await page.waitForFunction(() => document.body.innerText.trim().length > 200, { timeout: 6000 }).catch(() => {})
        jdText = await page.evaluate(() => document.body.innerText.slice(0, 6000))
      } catch {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) })
          const html = await r.text()
          jdText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
        } catch { return null }
      }
    }

    if (!jdText || jdText.length < 100) return null
    const jdLower = jdText.toLowerCase()

    // Hard filters — skip immediately without using API tokens
    if (/no sponsorship|not.*sponsor|cannot.*sponsor|us citizen.*only|only.*us citizen|must be.*citizen/i.test(jdText)) {
      return { score: 1.0, skipReason: 'No sponsorship / citizens only', url }
    }
    if (/active.*clearance|security clearance|public trust|top secret|ts\/sci|secret clearance/i.test(jdText)) {
      return { score: 1.0, skipReason: 'Requires security clearance', url }
    }

    // Location filter — skip only if EXPLICITLY a non-US role
    const NON_US = /\b(india|canada|united kingdom|germany|australia|singapore|london|toronto|berlin|bangalore|mumbai|hyderabad|chennai|pune|amsterdam|paris|sydney|brazil|brasil|são paulo|sao paulo|rio de janeiro|mexico|méxico|argentina|colombia|chile|peru|bogotá|bogota|lima|santiago|buenos aires|ireland|dublin|netherlands|spain|madrid|barcelona|italy|milan|rome|sweden|stockholm|poland|warsaw|japan|tokyo|china|beijing|shanghai|korea|seoul|taiwan|taipei|new zealand|auckland|south africa|johannesburg)\b/i
    if (NON_US.test(jdText.slice(0, 800))) {
      return { score: 1.0, skipReason: 'Non-US location', url }
    }

    const matched = MY_SKILLS.filter(s => jdLower.includes(s))
    const pct = Math.round((matched.length / MY_SKILLS.length) * 100)

    const resp = await claude(`Score this job for Sahith Bolli, Senior Software Engineer, 5+ yrs Java/Spring Boot/AWS/React/Kafka/Kubernetes. STEM OPT needs H-1B.

Matched skills (${pct}%): ${matched.join(', ')}
CV: ${cvText.slice(0, 1200)}
JD: ${jdText.slice(0, 3500)}

Rules:
- Score based ONLY on skill match percentage — 4.0-5.0 if 50%+, 3.0-3.9 if 30-49%, below 3.0 if under 30%
- Candidate can relocate to ANY US city or state — never penalize for on-site, hybrid, or specific location within US
- SPONSORSHIP: ONLY score 1.0 if JD EXPLICITLY says "no sponsorship", "will not sponsor", "citizens only", "must be US citizen/PR". If sponsorship is not mentioned at all → score normally and apply
- Clearance/public trust/top secret → score 1.0
- Director/VP/Head/Executive → score 1.5
- Lead/Manager/Staff OK if years required <= 6
- Years required > 6 → score 1.5
- Sponsorship not mentioned → assume OK, apply

Return ONLY JSON:
{"score":4.2,"company":"Name","role":"Title","location":"City, ST","salaryRange":"$X-$Y","yearsRequired":5,"levelOk":true,"skillMatchPct":${pct},"matchedSkills":${JSON.stringify(matched.slice(0,8))},"skipReason":null,"tailorFocus":"what to emphasize","coverNote":"why great fit"}`,
    700)

    const s = resp.indexOf('{'), e = resp.lastIndexOf('}') + 1
    if (s < 0) return null
    const result = JSON.parse(resp.slice(s, e))
    if ((result.yearsRequired || 0) > 6) result.score = 1.5
    return { ...result, url, jdText }
  } catch (err) {
    process.stdout.write(`[ERR: ${err.message.slice(0, 80)}] `)
    return null
  }
}

// ── Generate resume + cover letter ────────────────────────────────────────
async function generateMaterials(score) {
  const slug = `sahith-${score.company}-${score.role}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
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
      let html = await claude(`Rewrite this resume HTML for: ${score.role} at ${score.company}.

Emphasize: ${score.tailorFocus}
Highlight these skills: ${(score.matchedSkills || []).join(', ')}

STRICT RULES:
- Use the EXACT HTML/CSS structure from the template — same sections, same order, same styling
- Section order MUST be: Summary → Certifications → Technical Skills → Experience → Education
- Include ALL 4 jobs: Honeywell, JELD-WEN, American Express, Teva — with ALL bullet points
- EDUCATION: ONE degree only — MS Computer Science, UNC Charlotte, GPA 3.6, Jan 2023–May 2024. NO Bachelor's. NO invented degrees.
- Do NOT add any skill, job, or credential not in the CV DATA
- Do NOT truncate — write the COMPLETE HTML for all sections
- Return ONLY raw HTML starting with <!DOCTYPE html> — no markdown, no code fences

CV DATA (use ONLY this):
${cvText}

TEMPLATE:
${template.slice(0, 4000)}

Return the COMPLETE HTML. Do not stop early.`, 8000)

      // Strip markdown code fences if Claude wrapped the HTML
      html = html.replace(/^```[\w]*\n?/m, '').replace(/\n?```\s*$/m, '').trim()
      if (!html.startsWith('<!') && !html.startsWith('<html')) {
        const start = html.indexOf('<!DOCTYPE') !== -1 ? html.indexOf('<!DOCTYPE') : html.indexOf('<html')
        if (start > -1) html = html.slice(start)
      }

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

  // ── Validate API key + model at startup ──
  console.log('\n🔑 Checking Anthropic API...')
  try {
    const testRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    })
    const testData = await testRes.json()
    if (testData.error) {
      // Try fallback model
      const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
      })
      const fallbackData = await fallbackRes.json()
      if (fallbackData.error) {
        console.error(`\n❌ API error: ${testData.error.message}\n   Check your ANTHROPIC_API_KEY in start.sh\n`)
        process.exit(1)
      }
      console.log('   ✓ API OK (using claude-3-5-haiku-20241022)')
      // Patch the claude function to use fallback model
      global._CLAUDE_MODEL = 'claude-3-5-haiku-20241022'
    } else {
      console.log('   ✓ API OK (using claude-haiku-4-5-20251001)')
      global._CLAUDE_MODEL = 'claude-haiku-4-5-20251001'
    }
  } catch (e) {
    console.error(`\n❌ Cannot reach Anthropic API: ${e.message}\n   Check your internet connection.\n`)
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
    if (!score) { console.log('failed'); continue }

    console.log(`${score.score}/5 — ${score.company || '?'} | ${score.role || '?'}`)

    if (score.score < MIN_SCORE) {
      process.stdout.write(`   ⛔ Skip (${score.skipReason || 'low match'})\n`)
      // Only permanently skip hard-blocked jobs (clearance, non-US, no sponsorship)
      if (score.skipReason && (score.skipReason.includes('clearance') || score.skipReason.includes('Non-US') || score.skipReason.includes('sponsorship'))) {
        markDone(url)
      }
      continue
    }

    // Skip jobs where company/role couldn't be identified (empty JD fetched)
    if (!score.company || score.company.toLowerCase() === 'unknown' ||
        !score.role || score.role.toLowerCase() === 'unknown') {
      process.stdout.write(`   ⚠️  Skip (company/role unknown — JD fetch failed)\n`)
      continue
    }

    console.log(`   ✅ Qualified! Generating materials...`)
    const files = await generateMaterials(score)
    allGeneratedFiles.push(...files)
    markDone(url) // only mark done after successful material generation

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
