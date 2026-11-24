"use client";

import { useSyncExternalStore } from "react";

function noopSubscribe() {
  return () => {};
}
const getTtsSnapshot = () => typeof window !== "undefined" && "speechSynthesis" in window;
const getTtsServerSnapshot = () => false;

/** True once hydrated on a browser that supports SpeechSynthesis; false during SSR. */
export function useTtsSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, getTtsSnapshot, getTtsServerSnapshot);
}

/** Read French text aloud with the browser's voice, cutting off anything still speaking. */
export function speakFrench(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  window.speechSynthesis.speak(u);
}
