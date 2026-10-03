"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { frontendApi } from "./api-adapter";
import { Icon } from "./icons";

// Pilota UX "percorso di avvio": 3 passi completati dai DATI REALI dell'account (nessuna autodichiarazione).
// Dietro NEXT_PUBLIC_FF_BOOK_START (spento di default, inlined a build time).
export const START_PATH_ENABLED = process.env.NEXT_PUBLIC_FF_BOOK_START === "true";

const CELEBRATED_KEY = "bookStartPathCelebrated";

export function StartPath({ hasPublishedEvent, hasBooking }: { hasPublishedEvent: boolean; hasBooking: boolean }) {
  const [hasAvailability, setHasAvailability] = useState<boolean | null>(null);
  const [celebrated, setCelebrated] = useState(true);

  useEffect(() => {
    let active = true;
    frontendApi.getAvailability()
      .then((schedule) => { if (active) setHasAvailability(schedule.days.some((day) => day.enabled && day.windows.length > 0)); })
      .catch(() => { if (active) setHasAvailability(false); });
    try { setCelebrated(localStorage.getItem(CELEBRATED_KEY) === "1"); } catch { setCelebrated(false); }
    return () => { active = false; };
  }, []);

  if (hasAvailability === null) return null;

  const steps = [
    { id: "availability", done: hasAvailability, title: "Set your working hours", hint: "Invitees can only pick times you are free.", href: "/availability", cta: "Open availability" },
    { id: "link", done: hasPublishedEvent, title: "Publish your first booking link", hint: "An event type with a public link people can open.", href: "/event-types/new", cta: "Create event type" },
    { id: "booking", done: hasBooking, title: "Get your first booking", hint: "Share the link; this ticks when a real booking arrives.", href: "/event-types", cta: "Open your links" },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;
  if (allDone && celebrated) return null;

  const dismissCelebration = () => { try { localStorage.setItem(CELEBRATED_KEY, "1"); } catch { /* storage non disponibile */ } setCelebrated(true); };
  const next = steps.find((step) => !step.done);

  return (
    <section className="panel start-path" aria-label="Getting started" data-testid="start-path">
      <div className="start-path-head">
        <div>
          <span className="eyebrow">Getting started</span>
          <h2>{allDone ? "You are live. Your first booking is in." : `${doneCount} of ${steps.length} steps done`}</h2>
        </div>
        <div className="start-path-bar" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Getting started progress"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      </div>
      <ol className="start-path-list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : step === next ? "is-next" : ""}>
            <span className="start-path-mark" aria-hidden="true">{step.done ? <Icon name="check" size={14} /> : null}</span>
            <div><strong>{step.title}</strong><small>{step.hint}</small></div>
            {!step.done && step === next && <Link className="button button-primary button-sm" href={step.href}>{step.cta}</Link>}
            {step.done && <span className="sr-only">Done</span>}
          </li>
        ))}
      </ol>
      {allDone && <button className="button button-secondary button-sm" type="button" onClick={dismissCelebration}>Got it</button>}
    </section>
  );
}
