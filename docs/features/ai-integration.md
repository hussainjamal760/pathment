# AI Integration (Bring-Your-Own Key)

**What it is:** the platform's AI features (progress summaries, roadmap generation, adaptive
recommendations, mentor-match scoring) run through **configurable provider keys** — an admin
sets org-wide keys, a mentor can add a personal key, and each feature resolves the right key
(personal → org → env).

**Why it exists:** AI cost and choice should belong to the org/mentor, not be hardwired.
BYO keys make the AI features flexible, attributable, and not dependent on a single global key.

## Data model
`AIConnection` (provider `groq|openai|anthropic|gemini|custom`, label, model, baseUrl,
`keyEncrypted` (AES-256-GCM), `keyMasked`, `status connected|error|untested`, `ownerId`
(null = org-wide, set = a mentor's personal key)). Feature→connection routing is stored per
owner. See [DATABASE.md §12](../DATABASE.md). Migration 035/036.

## Backend
- **`/api/ai-connections`** (admin + mentor): `GET /`, `POST /`, `DELETE /:id`, `POST /:id/test` (actually probes the provider to verify the key), `PUT /routing` (map features → a connection). Scope is derived: admins manage org keys, mentors manage personal keys.
- **Resolution:** `aiConnectionService.resolveActiveConfig(feature, userId)` → personal routing for that feature → org routing → any connected org key → env fallback.
- **Primitive:** `groqService` — `generateText({ feature, userId, … })` and `generateRoadmap` / `generateAdaptiveRecommendations` / `generateMatchingScore` / `batchGenerateMatchingScores`, all of which resolve a BYO key (feature + userId) and **fall back gracefully** to a heuristic/empty result if no key is available.
- **Features using AI:** cohort/progress summaries (mentor's key, feature `summary`), mentor-match scoring (`matching`, org), roadmap generation (`roadmap`), adaptive recommendations (`adaptive`). The mentor "Reports" narrative also uses the text primitive.

## Frontend
- **Admin / Mentor:** Settings → **AI Connections** tab (`components/settings/AIConnectionsTab.tsx`) — add a key, **Test** it (live probe with success/fail toast), delete, and route features to connections. Admins manage org-wide; mentors manage personal. (Mentees don't run AI features, so no key tab for them.)

## Role flows
- **Admin:** adds org-wide provider keys, tests them, routes org features (e.g. matching) to a connection.
- **Mentor:** adds a personal key and routes their features (e.g. summaries) to it; their AI actions then bill their key.
- **Mentee:** benefits from AI output (summaries, recommendations) but doesn't manage keys.

## Rules & edge cases
- Keys are encrypted at rest (AES-256-GCM); only a masked form is ever returned to the UI.
- Resolution order is personal → org → env; if nothing resolves, AI features degrade gracefully (no hard failure).
- The **Test** button calls the provider's `/models` endpoint to verify the key and updates `status`.

## Related
[Analytics & Insights](./analytics-and-insights.md) (summaries/reports) · [Matching & Placement](./matching-and-placement.md) · [Roadmaps & Tasks](./roadmaps-and-tasks.md) · [Profile & Settings](./profile-skills-settings.md)
