export type Suit = "S" | "H" | "D" | "C";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = {
  suit: Suit;
  rank: Rank;
};

export type PlayerId = "N" | "E" | "S" | "W";

export type Trump = Suit | "NT";

export type Bid = {
  player: PlayerId;
  tricks: number;
  trump: Trump;
};

export type Play = {
  player: PlayerId;
  card: Card;
};

export type Phase =
  | "WAITING_FOR_PLAYERS"
  | "DEALING"
  | "BIDDING"
  | "CALLING_PARTNER"
  | "PLAYING"
  | "SCORING"
  | "ROUND_OVER";

export type GameState = {
  phase: Phase;

  players: PlayerId[];

  dealer: PlayerId;
  currentTurn: PlayerId;

  hands: Record<PlayerId, Card[]>;

  bids: Bid[];
  consecutivePasses: number;

  contract?: Bid;
  declarer?: PlayerId;

  calledCard?: Card;
  hiddenPartner?: PlayerId;
  partnerRevealed: boolean;

  currentTrick: Play[];
  completedTricks: Play[][];

  tricksWon: Record<PlayerId, number>;

  roundNumber: number;
};