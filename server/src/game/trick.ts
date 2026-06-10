import type { Play, Trump } from "./types";
import { getRankValue } from "./cardUtils";

export function determineTrickWinner(plays: Play[], trump: Trump): Play {
  if (plays.length !== 4) {
    throw new Error("A trick must contain exactly 4 plays.");
  }

  const ledSuit = plays[0].card.suit;

  let winningPlay = plays[0];

  for (const play of plays.slice(1)) {
    const currentCard = play.card;
    const winningCard = winningPlay.card;

    const currentIsTrump = trump !== "NT" && currentCard.suit === trump;
    const winningIsTrump = trump !== "NT" && winningCard.suit === trump;

    if (currentIsTrump && !winningIsTrump) {
      winningPlay = play;
      continue;
    }

    if (!currentIsTrump && winningIsTrump) {
      continue;
    }

    const sameRelevantSuit =
      currentCard.suit === winningCard.suit ||
      currentCard.suit === ledSuit;

    if (
      sameRelevantSuit &&
      currentCard.suit === winningCard.suit &&
      getRankValue(currentCard) > getRankValue(winningCard)
    ) {
      winningPlay = play;
    }
  }

  return winningPlay;
}