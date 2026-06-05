# Community

**What it is:** a **scoped social feed** — posts, comments, reactions, kudos, and Q&A —
visible within the space you belong to: your **clan**, your **cohort**, your **program**, or
a **global** lounge. Plus moderation.

**Why it exists:** mentorship is social. Peers learn from each other, celebrate wins, ask
questions, and stay engaged — scoped so conversations are relevant and private to the right group.

## Data model
`CommunityPost` (authorId, toId? for kudos, type `kudos|win|question|discussion|resource|meme|standup`,
`scopeType clan|cohort|program|global`, scopeId, body, tags, attachments, mentionedUserIds,
resolved + acceptedCommentId for Q&A, pinned). `CommunityComment` (threaded via parentId).
`CommunityReaction` (cheers/celebrate/helpful/insightful). `CommunityReport` (post/comment,
status open/reviewed/dismissed). See [DATABASE.md §12](../DATABASE.md). Migration 032.

## Backend
- **`/api/community`** (auth; per-space access enforced by `communitySpaceService` from the user's memberships): `GET /spaces` (which spaces you can see), `/members`, `/people`, `/leaderboard`, `GET /feed`, `POST /upload`, posts CRUD + `:id/pin` + `:id/react`, comments (`:id/comments`, `:id/accept` answer), `POST /reports`, and moderation `GET /reports` + `PATCH /reports/:id` (`community.moderate`).
- A member only ever reads/writes spaces they belong to (clan/cohort/program), plus the global lounge.

## Frontend
- **Mentor:** `/mentor/community`. **Mentee:** `/mentee/community`. **Admin:** `/admin/moderation` (review reports).

## Role flows
- **Mentee / Mentor:** pick a space (clan / cohort / program / global) → post a win, ask a question, share a resource, give **kudos** to someone, react to others. For questions, the asker (or a mentor) can **accept** an answer.
- **Moderator / Admin:** anyone can **report** a post/comment; users with `community.moderate` review the report queue and resolve/dismiss.

## Rules & edge cases
- Visibility is **membership-derived** — you can't see another clan's clan-space.
- Q&A posts track `resolved` + an accepted comment.
- Reporting is open to all; acting on reports needs `community.moderate` (super_admin, moderator, program_admin).

## Related
[Programs, Cohorts & Clans](./programs-cohorts-clans.md) (spaces) · [Gamification](./gamification.md) (kudos/engagement) · [Notifications & Email](./notifications-and-email.md) (mentions/replies/kudos — in-app)
