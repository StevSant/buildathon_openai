"use client";

import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantIncidentCards from "./AssistantIncidentCards";
import AssistantIncidentDetailCard from "./AssistantIncidentDetailCard";
import AssistantIncidentMap from "./AssistantIncidentMap";

export default function AssistantTurnList({
  turns,
  location,
  showMaps = true,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
  showMaps?: boolean;
}) {
  return (
    <div className="assistant-turn-list">
      {turns.map((turn, index) => {
        const key = `${turn.exchangeId}-${index}`;
        if (turn.kind === "incidents") {
          return (
            <div key={key} className="assistant-nearby-result">
              {location && showMaps ? (
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
