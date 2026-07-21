"use client";

import Link from "next/link";
import Icon from "./Icon";

// Bell in the map top bar. Links to the notification center; shows an unread badge.
export default function NotificationBell({ unread = 0 }: { unread?: number }) {
  const badge = unread > 9 ? "9+" : unread;

  return (
    <Link href="/notifications" aria-label="Notificaciones" className="bell">
      <Icon name="ic-bell" />
      {unread > 0 ? (
        <span className="badge" aria-label={`${unread} notificaciones sin leer`}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
