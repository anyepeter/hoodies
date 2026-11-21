"use client";

import { useSyncExternalStore } from "react";

/*
 * Installing the admin as an app. Chrome/Edge/Android fire `beforeinstallprompt` once they consider the page
 * installable; AdminRealtime (on every admin page) catches it early and keeps it here, so the Install button on
 * Admin → Notifications & app works even if the event fired on another page. iPhone/iPad have no such event:
 * there it's Share → Add to Home Screen, which the page explains.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type Platform = "ios" | "android" | "desktop";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Starts listening for the install events. Returns the cleanup. */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault(); // keep Chrome's own mini-bar away; the admin installs from our button
    deferred = e as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    installedNow = true;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** Shows the browser's install dialog. Resolves to true if the admin accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  if (outcome === "accepted") installedNow = true;
  emit();
  return outcome === "accepted";
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac with touch points is an iPad.
  const iPad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPad) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** True while running as the installed app (not in a browser tab). */
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type InstallState = { ready: boolean; canPrompt: boolean; installed: boolean; standalone: boolean; platform: Platform };
const SERVER: InstallState = { ready: false, canPrompt: false, installed: false, standalone: false, platform: "desktop" };
let snapshot: InstallState = SERVER;

function read(): InstallState {
  const next: InstallState = { ready: true, canPrompt: Boolean(deferred), installed: installedNow, standalone: isStandalone(), platform: detectPlatform() };
  const same = (Object.keys(next) as (keyof InstallState)[]).every((k) => next[k] === snapshot[k]);
  if (!same) snapshot = next;
  return snapshot;
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    read,
    () => SERVER,
  );
}
