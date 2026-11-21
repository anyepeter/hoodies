// Live chat: limits and shapes shared by the API routes and the browser (no server-only imports here).

export const MESSAGE_MAX = 2000;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;

/** The one event on a conversation's channel: "something changed in this thread, fetch it". */
export const CHAT_EVENT = "message";

/** Conversation ids are Prisma cuids: lowercase letters and digits. Anything else is refused. */
export const CONVERSATION_ID = /^[a-z0-9]{20,40}$/;

export type ChatSender = "VISITOR" | "ADMIN" | "SYSTEM";
export type ChatStatus = "OPEN" | "CLOSED";

export interface ChatMessageDTO {
  id: string;
  sender: ChatSender;
  body: string;
  createdAt: string;
}

/** What the visitor's own browser is told about their conversation. */
export interface VisitorConversationDTO {
  id: string;
  status: ChatStatus;
  unread: number;
}

/** "Hi there   how\nare you" → "Hi there how are you", cut to `max` characters for previews. */
export function previewOf(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
