"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "./useLatest";

/* Minimal typings: the Web Speech API is not in lib.dom for all TS versions. */
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type Ctor = new () => SpeechRecognitionLike;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const HOMOPHONES: Record<string, string> = { to: "two", too: "two", for: "four", fore: "four", won: "one", ate: "eight" };

export function parseSpokenNumber(text: string): number | null {
  const direct = text.match(/\b\d{1,2}\b/);
  if (direct) return Number(direct[0]);
  const words = text.toLowerCase().replace(/-/g, " ").split(/\s+/).map((w) => HOMOPHONES[w] ?? w);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in TEENS) return TEENS[w];
    if (w in TENS) {
      const next = ONES.indexOf(words[i + 1] ?? "");
      return TENS[w] + (next > 0 ? next : 0);
    }
    const a = ONES.indexOf(w);
    if (a >= 0) {
      const b = ONES.indexOf(words[i + 1] ?? "");
      return b >= 0 ? a * 10 + b : a;
    }
  }
  return null;
}

const DIRECTION_ALIASES: Record<string, string> = {
  up: "up", op: "up", upward: "up", top: "up",
  down: "down", downward: "down", bottom: "down",
  left: "left", lift: "left",
  right: "right", write: "right", rite: "right",
};

export function parseSpokenDirection(text: string): string | null {
  for (const w of text.toLowerCase().split(/\s+/).reverse()) {
    if (DIRECTION_ALIASES[w]) return DIRECTION_ALIASES[w];
  }
  return null;
}

/**
 * Hands-free answers via the browser's built-in Web Speech API (free, no API key).
 * In Chrome the audio is processed by Google's speech service; disclose this in the UI.
 */
export function useSpeech(onHeard: (transcript: string) => void, enabled: boolean) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const cbRef = useLatest(onHeard);
  const wantRef = useRef(false);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Rec) {
      setSupported(false);
      return;
    }
    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const result = e.results[e.resultIndex];
      const text = result[0].transcript.trim();
      setHeard(text);
      cbRef.current(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      // Chrome ends sessions on silence; restart while the test wants voice.
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      } else setListening(false);
    };
    recRef.current = rec;
    wantRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [cbRef]);

  useEffect(() => {
    if (!enabled) return;
    start();
    return stop;
  }, [enabled, start, stop]);

  return { supported, listening, heard, start, stop };
}
