# Knowledge: Library & Mentor Spec

Two related-but-distinct knowledge surfaces. **Mentor Spec** = the single handbook (the
rules); **Library** = a growing shelf of resources (the toolbox).

## Mentor Spec — the handbook
**What it is:** one canonical, admin-authored document with fixed sections — intro,
**principles**, **responsibilities**, **code of conduct**, **time commitment** (SLAs), and
**FAQs**. Every mentor reads the same handbook.

**Why it exists:** consistency — "how we mentor here," the bar everyone is held to.

- **Data:** one `OrgPolicy` row (category `mentor_spec`, JSON body). Ships pre-seeded with sensible defaults until edited.
- **Backend (`/api/mentor-spec`):** `GET /` (any authed user reads), `PUT /` (`system.settings` — author). `mentorSpecService`.
- **Frontend:** admin authors at `/admin/mentor-spec`; mentors read at `/mentor/spec`.

## Library — the resource shelf
**What it is:** an open-ended, growing collection of resource items, each a titled link with
a category (**guidance / reading / template / policy**), summary, author, and read time.

**Why it exists:** supplementary resources + reusable templates (feedback template, 1:1
agenda) so mentors aren't reinventing the wheel.

- **Data:** `Document` (title, category, summary, author, url, readMins, pinned). See [DATABASE.md §12](../DATABASE.md).
- **Backend (`/api/library`):** `GET /` (any authed user reads), `POST /` + `PATCH /:id/pin` + `DELETE /:id` (mentor + admin curate).
- **Frontend:** `/mentor/library`.

## Role flows
- **Admin:** authors the Mentor Spec (the canonical handbook) and curates Library items.
- **Mentor:** reads the Spec to learn the standards; adds/pins Library resources; uses templates.
- **Mentee:** not a primary audience (these are mentor-facing).

## Spec vs Library — don't confuse them
| | Mentor Spec | Library |
| --- | --- | --- |
| Shape | **One** structured document | **Many** separate items |
| Job | The rules & principles everyone follows | Supplementary resources & templates |
| Analogy | Employee handbook | Bookmarks / resource folder |

## Related
[Authorization](./authorization-rbac.md) (`system.settings` to author the Spec) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md)
