# career-ops Java Backend

Spring Boot REST API powering career-ops — an AI-driven job search engine built for STEM OPT / H-1B candidates targeting Senior Java engineering roles in the US.

## What Makes This Different

| Feature | Santiago's career-ops (Node.js) | This backend (Java Spring Boot) |
|---------|------------------------------|-------------------------------|
| Language | Node.js / MJS | **Java 21 + Spring Boot 3** |
| Database | Markdown flat files | **JPA + H2 (dev) / PostgreSQL (prod)** |
| H-1B Sponsor check | ❌ Not available | **✅ DOL OFLC database (50+ records)** |
| Job level filter | Manual | **✅ Auto-classifier (Entry/Mid/Senior only)** |
| Visa score | ❌ Not in scoring | **✅ Visa dimension in job scoring engine** |
| Analytics | TSV tracker | **✅ REST API — response rates, interview rates, deadline alerts** |
| API docs | ❌ | **✅ Swagger UI at /swagger-ui.html** |
| Docker | ❌ | **✅ Dockerfile + docker-compose** |
| Tests | Node test-all.mjs | **✅ JUnit 5 + Spring Boot Test** |

## Quick Start

### Dev (H2 in-memory, no setup needed)
```bash
cd backend
mvn spring-boot:run
```
- API: http://localhost:8080
- Swagger UI: http://localhost:8080/swagger-ui.html
- H2 Console: http://localhost:8080/h2-console

### Prod (PostgreSQL via Docker)
```bash
cd backend
docker-compose up -d
```

## API Reference

### Applications (`/api/applications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/applications` | List all applications |
| POST | `/api/applications` | Add new application |
| PUT | `/api/applications/{id}` | Update application |
| PATCH | `/api/applications/{id}/status` | Update status only |
| GET | `/api/applications/analytics` | Pipeline analytics + deadline alerts |

### Job Scoring (`/api/jobs`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs/score` | Score a JD (auto-filters level + checks sponsorship) |
| GET | `/api/jobs/check-level?title=...` | Check if title is within allowed level |
| GET | `/api/jobs/top?minScore=4.0` | Get top-scored jobs |
| GET | `/api/jobs/sponsored` | Get jobs with confirmed H-1B sponsorship |

### H-1B Sponsors (`/api/sponsors`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sponsors/check?company=PayPal` | Check if company sponsors H-1B |
| GET | `/api/sponsors/search?keyword=tech` | Search sponsor database |
| GET | `/api/sponsors/state/GA` | Top sponsors in a state |
| GET | `/api/sponsors/top` | All HIGH-tier sponsors (50+/yr) |
| POST | `/api/sponsors/check-jd` | Scan JD text for sponsorship signals |

## Job Scoring Engine

The `POST /api/jobs/score` endpoint evaluates a job against your profile:

```json
{
  "jobUrl": "https://example.com/job/123",
  "company": "PayPal",
  "role": "Senior Java Software Engineer",
  "location": "Austin, TX",
  "salaryRange": "$130,000 - $193,600",
  "yearsRequired": 5,
  "jdText": "...full JD text...",
  "mentionsSponsor": null
}
```

Response includes:
- `globalScore` — 1.0 to 5.0
- `levelExcluded` — true if Lead/Manager/Director (auto-blocked)
- `sponsorsH1b` — true/false from DOL database
- `visaScore` — separate dimension (−1.0 if no sponsorship stated)
- `recommendation` — APPLY NOW / APPLY / CONSIDER / SKIP

## H-1B Sponsor Database

Pre-seeded with 50 companies from DOL OFLC FY2023 data:

```
Tier HIGH  (50+ approvals/yr): Amazon, Google, Microsoft, Cognizant, Infosys, TCS, Capital One, JPMorgan, PayPal, American Express...
Tier MEDIUM (10-49/yr): Twilio, Databricks, Snowflake, Confluent, Charles Schwab, CVS Health, Anthropic, OpenAI...
Tier LOW   (<10/yr): Perplexity AI, early-stage startups...
```

Full DOL dataset: https://www.dol.gov/agencies/eta/foreign-labor/performance

## Level Policy

Only **Entry / Mid / Senior** IC roles are scored. Any title containing:
`Lead, Tech Lead, Manager, Director, VP, Head of, Principal Engineer, Staff Engineer, Distinguished Engineer, Chief`
→ auto-scored **1.5/5 with SKIP recommendation**.

## Tech Stack

- **Java 21** + **Spring Boot 3.3**
- **Spring Data JPA** + H2 (dev) / PostgreSQL (prod)
- **SpringDoc OpenAPI** (Swagger UI)
- **Spring WebFlux** (reactive HTTP client for portal scanning)
- **OpenCSV** (H-1B data ingestion)
- **Lombok** + **JUnit 5**
- **Docker** + **docker-compose**
- **Maven**
