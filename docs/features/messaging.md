# Messaging

**What it is:** real-time 1:1 chat over Socket.IO with WhatsApp-style **delivery/read ticks**
and emoji **reactions**.

**Why it exists:** mentors and mentees need to talk in-context, with the same legibility
people expect from a modern messenger (did it send? was it seen?).

## Data model
`Conversation` (type `direct|system`, lastMessage, related task/enrollment). `ConversationParticipant`
(lastReadMessageId, lastReadAt). `Message` (senderId, recipientId, threadId, messageText,
`isRead`, `readAt`, **`deliveredAt`**). `MessageAttachment`, `MessageReaction`
(one emoji per user per message). See [DATABASE.md §8](../DATABASE.md). Migration 042.

## Backend
- **`/api/messaging`:** `users/search`, `conversations` (+ `direct`, `:id/messages`, `:id/read`), `POST /messages`, `POST /messages/:id/reactions` (toggle), notification endpoints.
- **Real-time** (`socket/index.js`): rooms `user:{id}` + `conversation:{id}`; events `message:new`, `message:delivered`, `conversation:read`, `message:reaction`. On send, `deliveredAt` is set **only if the recipient has a live socket**; otherwise it's set when they next connect (`markDelivered`) → ticks flip live.
- `messagingService` (listMessages includes reactions; sendMessage sets deliveredAt; markDelivered; toggleReaction).

## Frontend
`components/shared/messages/MessageCenter.tsx` (used by `/{role}/messages`). Connects its own
socket, listens for new/delivered/read/reaction events, renders:
- **Ticks (own messages):** single ✓ = sent (recipient offline) · double ✓✓ = delivered (recipient online) · double ✓✓ blue = seen. Hover shows Sent/Delivered/Seen.
- **Reactions:** a floating picker pops above the bubble on hover (👍❤️😂🎉🙏, scale animations); reaction chips sit on the bubble's bottom edge, your reaction highlighted, count shown when >1; click toggles.

## Role flows
- **All roles** use the same Message Center. A mentee can only message their mentor(s) + clan members (recipient allow-list); mentors/admins are less restricted.
- Open a conversation → messages mark read → the sender's ticks flip blue in real time.

## Rules & edge cases
- **Delivered = the recipient's app is connected** (even a background tab), not "actively looking." App fully closed/logged out → stays single ✓ until they reconnect.
- Read receipts are always on; reactions are one-per-user (re-react replaces, same emoji removes).
- Conversations are direct (1:1); a `system` type exists for system messages.

## Related
[Notifications & Email](./notifications-and-email.md) (a new message also creates a notification) · [Community](./community.md)
