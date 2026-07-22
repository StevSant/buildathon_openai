"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import {
  playNotificationSound,
  readNotificationSoundEnabled,
  setNotificationSoundEnabled,
  subscribeNotificationSoundEnabled,
} from "@/lib";

// Settings control for the foreground notification sound. The preference is local to the
// device (localStorage) and read by the always-mounted NotificationHost; toggling it on plays
// a confirmation chime, which also satisfies the browser's user-gesture unlock for autoplay.
export default function NotificationSoundToggle() {
  // Start from the persisted default deterministically, then sync to the stored value on mount
  // to avoid a hydration mismatch (localStorage is unavailable during SSR).
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(readNotificationSoundEnabled());
    return subscribeNotificationSoundEnabled(setEnabled);
  }, []);

  function toggle(): void {
    const next = !enabled;
    setEnabled(next);
    setNotificationSoundEnabled(next);
    if (next) void playNotificationSound();
  }

  return (
    <section className="group" aria-labelledby="notification-sound-title">
      <div className="gl" id="notification-sound-title">
        Notificaciones
      </div>

      <div className="item">
        <span className="lft">
          <Icon name="ic-bell" />
          Sonido al recibir una alerta
        </span>
        <button
          type="button"
          aria-label="Sonido al recibir una alerta"
          aria-pressed={enabled}
          onClick={toggle}
          className={enabled ? "toggle on" : "toggle"}
        />
      </div>

      <div className="item" style={{ borderTop: 0, paddingTop: 2 }}>
        <span className="hint">
          Suena una vez cuando llega una alerta con la app abierta. Los avisos visuales siguen
          funcionando aunque el sonido esté apagado.
        </span>
      </div>
    </section>
  );
}
