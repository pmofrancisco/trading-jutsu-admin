"use client";

import { useEffect, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const NBSP = " ";

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

interface FlapTextProps {
  text: string;
  delayMs?: number;
  className?: string;
}

/**
 * Renders text as split-flap board characters that flip into place.
 * Each row's flip means its status just resolved -- not decoration.
 */
export function FlapText({ text, delayMs = 0, className = "" }: FlapTextProps) {
  const chars = text.split("");
  const [display, setDisplay] = useState<string[]>(() => chars.map(() => NBSP));

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (reduceMotion) {
      timers.push(
        setTimeout(() => {
          if (!cancelled) setDisplay(chars.map((c) => (c === " " ? NBSP : c)));
        }, 0),
      );
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    chars.forEach((char, i) => {
      if (char === " ") return;
      const spins = 3 + (i % 3);
      for (let s = 0; s < spins; s++) {
        const at = delayMs + i * 35 + s * 45;
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setDisplay((prev) => {
              const next = [...prev];
              next[i] = s === spins - 1 ? char : randomGlyph();
              return next;
            });
          }, at),
        );
      }
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delayMs]);

  return (
    <span className={`inline-flex ${className}`} aria-label={text}>
      {display.map((c, i) => (
        <span key={i} aria-hidden="true" className="inline-block tabular-nums">
          {c}
        </span>
      ))}
    </span>
  );
}
