"use client";

/*
 * Placeholder: subscribes the admin panel to Pusher's private-admin channel and, on each ping, dispatches
 * window events the pages listen to:
 *   "admin:badges"            → the sidebar re-reads its counts
 *   "admin:order.created"     → orders list / dashboard refresh
 *   "admin:chat.message"      → chat inbox refresh
 *   "admin:contact.created"   → messages list refresh
 * (detail = the ping's data). It also shows a small toast for new orders and messages.
 */
export function AdminRealtime() {
  return null;
}
