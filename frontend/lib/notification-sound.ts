// Foreground notification sound: a short WebAudio chime plus its user preference. The tone is
// synthesized (no binary asset) so it stays tiny and works offline. Every browser call is
// guarded so autoplay restrictions or an unsupported AudioContext never break the caller.

const STORAGE_KEY = "pulso.notification-sound";
// Same-tab listeners are notified through this event; the native `storage` event only fires
// in other tabs, so the toggle dispatches this to update the always-mounted host live.
const PREFERENCE_EVENT = "pulso:notification-sound-change";

// Two soft descending notes — recognizable, mobile-friendly, and well under a second.
const TONE_SEQUENCE: ReadonlyArray<{ frequency: number; startAt: number; duration: number }> = [
  { frequency: 880, startAt: 0, duration: 0.16 },
  { frequency: 1174.66, startAt: 0.11, duration: 0.22 },
];
const PEAK_GAIN = 0.14;

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

// One shared context, unlocked lazily on the first playback after a user gesture.
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    return null;
  }
}

export function readNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Default on: an alerting app should be audible until the user opts out.
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // A blocked localStorage still lets the in-memory session toggle work via the event below.
  }
  window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: enabled }));
}

// Subscribe to preference changes from this tab (custom event) and others (storage event).
export function subscribeNotificationSoundEnabled(
  onChange: (enabled: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onCustom = (event: Event): void => {
    onChange(Boolean((event as CustomEvent<boolean>).detail));
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STORAGE_KEY) onChange(readNotificationSoundEnabled());
  };

  window.addEventListener(PREFERENCE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// Play the chime once. Resolves quietly on any failure (autoplay policy, suspended context,
// unsupported browser) so notification delivery is never blocked.
export async function playNotificationSound(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === "suspended") await context.resume();
    // Still suspended → autoplay is blocked (no user gesture yet); skip silently.
    if (context.state !== "running") return;

    const now = context.currentTime;
    TONE_SEQUENCE.forEach(({ frequency, startAt, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const start = now + startAt;
      const end = start + duration;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
    });
  } catch {
    // Ignore playback failures; the visual notification still renders.
  }
}
