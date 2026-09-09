'use client';
import type { CompanionState } from '@/lib/companion/types';
export function CompanionCharacter({
  state = 'idle',
}: {
  state?: CompanionState;
}) {
  return (
    <svg
      className={`companion-character state-${state}`}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`WOW Companion is ${state}`}
    >
      <defs>
        <linearGradient id="wow-shell" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path
        className="companion-ear ear-left"
        d="M25 27 16 14c-2-3 2-7 5-5l16 10Z"
        fill="#f97316"
      />
      <path
        className="companion-ear ear-right"
        d="m71 27 9-13c2-3 6 1 4 4L59 19Z"
        fill="#f97316"
      />
      <path
        className="companion-shell"
        d="M48 10c22 0 38 16 38 40 0 25-15 38-38 38S10 75 10 50c0-24 16-40 38-40Z"
        fill="url(#wow-shell)"
      />
      <path
        className="companion-face"
        d="M48 20c18 0 29 12 29 30S66 78 48 78 19 68 19 50s11-30 29-30Z"
        fill="#fff7ed"
      />
      <g className="companion-eyes" fill="#1c1917">
        <ellipse cx="37" cy="46" rx="4" ry="5" />
        <ellipse cx="59" cy="46" rx="4" ry="5" />
      </g>
      <path
        className="companion-mouth"
        d="M41 59c5 5 10 5 15 0"
        fill="none"
        stroke="#1c1917"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        className="companion-arm arm-left"
        d="M15 51c-8 1-10 8-8 14"
        fill="none"
        stroke="#ea580c"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        className="companion-arm arm-right"
        d="M81 51c8 1 10 8 8 14"
        fill="none"
        stroke="#ea580c"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        className="companion-spark"
        d="m48 25 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"
        fill="#f97316"
      />
    </svg>
  );
}
