### Task 1: Conversation DTOs and compact incident map

**Files:**
- Create: `frontend/lib/assistant-conversation.ts`
- Create: `frontend/components/AssistantIncidentMap.tsx`
- Modify: `frontend/lib/index.ts`
- Modify: `frontend/components/index.ts`

**Interfaces:**
- Consumes: `NearbyIncident` and `IncidentDetails` types from `@pulso/core`; `config.mapStyleUrl` and `config.defaultZoom` from `@/lib`.
- Produces: `AssistantLocation`, `AssistantTurnContent`, `AssistantTurn`; `AssistantIncidentMap({ incidents, center })`.

- [ ] **Step 1: Add the conversation DTO file**

Create `frontend/lib/assistant-conversation.ts` with exactly:

```ts
import type { IncidentDetails, NearbyIncident } from "@pulso/core";

export interface AssistantLocation {
  lat: number;
  long: number;
}

export type AssistantTurnContent =
  | { kind: "text"; role: "user" | "agent" | "tool"; text: string }
  | { kind: "incidents"; incidents: NearbyIncident[] }
  | { kind: "detail"; details: IncidentDetails };

export type AssistantTurn = AssistantTurnContent & {
  exchangeId: number;
};
```

- [ ] **Step 2: Add the compact map**

Create `frontend/components/AssistantIncidentMap.tsx` with exactly:

```tsx
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Category, NearbyIncident } from "@pulso/core";
import { config, type AssistantLocation } from "@/lib";

const CATEGORY_COLOR: Record<Category, string> = {
  road_closure: "var(--sev-road)",
  accident: "var(--sev-accident)",
  flood: "var(--sev-flood)",
  fire: "var(--sev-fire)",
  public_event: "var(--sev-event)",
  other: "var(--muted)",
};

export default function AssistantIncidentMap({
  incidents,
  center,
}: {
  incidents: NearbyIncident[];
  center: AssistantLocation;
}) {
  return (
    <div
      className="assistant-map"
      role="img"
      aria-label={`Mapa compacto con ${incidents.length} ${
        incidents.length === 1 ? "incidente cercano" : "incidentes cercanos"
      }`}
    >
      <Map
        reuseMaps
        interactive={false}
        attributionControl={false}
        mapStyle={config.mapStyleUrl}
        initialViewState={{
          latitude: center.lat,
          longitude: center.long,
          zoom: config.defaultZoom,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Marker latitude={center.lat} longitude={center.long} anchor="center">
          <span className="assistant-map-user" aria-hidden="true" />
        </Marker>

        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            latitude={incident.lat}
            longitude={incident.lng}
            anchor="bottom"
          >
            <span
              className="assistant-map-pin"
              aria-hidden="true"
              style={{ background: CATEGORY_COLOR[incident.category] }}
            />
          </Marker>
        ))}
      </Map>
    </div>
  );
}
```

- [ ] **Step 3: Wire the orchestrator-owned barrels**

Add to `frontend/lib/index.ts` after the Realtime exports:

```ts
export type {
  AssistantLocation,
  AssistantTurn,
  AssistantTurnContent,
} from "./assistant-conversation";
```

Keep exactly one `TOOL_CALL_LABELS` export. Preserve whichever friendly-label module is present in the latest working tree and remove only a duplicate export if concurrent work left both `./tool-labels` and `./tool-call-labels` exported.

Add to `frontend/components/index.ts` beside the existing assistant exports:

```ts
export { default as AssistantIncidentMap } from "./AssistantIncidentMap";
```

- [ ] **Step 4: Validate the focused deliverable**

Run from `frontend/`:

```powershell
npx tsc --noEmit
```

Expected: exit code 0; `AssistantIncidentMap` resolves from `@/components`, and all conversation types resolve from `@/lib`.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add frontend/lib/assistant-conversation.ts frontend/components/AssistantIncidentMap.tsx frontend/lib/index.ts frontend/components/index.ts
git commit -m "feat(assistant): add compact incident map primitives"
```

---
