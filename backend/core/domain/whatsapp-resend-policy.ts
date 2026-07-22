/**
 * Pure rate-limit rule for resending the WhatsApp verification message (issue #6). No I/O —
 * the caller loads and persists the per-user attempt state and injects the policy (from
 * config). Two guards protect against abuse and messaging cost: a minimum cooldown between
 * two sends, and a maximum number of sends per rolling window. No verification code or secret
 * ever reaches this layer; only send counters and timestamps are reasoned about.
 */

/** Tunable limits, injected from config (never hardcoded). */
export interface WhatsAppResendPolicy {
  cooldownSeconds: number; // minimum gap between two consecutive sends
  windowSeconds: number; // length of the rolling abuse/cost window
  maxSendsPerWindow: number; // sends allowed within one window
}

/** Persisted per-user counters. Timestamps are epoch milliseconds; null means "never". */
export interface WhatsAppResendState {
  windowStartedAt: number | null;
  sendCount: number;
  lastSentAt: number | null;
}

/** Outcome of the check, plus the state to persist when a send is allowed. */
export interface WhatsAppResendDecision {
  allowed: boolean;
  retryAfterSeconds: number; // when blocked: seconds to wait; when allowed: cooldown to the next send
  nextState: WhatsAppResendState; // unchanged from the input when the send is blocked
}

export function evaluateWhatsAppResend(
  state: WhatsAppResendState,
  policy: WhatsAppResendPolicy,
  nowMs: number,
): WhatsAppResendDecision {
  const cooldownMs = policy.cooldownSeconds * 1000;
  const windowMs = policy.windowSeconds * 1000;

  // Guard 1 — enforce the cooldown since the last send.
  if (state.lastSentAt !== null) {
    const sinceLast = nowMs - state.lastSentAt;
    if (sinceLast < cooldownMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((cooldownMs - sinceLast) / 1000),
        nextState: state,
      };
    }
  }

  // Roll the window forward when it has fully elapsed (or was never started).
  const windowStartedAt =
    state.windowStartedAt !== null && nowMs - state.windowStartedAt < windowMs
      ? state.windowStartedAt
      : nowMs;
  const withinActiveWindow = windowStartedAt === state.windowStartedAt;
  const sendCount = withinActiveWindow ? state.sendCount : 0;

  // Guard 2 — enforce the per-window cap.
  if (sendCount >= policy.maxSendsPerWindow) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowMs - (nowMs - windowStartedAt)) / 1000),
      nextState: state,
    };
  }

  // Allowed: record this send. retryAfterSeconds is the cooldown until the next send, which the
  // client uses to start its countdown.
  return {
    allowed: true,
    retryAfterSeconds: policy.cooldownSeconds,
    nextState: {
      windowStartedAt,
      sendCount: sendCount + 1,
      lastSentAt: nowMs,
    },
  };
}
