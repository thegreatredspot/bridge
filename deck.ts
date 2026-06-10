import type { Card, PlayerId, Rank, Suit } from "./types";

const suits: Suit[] = ["S", "H", "D", "C"];

const ranks: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

//Then Shuffle
export function shuffleDeck(deck: Card[]): Card[] {
  const copiedDeck = [...deck];

  for (let i = copiedDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    const temp = copiedDeck[i];
    copiedDeck[i] = copiedDeck[j];
    copiedDeck[j] = temp;
  }

  return copiedDeck;
}
//Then Deal

export function dealCards(deck: Card[]): Record<PlayerId, Card[]> {
  if (deck.length !== 52) {
    throw new Error("Deck must contain exactly 52 cards.");
  }

  const players: PlayerId[] = ["N", "E", "S", "W"];

  const hands: Record<PlayerId, Card[]> = {
    N: [],
    E: [],
    S: [],
    W: [],
  };

  for (let i = 0; i < deck.length; i++) {
    const player = players[i % 4];
    hands[player].push(deck[i]);
  }

  return hands;
}