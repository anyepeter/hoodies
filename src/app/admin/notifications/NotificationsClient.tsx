"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, StatusPill, btn } from "@/components/admin/ui";
import { chimeEnabled, playChime, setChimeEnabled } from "@/components/admin/realtime/chime";
import { promptInstall, useInstallState } from "@/components/admin/realtime/pwa";

/*
 * Three things, each explained on the page:
 *   1. Notifications on this device: a web push subscription (service worker /admin-sw.js, scope /admin/),
 *      saved on the server so new orders and messages reach it even with the admin closed.
 *   2. The list of devices that get them (remove any), and a test button.
 *   3. A sound in open admin tabs, and installing the admin as an app.
 */

type Device = { id: string; endpoint: string; label: string | null; failures: number; lastUsedAt: string | null; createdAt: string };
type Support = "checking" | "ok" | "ios-install-first" | "unsupported";
type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const BLOCKED =
  "Notifications are blocked for this site. Allow them in the browser's site settings (the icon left of the address), then reload this page.";

async function api<T>(url: string, init?: { method: string; body?: unknown }): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
    if (!res.ok || !json?.ok) return { ok: false, status: res.status, error: json?.error ?? "Something went wrong. Please try again." };
    return { ok: true, data: json };
  } catch {
    return { ok: false, status: 0, error: NETWORK };
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

/** The admin's service worker registration, once it's active (push needs an active worker). */
async function adminRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration("/admin/")) ?? (await navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin/" }));
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("The service worker took too long to start.")), 15_000);
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") {
          window.clearTimeout(t);
          resolve();
        } else if (worker.state === "redundant") {
          window.clearTimeout(t);
          reject(new Error("The service worker failed to start."));
        }
      });
    });
  }
  return reg;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never");

export function NotificationsClient({ vapidKey }: { vapidKey: string }) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // "on" | "off" | "test" | device id
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [chime, setChime] = useState(false);
  const install = useInstallState();

  const loadDevices = useCallback(async () => {
    const r = await api<{ configured: boolean; devices: Device[] }>("/api/admin/push");
    if (!r.ok) return setListError(r.error);
    setListError(null);
    setDevices(r.data.devices);
    setConfigured(r.data.configured && Boolean(vapidKey));
  }, [vapidKey]);

  // What this browser can do, and whether it's already subscribed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setChime(chimeEnabled());
      const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!ok) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        if (!cancelled) setSupport(ios && !standalone ? "ios-install-first" : "unsupported");
        return;
      }
      setPermission(Notification.permission);
      try {
        const reg = await navigator.serviceWorker.getRegistration("/admin/");
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelled) setEndpoint(sub?.endpoint ?? null);
      } catch {
        /* no registration yet */
      }
      if (!cancelled) setSupport("ok");
    })();
    const t = window.setTimeout(() => void loadDevices(), 0);
    return () => {
      window.clearTimeout(t);
      cancelled = true;
    };
  }, [loadDevices]);

  const subscribedHere = Boolean(endpoint && devices?.some((d) => d.endpoint === endpoint));

  const turnOn = async () => {
    // Ask first, straight from the tap: Safari only shows the prompt when it's the direct result of one.
    const asked = Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    setBusy("on");
    setError(null);
    setNotice(null);
    try {
      const perm = await asked;
      setPermission(perm);
      if (perm !== "granted") {
        setError(perm === "denied" ? BLOCKED : "Notifications weren't allowed. Press the button again and choose Allow.");
        return;
      }
      const key = keyBytes(vapidKey);
      const reg = await adminRegistration();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, key)) {
        await sub.unsubscribe(); // made with an old server key: it would never receive anything
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const json = sub.toJSON();
      const r = await api("/api/admin/push", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEndpoint(sub.endpoint);
      setNotice("Notifications are on for this device. Send a test to check.");
      await loadDevices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        /push service|registration failed|AbortError/i.test(msg)
          ? "This browser couldn't reach its push service. Try again, or use another browser (Chrome, Edge, Safari, Firefox)."
          : msg || "Couldn't turn notifications on. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    if (!endpoint) return;
    setBusy("off");
    setError(null);
    setNotice(null);
    const r = await api("/api/admin/push", { method: "DELETE", body: { endpoint } });
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/admin/");
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
    } catch {
      /* the server copy is gone, which is what matters */
    }
    setEndpoint(null);
    setBusy(null);
    setNotice("Notifications are off for this device.");
    await loadDevices();
  };

  const remove = async (d: Device) => {
    if (d.endpoint === endpoint) {
      setConfirmId(null);
      return turnOff();
    }
    setBusy(d.id);
    setError(null);
    setNotice(null);
    const r = await api(`/api/admin/push/${d.id}`, { method: "DELETE" });
    setBusy(null);
    setConfirmId(null);
    if (!r.ok && r.status !== 404) return setError(r.error);
    setNotice(`${d.label ?? "That device"} won't get notifications any more.`);
    await loadDevices();
  };

  const test = async () => {
    setBusy("test");
    setError(null);
    setNotice(null);
    const r = await api<{ sent: number; failed: number }>("/api/admin/push/test", { method: "POST" });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    const { sent, failed } = r.data;
    if (sent === 0 && failed === 0) setNotice("There are no devices to send to yet. Turn notifications on first.");
    else setNotice(`Sent to ${sent} device${sent === 1 ? "" : "s"}${failed ? `; ${failed} couldn't be reached (see the list below)` : ""}. It should arrive within a few seconds.`);
    await loadDevices();
  };

  const install_ = async () => {
    setError(null);
    const accepted = await promptInstall().catch(() => false);
    if (accepted) setNotice("Installing… The admin app will appear on your home screen or in your apps.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(error || notice) && (
        <div className="lg:col-span-2" aria-live="polite">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-brand" role="alert">
              {error}
            </p>
          )}
          {notice && !error && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
        </div>
      )}

      {/* 1. This device */}
      <Card title="This device">
        <div className="space-y-4 p-5 text-sm">
          <p className="text-zinc-600">
            Turn this on to get a notification on this phone or computer for every <b className="text-ink">new order</b>, <b className="text-ink">chat message</b> and{" "}
            <b className="text-ink">contact message</b>, even when the admin isn&apos;t open. Tapping one opens the right page.
          </p>

          {support === "checking" ? (
            <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
          ) : support === "ios-install-first" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-amber-900">
              On iPhone and iPad, notifications only work in the installed app. Install it (see <b>Install the admin app</b>), open it from your Home Screen, and turn
              notifications on there.
            </p>
          ) : support === "unsupported" ? (
            <p className="rounded-lg bg-zinc-100 px-3 py-2.5 text-zinc-700">This browser can&apos;t show notifications from websites. Try Chrome, Edge, Firefox or Safari.</p>
          ) : !configured ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-amber-900">Notifications aren&apos;t set up on the server yet (the VAPID keys are missing), so there&apos;s nothing to turn on.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Permission</dt>
                  <dd className="mt-1 font-semibold text-ink">{permission === "granted" ? "Allowed" : permission === "denied" ? "Blocked" : "Not asked yet"}</dd>
                </div>
                <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notifications</dt>
                  <dd className={`mt-1 font-semibold ${subscribedHere ? "text-emerald-700" : "text-ink"}`}>{devices === null ? "…" : subscribedHere ? "On" : "Off"}</dd>
                </div>
              </dl>
              {permission === "denied" && !error && <p className="text-brand">{BLOCKED}</p>}
              <div className="flex flex-wrap gap-2">
                {subscribedHere ? (
                  <button type="button" onClick={() => void turnOff()} disabled={busy !== null} className={btn.secondary}>
                    {busy === "off" ? "Turning off…" : "Turn off on this device"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void turnOn()} disabled={busy !== null || permission === "denied"} className={btn.primary}>
                    {busy === "on" ? "Turning on…" : "Turn on notifications on this device"}
                  </button>
                )}
                <button type="button" onClick={() => void test()} disabled={busy !== null || !devices?.length} className={btn.secondary}>
                  {busy === "test" ? "Sending…" : "Send a test notification"}
                </button>
              </div>
              <p className="text-xs text-zinc-500">The test goes to every device in the list. Nothing arriving? Check the phone isn&apos;t on Do Not Disturb.</p>
            </>
          )}
        </div>
      </Card>

      {/* 2. Devices */}
      <Card title="Devices that get notifications" actions={devices && <span className="text-xs text-zinc-500">{devices.length}</span>}>
        <div className="p-2">
          {listError && (
            <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-brand" role="alert">
              {listError}{" "}
              <button type="button" onClick={() => void loadDevices()} className="font-semibold underline">
                Try again
              </button>
            </p>
          )}
          {devices === null && !listError && (
            <div className="space-y-2 p-3">
              <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
              <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
            </div>
          )}
          {devices?.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">No devices yet. Turn notifications on from the phone or computer you want them on.</p>}
          {devices && devices.length > 0 && (
            <ul className="divide-y divide-zinc-100">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {d.label ?? "Unknown device"}
                      {d.endpoint === endpoint && <StatusPill status="ACTIVE">this device</StatusPill>}
                      {d.failures > 0 && <StatusPill status="REFUNDED">{`${d.failures} failed`}</StatusPill>}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Added {when(d.createdAt)} · Last notified {when(d.lastUsedAt)}
                    </p>
                  </div>
                  {confirmId === d.id ? (
                    <span className="flex gap-1.5">
                      <button type="button" onClick={() => setConfirmId(null)} className={`${btn.secondary} h-9 px-3`}>
                        Keep
                      </button>
                      <button type="button" onClick={() => void remove(d)} disabled={busy !== null} className={`${btn.danger} h-9 px-3`}>
                        {busy === d.id || (busy === "off" && d.endpoint === endpoint) ? "Removing…" : "Remove"}
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(d.id)} disabled={busy !== null} className={`${btn.ghost} text-red-700 hover:bg-red-50 hover:text-red-800`}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* 3a. Sound */}
      <Card title="Sound in the admin">
        <div className="space-y-4 p-5 text-sm">
          <p className="text-zinc-600">Plays a short chime in any open admin tab when a new order or message comes in. Only on this device.</p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={chime}
              onChange={(e) => {
                setChime(e.target.checked);
                setChimeEnabled(e.target.checked);
                if (e.target.checked) playChime(true);
              }}
              className="peer sr-only"
            />
            <span className="relative h-6 w-11 shrink-0 rounded-full bg-zinc-300 transition peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-ink/30 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" aria-hidden />
            <span className="font-medium text-ink">{chime ? "Sound on" : "Sound off"}</span>
          </label>
          <button type="button" onClick={() => playChime(true)} className={btn.secondary}>
            Play the sound
          </button>
        </div>
      </Card>

      {/* 3b. Install */}
      <Card title="Install the admin app">
        <div className="space-y-4 p-5 text-sm">
          <p className="text-zinc-600">
            Puts the admin on your home screen or desktop like an app: it opens full-screen, straight to the dashboard, signed in. On iPhone it&apos;s also what makes
            notifications possible.
          </p>
          {!install.ready ? (
            <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
          ) : install.standalone || install.installed ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2.5 font-semibold text-emerald-800">
              Installed ✓ {install.standalone ? "You're using the admin app right now." : "Open it from your home screen or app list."}
            </p>
          ) : install.canPrompt ? (
            <button type="button" onClick={() => void install_()} className={btn.primary}>
              Install the admin app
            </button>
          ) : install.platform === "ios" ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-zinc-700">
              <li>
                Open this page in <b>Safari</b>.
              </li>
              <li>
                Tap the <b>Share</b> button (the square with an arrow pointing up).
              </li>
              <li>
                Choose <b>Add to Home Screen</b>, then <b>Add</b>.
              </li>
              <li>Open AKZ Admin from your Home Screen and sign in.</li>
            </ol>
          ) : install.platform === "android" ? (
            <p className="text-zinc-700">
              Open the browser menu (<b>⋮</b>) and tap <b>Install app</b> or <b>Add to Home screen</b>.
            </p>
          ) : (
            <p className="text-zinc-700">
              In Chrome or Edge, click the install icon at the right end of the address bar, or open the browser menu and choose <b>Install</b>. (Safari on Mac:{" "}
              <b>File → Add to Dock</b>.)
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
