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

/** INV-1001 for an order's first invoice, then INV-1001-2, INV-1001-3 (same as the vape store). */
export const invoiceNo = (orderNumber: number, version: number) => (version <= 1 ? `INV-${1000 + orderNumber}` : `INV-${1000 + orderNumber}-${version}`);

/** The invoice card shown in the chat (built on the server from the order). */
export interface InvoiceDTO {
  /** Only in admin responses (links to /admin/orders/<id>). */
  orderId?: string;
  number: string; // "#1001"
  /** "INV-1001", "INV-1001-2"… */
  invoiceNumber: string;
  version: number;
  /** False for an invoice an updated one has replaced: show a REPLACED badge, no buttons. */
  latest: boolean;
  /** The order's secret token, for the /invoice/<token> link. Only ever sent to the conversation's owner and the admin. */
  token: string;
  status: string;
  createdAt: string;
  lines: { title: string; detail: string | null; quantity: number; total: string }[];
  subtotal: string;
  discount: string | null; // "−$11.46 (Cryptocurrency)" or null
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
  /** A picture or PDF sent with the message. `url` is already the right one for the viewer (shopper or admin). */
  file?: ChatFileDTO | null;
}

export interface ChatFileDTO {
  id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: "image" | "file";
}

/* Files in the chat. Pictures are made small in the browser (longest side CHAT_IMAGE_MAX_PX, WebP or JPEG) before
   upload, so the server only checks and stores them (no image processing on Vercel's CPU). */
export const CHAT_IMAGE_MIMES = ["image/webp", "image/jpeg", "image/png"] as const;
export const CHAT_IMAGE_MAX_PX = 1600;
export const CHAT_IMAGE_MAX_BYTES = 1_500_000;
export const CHAT_PDF_MAX_BYTES = 3_000_000;

export function chatFileKind(mime: string): "image" | "file" | null {
  if ((CHAT_IMAGE_MIMES as readonly string[]).includes(mime)) return "image";
  if (mime === "application/pdf") return "file";
  return null;
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
  /** The text above an updated invoice (the question follows it again). */
  updated: "Here's your updated invoice.",
} as const;

/** The card under "Thanks for confirming…" that asks the shopper to turn on notifications (vape store copy). */
export const NOTIFY_COPY = {
  title: "Don't miss your payment details",
  body: "We'll tell you the moment your payment details arrive.",
  button: "Turn on notifications",
  done: "Notifications are on. We'll tell you when your payment details arrive.",
  blocked: "Notifications are blocked for this site. Allow them in your browser settings, or keep this page open.",
  iphone: "On iPhone, add this site to your Home Screen first (Share → Add to Home Screen), then open it from there.",
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
