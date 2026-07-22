"use client";

import { useState } from "react";
import type { AssistantLocation, AssistantTurn } from "@/lib";
import AssistantTurnList from "./AssistantTurnList";

export default function AssistantConversation({
  turns,
  location,
}: {
  turns: AssistantTurn[];
  location: AssistantLocation | null;
}) {
  const latestExchangeId = turns.reduce<number | undefined>(
    (latest, turn) =>
      latest === undefined || turn.exchangeId > latest
        ? turn.exchangeId
        : latest,
    undefined,
  );
  const previousTurns = turns.filter((turn) => turn.exchangeId !== latestExchangeId);
  const latestTurns = turns.filter((turn) => turn.exchangeId === latestExchangeId);
  const previousCount = new Set(previousTurns.map((turn) => turn.exchangeId)).size;
  const [historyOpenForExchange, setHistoryOpenForExchange] = useState<number>();
  const historyOpen =
    latestExchangeId !== undefined && historyOpenForExchange === latestExchangeId;

  return (
    <div className="assistant-conversation">
      {previousTurns.length > 0 ? (
        <details
          className="assistant-history"
          open={historyOpen}
          onToggle={(event) =>
            setHistoryOpenForExchange(
              event.currentTarget.open ? latestExchangeId : undefined,
            )
          }
        >
          <summary>
            Ver conversación anterior
            <span>{previousCount}</span>
          </summary>
          {historyOpen ? (
            <AssistantTurnList
              turns={previousTurns}
              location={location}
              showMaps={false}
            />
          ) : null}
        </details>
      ) : null}

      <AssistantTurnList turns={latestTurns} location={location} />
    </div>
  );
}
