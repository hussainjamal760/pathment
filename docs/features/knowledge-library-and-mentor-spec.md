# Knowledge: Library & Mentor Spec

Two related-but-distinct knowledge surfaces. **Mentor Spec** = the single handbook (the
rules); **Library** = a growing shelf of resources (the toolbox).

## Mentor Spec - the handbook
**What it is:** one canonical, admin-authored document with fixed sections - intro,
**principles**, **responsibilities**, **code of conduct**, **time commitment** (SLAs), and
**FAQs**. Every mentor reads the same handbook.

**Why it exists:** consistency - "how we mentor here," the bar everyone is held to.

- **Data:** one `OrgPolicy` row (category `mentor_spec`, JSON body). Ships pre-seeded with sensible defaults until edited.
- **Backend (`/api/mentor-spec`):** `GET /` (any authed user reads), `PUT /` (`system.settings` - author). `mentorSpecService`.
- **Frontend:** admin authors at `/admin/mentor-spec`; mentors read at `/mentor/spec`.

## Library - the resource shelf
**What it is:** an open-ended, growing collection of resource items, each with a category
(**guidance / reading / template / policy**), summary, author, read time, and **either a
written rich-text article, an external link, or both**.

**Why it exists:** supplementary resources + reusable templates (feedback template, 1:1
agenda) so mentors aren't reinventing the wheel - and a place to actually *write* guidance,
not just bookmark links.

- **Data:** `Document` (title, category, summary, **`content`** rich-text HTML, author, url, readMins, pinned). Migration 046 added `content`. See [DATABASE.md §12](../DATABASE.md).
- **Backend (`/api/library`):** `GET /` (metadata list) + `GET /:id` (full article) - any authed user reads; `POST /`, `PATCH /:id` (edit), `PATCH /:id/pin`, `DELETE /:id` - mentor + admin curate. `libraryService` validates that an item has content **or** a link.
- **Frontend:** one shared `components/shared/library/LibraryView.tsx` rendered at **`/admin/library`, `/mentor/library` (curate)** and **`/mentee/library` (read-only)** via a `canCurate` prop. Card grid (category icon + Article/Link badge, pinned section, search + filter), a **reader drawer** that renders the article (`.rich-content`) with an "Open original" link, and (curators only) an **editor drawer** with the shared **RichTextEditor** (TipTap). In nav for all three roles.

## Role flows
- **Admin:** authors the Mentor Spec (the canonical handbook); curates Library items (write/edit/pin/delete).
- **Mentor:** reads the Spec to learn the standards; adds/pins/edits Library resources; uses templates.
- **Mentee:** **reads the Library** (read-only - browse articles, open links); the Mentor Spec stays mentor-facing.

## Spec vs Library - don't confuse them
| | Mentor Spec | Library |
| --- | --- | --- |
| Shape | **One** structured document | **Many** separate items |
| Job | The rules & principles everyone follows | Supplementary resources & templates |
| Analogy | Employee handbook | Bookmarks / resource folder |

## Related
[Authorization](./authorization-rbac.md) (`system.settings` to author the Spec) · [Programs, Cohorts & Clans](./programs-cohorts-clans.md)
