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
