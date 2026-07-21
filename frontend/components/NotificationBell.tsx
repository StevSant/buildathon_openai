"use client";

import Link from "next/link";

// Bell in the map top bar. Links to the notification center; shows an unread badge.
export default function NotificationBell({ unread = 0 }: { unread?: number }) {
  return (
    <Link
      href="/notifications"
      aria-label="Notificaciones"
      className="relative flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-line bg-[rgba(18,25,34,0.92)] text-ink backdrop-blur"
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.85}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.6 2.3H4.4z" />
        <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-bg bg-sev-fire px-1 text-[10px] font-bold text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
