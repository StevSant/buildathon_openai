### Task 2: Latest-exchange renderer with collapsed history

**Files:**
- Create: `frontend/components/AssistantTurnList.tsx`
- Create: `frontend/components/AssistantConversation.tsx`
- Modify: `frontend/components/index.ts`

**Interfaces:**
- Consumes: `AssistantTurn[]`, `AssistantLocation | null`, `AssistantIncidentMap`, `AssistantIncidentCards`, and `AssistantIncidentDetailCard`.
- Produces: `AssistantTurnList({ turns, location })`; `AssistantConversation({ turns, location })`.

- [ ] **Step 1: Add the focused turn renderer**

Create `frontend/components/AssistantTurnList.tsx` with exactly:

```tsx
"use client";

import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantIncidentCards from "./AssistantIncidentCards";
import AssistantIncidentDetailCard from "./AssistantIncidentDetailCard";
import AssistantIncidentMap from "./AssistantIncidentMap";

export default function AssistantTurnList({
  turns,
  location,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
}) {
  return (
    <div className="assistant-turn-list">
      {turns.map((turn, index) => {
        const key = `${turn.exchangeId}-${index}`;
        if (turn.kind === "incidents") {
          return (
            <div key={key} className="assistant-nearby-result">
              {location ? (
                <AssistantIncidentMap incidents={turn.incidents} center={location} />
              ) : null}
              <AssistantIncidentCards incidents={turn.incidents} />
            </div>
          );
        }
        if (turn.kind === "detail") {
          return <AssistantIncidentDetailCard key={key} details={turn.details} />;
        }
        if (turn.role === "tool") {
          return (
            <div key={key} className="toolcall">
              {turn.text}
            </div>
          );
        }
        return (
          <div key={key} className={turn.role === "user" ? "bubble u" : "bubble a"}>
            {turn.text}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the history boundary**

Create `frontend/components/AssistantConversation.tsx` with exactly:

```tsx
"use client";

import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantTurnList from "./AssistantTurnList";

export default function AssistantConversation({
  turns,
  location,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
}) {
  const latestExchangeId = turns.at(-1)?.exchangeId;
  const previousTurns = turns.filter((turn) => turn.exchangeId !== latestExchangeId);
  const latestTurns = turns.filter((turn) => turn.exchangeId === latestExchangeId);
  const previousCount = new Set(previousTurns.map((turn) => turn.exchangeId)).size;

  return (
    <div className="assistant-conversation">
      {previousTurns.length > 0 ? (
        <details className="assistant-history">
          <summary>
            Ver conversación anterior
            <span>{previousCount}</span>
          </summary>
          <AssistantTurnList turns={previousTurns} location={location} />
        </details>
      ) : null}

      <AssistantTurnList turns={latestTurns} location={location} />
    </div>
  );
}
```

- [ ] **Step 3: Wire the component barrel**

Add to `frontend/components/index.ts` beside the assistant exports:

```ts
export { default as AssistantTurnList } from "./AssistantTurnList";
export { default as AssistantConversation } from "./AssistantConversation";
```

- [ ] **Step 4: Validate the focused deliverable**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; the history wrapper accepts empty turns and renders the latest exchange without optional-property errors.

- [ ] **Step 5: Commit only Task 2 files**

```powershell
git add frontend/components/AssistantTurnList.tsx frontend/components/AssistantConversation.tsx frontend/components/index.ts
git commit -m "feat(assistant): collapse previous voice exchanges"
```

---
