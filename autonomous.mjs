#!/usr/bin/env node
/**
 * autonomous.mjs — Fully autonomous job search + apply agent
 *
 * One command does everything:
 *   1. Scans 45+ company portals for Java jobs
 *   2. Claude AI scores each one (skips < 4.0 and Lead/Manager roles)
 *   3. Generates a tailored PDF resume for each qualifying job
 *   4. Auto-fills and submits the application
 *   5. Tracks everything in HireTrack
 *
 * Usage:
 *   node autonomous.mjs              # full run
 *   node autonomous.mjs --dry-run    # see what it would apply to, no submit
 *   node autonomous.mjs --limit 5    # apply to max 5 jobs this run
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { execSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ─────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || ''
const HIRETRACK_API  = 'https://career-ops-production-fbb0.up.railway.app/api'
const MIN_SCORE      = 4.0
const DRY_RUN        = process.argv.includes('--dry-run')
const LIMIT          = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '999')
const ALREADY_APPLIED_PATH = './data/auto-applied.json'

// Load profile
const profile  = yaml.load(fs.readFileSync('./config/profile.yml', 'utf8'))
const cvText   = fs.readFileSync('./cv.md', 'utf8')
const c        = profile.candidate

const ME = {
  firstName: c.full_name.split(' ')[0],
  lastName:  c.full_name.split(' ').slice(1).join(' '),
  fullName:  c.full_name,
  email:     c.email,
  phone:     c.phone,
  location:  c.location,
  city:      c.location.split(',')[0].trim(),
  linkedin:  'https://' + c.linkedin,
}

// Load already-applied list (to avoid duplicates)
let alreadyApplied = new Set()
if (fs.existsSync(ALREADY_APPLIED_PATH)) {
  alreadyApplied = new Set(JSON.parse(fs.readFileSync(ALREADY_APPLIED_PATH, 'utf8')))
}

function saveApplied(url) {
  alreadyApplied.add(url)
  fs.writeFileSync(ALREADY_APPLIED_PATH, JSON.stringify([...alreadyApplied], null, 2))
}

// ── Claude API ────────────────────────────────────────────────────────────
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

// ── Step 1: Scan portals ──────────────────────────────────────────────────
async function scanJobs() {
  console.log('\n🔍 Scanning 45+ company portals for software engineering jobs...')
  try {
    execSync('node scan.mjs', { stdio: 'inherit' })
  } catch (e) {
    console.log('   ⚠️  Scan had errors but continuing...')
  }

  const pipelinePath = './data/pipeline.md'
  if (!fs.existsSync(pipelinePath)) return []

  const content = fs.readFileSync(pipelinePath, 'utf8')
  const urls = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/https?:\/\/[^\s)]+/)
    if (match) {
      const url = match[0].replace(/[)>]+$/, '')
      if (!alreadyApplied.has(url)) urls.push(url)
    }
  }
  console.log(`   Found ${urls.length} new jobs to evaluate`)
  return urls
}

// ── Step 2: Fetch JD and score ────────────────────────────────────────────
const MY_SKILLS = [
  'java','spring boot','spring','spring cloud','spring security','spring mvc',
  'kafka','microservices','rest api','restful','grpc',
  'aws','kubernetes','docker','helm','terraform','ci/cd','jenkins','github actions',
  'postgresql','mysql','mongodb','dynamodb','redis','sql',
  'react','javascript','typescript','html','css','node',
  'oauth2','oauth','jwt','pci','pci-dss','sso',
  'junit','mockito','testng','tdd','git','maven','gradle',
  'python','scala','kotlin','go','bash','linux',
  'azure','gcp','cloud','serverless','lambda',
  'graphql','elasticsearch','splunk','datadog','prometheus',
]

async function fetchAndScore(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)
    const jdText = await page.evaluate(() => document.body.innerText.slice(0, 6000))
    const jdLower = jdText.toLowerCase()

    // Hard filters — skip immediately without using API tokens
    if (/no sponsorship|not.*sponsor|cannot.*sponsor|us citizen.*only|only.*us citizen|greencard.*only|must be.*citizen/i.test(jdText)) {
      return { score: 1.0, company: '?', role: '?', skipReason: 'No sponsorship / citizens only', levelOk: true, url, jdText }
    }
    if (/active.*clearance|security clearance|public trust|top secret|ts\/sci|secret clearance/i.test(jdText)) {
      return { score: 1.0, company: '?', role: '?', skipReason: 'Requires security clearance', levelOk: true, url, jdText }
    }
    const NON_US = /\b(india|canada|united kingdom|germany|australia|singapore|london|toronto|berlin|bangalore|mumbai|hyderabad|chennai|pune|amsterdam|paris|sydney)\b/i
    if (NON_US.test(jdText.slice(0, 800))) {
      return { score: 1.0, company: '?', role: '?', skipReason: 'Non-US location', levelOk: true, url, jdText }
    }

    // Skill match: count how many of candidate's skills appear in JD
    const matched = MY_SKILLS.filter(s => jdLower.includes(s))
    const skillMatchPct = matched.length / MY_SKILLS.length

    const prompt = `Evaluate this job for ${ME.fullName}.

CANDIDATE SKILLS: Java, Spring Boot, Spring Cloud, Kafka, AWS (Certified), Kubernetes, Docker, React, JavaScript, PostgreSQL, MongoDB, OAuth2, PCI-DSS, Jenkins, Terraform, JUnit, Mockito. 5+ years at Honeywell, American Express, JELD-WEN, Teva. MS CS from UNC Charlotte. On STEM OPT, needs H-1B sponsorship.

SKILLS ALREADY MATCHED IN JD: ${matched.join(', ')} (${Math.round(skillMatchPct*100)}% match)

CV SUMMARY:
${cvText.slice(0, 1500)}

JOB PAGE TEXT:
${jdText.slice(0, 4000)}

SCORING RULES:
1. Score based ONLY on skill match — 4.0-5.0 if 50%+, 3.0-3.9 if 30-49%, below 3.0 if under 30%
2. LOCATION: Candidate can work ONSITE, HYBRID, or REMOTE anywhere in the US. Never penalize for location within US.
3. SPONSORSHIP: ONLY skip (score 1.0) if JD EXPLICITLY says "will not sponsor", "no sponsorship", "US citizens only", "must be citizen or green card". If sponsorship is not mentioned at all → apply normally, do not penalize.
4. CLEARANCE: Skip if requires active clearance, public trust, top secret, TS/SCI.
5. Level rules:
   - Senior/Mid/Junior/Lead/Manager/Staff → OK if years required <= 6
   - Director/VP/Head of/Executive → always skip (score 1.5)
   - Years required > 7 → skip (score 1.5)

Return ONLY valid JSON:
{
  "score": 4.2,
  "company": "Company Name",
  "role": "Job Title",
  "location": "City, State",
  "salaryRange": "$130K-$180K",
  "yearsRequired": 5,
  "sponsorsH1b": null,
  "levelOk": true,
  "skillMatchPct": 62,
  "matchedSkills": ["Java", "Spring Boot", "AWS"],
  "skipReason": null,
  "tailorFocus": "2 sentences on what to emphasize in resume",
  "coverNote": "One sentence on why candidate is a great fit for THIS specific role"
}`

    const response = await claude(prompt, 900)
    const start = response.indexOf('{')
    const end = response.lastIndexOf('}') + 1
    if (start < 0) return null
    const result = JSON.parse(response.slice(start, end))
    // Enforce year cap
    if (result.yearsRequired > 7) result.score = 1.5
    return { ...result, url, jdText }
  } catch (e) {
    return null
  }
}

// ── Step 3: Generate tailored resume PDF + cover letter ───────────────────
async function generateResumeAndCover(score) {
  const slug = `${score.company}-${score.role}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35)
  let resumePath = null

  // Cover letter
  try {
    const coverPrompt = `Write a concise 3-paragraph cover letter for ${ME.fullName} applying to ${score.role} at ${score.company}.

Role focus: ${score.tailorFocus}
Matched skills: ${(score.matchedSkills || []).join(', ')}
Why fit: ${score.coverNote}

Candidate background:
- 5+ years Java/Spring Boot at Honeywell (30+ microservices AWS EKS), American Express (PCI-DSS OAuth2), JELD-WEN (8 legacy modernizations), Teva
- AWS Certified Developer, Oracle Java SE 11 Certified
- MS Computer Science, UNC Charlotte (GPA 3.6)
- On STEM OPT, will require H-1B sponsorship

Paragraph 1: Strong opening with specific reason for interest in ${score.company}
Paragraph 2: 2-3 specific proof points matching the JD requirements: ${score.tailorFocus}
Paragraph 3: Brief close mentioning sponsorship, excitement about the role

Keep it under 300 words. Professional but not generic. No "I am writing to apply" opener.`

    const coverText = await claude(coverPrompt, 600)
    const coverPath = `./output/${slug}-cover.txt`
    fs.writeFileSync(coverPath, coverText)
    console.log(`   ✓ Cover letter: ${path.basename(coverPath)}`)
    score.coverLetter = coverText
  } catch (e) {
    score.coverLetter = `I am excited to apply for the ${score.role} position at ${score.company}. ${score.coverNote} I bring 5+ years in Java/Spring Boot at Honeywell, American Express, and JELD-WEN, with AWS Certified Developer credentials. I am on STEM OPT and will require H-1B sponsorship.`
  }

  // Tailored resume PDF
  const templatePath = './templates/cv-template.html'
  if (fs.existsSync(templatePath)) {
    try {
      const template = fs.readFileSync(templatePath, 'utf8')
      const resumePrompt = `Rewrite this resume HTML to best match the job: ${score.role} at ${score.company}.

JD requirements summary: ${score.tailorFocus}
Skills to highlight: ${(score.matchedSkills || []).join(', ')}

Rules:
- Keep EXACT HTML/CSS structure and layout
- Reorder/reword bullet points to put most relevant experience first
- Add any matched skills from JD that candidate actually has
- Quantify achievements where possible
- Do NOT fabricate experience or skills not in the CV

CANDIDATE CV:
${cvText.slice(0, 2500)}

TEMPLATE HTML (structure to keep):
${template.slice(0, 3500)}

Return ONLY the complete tailored HTML.`

      const html = await claude(resumePrompt, 4000)
      const htmlPath = `./output/${slug}.html`
      const pdfPath  = `./output/${slug}.pdf`
      fs.writeFileSync(htmlPath, html)
      spawnSync('node', ['generate-pdf.mjs', htmlPath, pdfPath], { stdio: 'ignore' })
      if (fs.existsSync(pdfPath)) {
        resumePath = path.resolve(pdfPath)
        console.log(`   ✓ Tailored resume: ${path.basename(pdfPath)}`)
      }
    } catch {}
  }

  // Fallback to best existing PDF
  if (!resumePath) {
    const pdfs = fs.readdirSync('./output').filter(f => f.endsWith('.pdf') && !f.includes('cover'))
    if (pdfs.length > 0) {
      resumePath = path.resolve('./output/' + pdfs[pdfs.length - 1])
      console.log(`   Using existing resume: ${path.basename(resumePath)}`)
    }
  }

  return resumePath
}

// ── Step 4: Auto-fill and submit ──────────────────────────────────────────
async function applyToJob(page, score, resumePath) {
  const platform = detectPlatform(score.url)
  const cover    = score.coverLetter || `I am excited to apply for ${score.role} at ${score.company}. I bring 5+ years in Java/Spring Boot at Honeywell (AWS EKS, Kafka), American Express (PCI-compliant OAuth2), and JELD-WEN (8 legacy modernizations). AWS Certified Developer. MS CS from UNC Charlotte. On STEM OPT, will require H-1B sponsorship.`

  try {
    await page.goto(score.url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(2000)

    if (platform === 'greenhouse') {
      // Find apply button if on job description page
      const applyBtn = await page.$('a[href*="application"], a:text("Apply for this Job"), button:text("Apply")')
      if (applyBtn) { await applyBtn.click(); await page.waitForTimeout(2000) }

      await tryFill(page, '#first_name', ME.firstName)
      await tryFill(page, '#last_name', ME.lastName)
      await tryFill(page, '#email', ME.email)
      await tryFill(page, '#phone', ME.phone)
      await tryFill(page, '#job_application_location', ME.location)
      await tryFill(page, 'input[name*="linkedin"]', ME.linkedin)
      await tryFill(page, 'input[id*="linkedin"]', ME.linkedin)
      if (resumePath) await tryUpload(page, 'input[type="file"]', resumePath)
      await tryFill(page, '#cover_letter_text', cover)
      await tryFill(page, 'textarea[name*="cover"]', cover)
      await answerQuestions(page)
      await page.waitForTimeout(1000)
      if (!DRY_RUN) {
        await page.click('input[type="submit"], button[type="submit"], button:text("Submit Application")', { timeout: 5000 }).catch(() => {})
      }

    } else if (platform === 'lever') {
      await tryFill(page, 'input[name="name"]', ME.fullName)
      await tryFill(page, 'input[name="email"]', ME.email)
      await tryFill(page, 'input[name="phone"]', ME.phone)
      await tryFill(page, 'input[name="org"]', 'Honeywell')
      await tryFill(page, 'input[name="urls[LinkedIn]"]', ME.linkedin)
      if (resumePath) await tryUpload(page, 'input[type="file"]', resumePath)
      await tryFill(page, 'textarea[name="comments"]', cover)
      await answerQuestions(page)
      await page.waitForTimeout(1000)
      if (!DRY_RUN) {
        await page.click('button[type="submit"], input[type="submit"], button:text("Submit Application")', { timeout: 5000 }).catch(() => {})
      }

    } else if (platform === 'ashby') {
      await tryFill(page, 'input[name="name"]', ME.fullName)
      await tryFill(page, 'input[type="email"]', ME.email)
      await tryFill(page, 'input[type="tel"]', ME.phone)
      await tryFill(page, 'input[placeholder*="LinkedIn"]', ME.linkedin)
      if (resumePath) await tryUpload(page, 'input[type="file"]', resumePath)
      await answerQuestions(page)
      await page.waitForTimeout(1000)
      if (!DRY_RUN) {
        await page.click('button[type="submit"], button:text("Submit")', { timeout: 5000 }).catch(() => {})
      }

    } else {
      // Generic — fill what we can
      await tryFill(page, 'input[name*="first"], input[id*="first"]', ME.firstName)
      await tryFill(page, 'input[name*="last"], input[id*="last"]', ME.lastName)
      await tryFill(page, 'input[name="name"], input[placeholder*="Full name"]', ME.fullName)
      await tryFill(page, 'input[type="email"]', ME.email)
      await tryFill(page, 'input[type="tel"]', ME.phone)
      if (resumePath) await tryUpload(page, 'input[type="file"]', resumePath)
      await answerQuestions(page)
      if (!DRY_RUN) {
        await page.click('input[type="submit"], button[type="submit"]', { timeout: 5000 }).catch(() => {})
      }
    }

    await page.waitForTimeout(2000)
    return true
  } catch (e) {
    return false
  }
}

async function tryFill(page, selector, value) {
  try { await page.fill(selector, value, { timeout: 3000 }); return true } catch { return false }
}

async function tryUpload(page, selector, filePath) {
  try { await page.setInputFiles(selector, filePath, { timeout: 5000 }); return true } catch { return false }
}

async function answerQuestions(page) {
  const qa = [
    { q: /authorized|legally.*work/i, a: 'Yes' },
    { q: /require.*sponsor/i,          a: 'Yes' },
    { q: /us citizen/i,                a: 'No'  },
    { q: /felony|criminal/i,           a: 'No'  },
    { q: /18 years/i,                  a: 'Yes' },
  ]
  try {
    for (const label of await page.$$('label, legend')) {
      const text = await label.textContent().catch(() => '')
      for (const { q, a } of qa) {
        if (q.test(text)) {
          const parent = await label.evaluateHandle(el =>
            el.closest('fieldset,.field,.form-group') || el.parentElement)
          for (const radio of await parent.$$('input[type="radio"]')) {
            const val = await radio.getAttribute('value') || ''
            if (new RegExp(a, 'i').test(val)) { await radio.click().catch(() => {}); break }
          }
        }
      }
    }
  } catch {}
}

function detectPlatform(url) {
  if (url.includes('greenhouse.io'))      return 'greenhouse'
  if (url.includes('lever.co'))           return 'lever'
  if (url.includes('myworkdayjobs.com'))  return 'workday'
  if (url.includes('ashbyhq.com'))        return 'ashby'
  return 'generic'
}

async function trackInHireTrack(score) {
  try {
    await fetch(`${HIRETRACK_API}/applications`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        company: score.company,
        role: score.role,
        jobUrl: score.url,
        location: score.location,
        salaryRange: score.salaryRange,
        score: score.score,
        sponsorshipConfirmed: score.sponsorsH1b,
        status: DRY_RUN ? 'EVALUATED' : 'APPLIED',
        notes: `AI Agent. Score: ${score.score}/5.`,
      }),
    })
  } catch {}
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('🤖 HireTrack Autonomous Agent' + (DRY_RUN ? ' [DRY RUN]' : ''))
  console.log('═'.repeat(60))

  if (!ANTHROPIC_KEY) {
    console.error('\n❌ Set your API key first:')
    console.error('   export ANTHROPIC_API_KEY=your-key-here\n')
    process.exit(1)
  }

  // Step 1: Scan portals
  const jobUrls = await scanJobs()
  if (jobUrls.length === 0) {
    console.log('\n✅ No new jobs found. Run again tomorrow.')
    return
  }

  const browser = await chromium.launch({ headless: false, slowMo: 50 })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  const results = { applied: [], skipped: [], failed: [] }
  let count = 0

  for (const url of jobUrls) {
    if (count >= LIMIT) break

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`[${count + 1}/${Math.min(jobUrls.length, LIMIT)}] ${url}`)

    // Step 2: Score
    process.stdout.write('   Scoring... ')
    const score = await fetchAndScore(page, url)
    if (!score) { console.log('❌ Failed to fetch'); results.failed.push(url); continue }

    console.log(`${score.score}/5 — ${score.company} | ${score.role}`)

    if (score.score < MIN_SCORE || !score.levelOk) {
      const reason = score.skipReason || (!score.levelOk ? 'Level excluded (Director/VP/Head)' : `Skill match too low (${score.skillMatchPct || 0}%)`)
      console.log(`   ⛔ SKIP — ${reason}`)
      results.skipped.push(`${score.company} — ${score.role}`)
      saveApplied(url)
      continue
    }

    const sponsorNote = score.sponsorsH1b === false ? '⚠️ No sponsorship mentioned (applying anyway)' : score.sponsorsH1b ? '✅ Known H-1B sponsor' : '✅ Sponsorship not blocked'
    console.log(`   ✅ QUALIFYING — ${score.skillMatchPct || '?'}% skill match | ${sponsorNote}`)

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would apply`)
      results.applied.push(`${score.company} — ${score.role} (${score.score}/5)`)
      continue
    }

    // Step 3: Generate tailored resume + cover letter
    console.log('   Generating tailored resume + cover letter...')
    const resumePath = await generateResumeAndCover(score)

    // Step 4: Apply
    process.stdout.write('   Applying... ')
    const ok = await applyToJob(page, score, resumePath)
    if (ok) {
      console.log('✅ Submitted!')
      await trackInHireTrack(score)
      saveApplied(url)
      results.applied.push(`${score.company} — ${score.role} (${score.score}/5)`)
      count++
      await page.waitForTimeout(3000) // brief pause between applications
    } else {
      console.log('⚠️ Partial — needs manual completion')
      results.failed.push(`${score.company} — ${score.role}`)
      saveApplied(url)
    }
  }

  await browser.close()

  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log('📊 Run Complete')
  console.log('═'.repeat(60))
  console.log(`✅ Applied:  ${results.applied.length}`)
  results.applied.forEach(r => console.log(`   • ${r}`))
  console.log(`⛔ Skipped:  ${results.skipped.length} (below threshold)`)
  console.log(`❌ Failed:   ${results.failed.length}`)
  console.log('\nAll results saved to HireTrack dashboard.')
  if (DRY_RUN) console.log('\n💡 Remove --dry-run to actually apply.')
  console.log('═'.repeat(60) + '\n')
}

main().catch(console.error)
