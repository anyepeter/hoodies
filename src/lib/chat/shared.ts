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

/** TEXT = a normal message; INVOICE = an order's invoice card (+ "is everything correct?"); PAYMENT = payment details for an order. */
export type MessageKind = "TEXT" | "INVOICE" | "PAYMENT";
export type InvoiceAnswer = "confirmed" | "wrong";

/** The invoice card shown in the chat (built on the server from the order). */
export interface InvoiceDTO {
  /** Only in admin responses (links to /admin/orders/<id>). */
  orderId?: string;
  number: string; // "#1001"
  /** The order's secret token, for the /invoice/<token> link. Only ever sent to the conversation's owner and the admin. */
  token: string;
  status: string;
  createdAt: string;
  lines: { title: string; detail: string | null; quantity: number; total: string }[];
  subtotal: string;
  discount: string | null; // "-$11.46 (Cryptocurrency, 10% off)" or null
  shipping: string; // "Free"
  total: string;
  paymentMethod: string;
  paymentKey: string | null;
  answer: InvoiceAnswer | null;
}

export interface ChatMessageDTO {
  id: string;
  sender: ChatSender;
  body: string;
  createdAt: string;
  kind: MessageKind;
  /** For INVOICE messages (and PAYMENT, so the card can say which order). */
  invoice?: InvoiceDTO | null;
}

/** The words around an invoice in the chat (same flow as the owner's Muh-med store). */
export const INVOICE_COPY = {
  question: "Please check your invoice. Are your items, delivery address and contact details all correct?",
  yesButton: "Yes, all correct",
  noButton: "Something's wrong",
  yesMessage: "Yes, all correct",
  noMessage: "Something's wrong with my invoice",
  yesReply: "Thanks for confirming! We'll send your payment details here within 5 minutes.",
  noReply: "No problem. Tell us what needs changing and we'll send you an updated invoice.",
} as const;

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
