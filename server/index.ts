import { createServer } from "http";
import { Server } from "socket.io";

import { createDeck, dealCards, shuffleDeck } from "../src/game/deck";
import { determineTrickWinner } from "../src/game/trick";
import type { Card, GameState, Play, PlayerId, Trump } from "../src/game/types";

type Room = {
  roomCode: string;
  players: Record<PlayerId, string | null>; // socket id
  playerTokens: Record<PlayerId, string | null>;
  cumulativeScores: Record<PlayerId, number>;
  roundScored: boolean;
  game: GameState;
};

type BidPayload = {
  roomCode: string;
  contractLevel: number;
  trump: Trump;
};

type RoomActionPayload = {
  roomCode: string;
};

type ResumeRoomPayload = {
  roomCode: string;
  playerToken: string;
};

type CallCardPayload = {
  roomCode: string;
  card: Card;
};

type PlayCardPayload = {
  roomCode: string;
  card: Card;
};

const rooms: Record<string, Room> = {};
const disconnectTimers: Record<string, NodeJS.Timeout> = {};

const playerSeats: PlayerId[] = ["N", "E", "S", "W"];
const trumpOptions: Trump[] = ["C", "D", "H", "S", "NT"];

const suitSortOrder: Record<Card["suit"], number> = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
};

const rankSortOrder: Record<Card["rank"], number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const httpServer = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("SG Bridge Socket.IO server is running");
    return;
  }

  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
  },
  pingInterval: 10000,
  pingTimeout: 30000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
    skipMiddlewares: true,
  },
});

function createRoomCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function createPlayerToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const suitDifference = suitSortOrder[a.suit] - suitSortOrder[b.suit];

    if (suitDifference !== 0) {
      return suitDifference;
    }

    return rankSortOrder[a.rank] - rankSortOrder[b.rank];
  });
}

function createNewGame(): GameState {
  const deck = shuffleDeck(createDeck());
  const dealtHands = dealCards(deck);
  const hands: GameState["hands"] = {
    N: sortHand(dealtHands.N),
    E: sortHand(dealtHands.E),
    S: sortHand(dealtHands.S),
    W: sortHand(dealtHands.W),
  };

  return {
    phase: "BIDDING",
    players: playerSeats,
    dealer: "N",
    currentTurn: "N",
    hands,
    bids: [],
    consecutivePasses: 0,
    partnerRevealed: false,
    currentTrick: [],
    completedTricks: [],
    tricksWon: {
      N: 0,
      E: 0,
      S: 0,
      W: 0,
    },
    roundNumber: 1,
  };
}

function createWaitingGame(): GameState {
  return {
    phase: "WAITING_FOR_PLAYERS",
    players: playerSeats,
    dealer: "N",
    currentTurn: "N",
    hands: {
      N: [],
      E: [],
      S: [],
      W: [],
    },
    bids: [],
    consecutivePasses: 0,
    partnerRevealed: false,
    currentTrick: [],
    completedTricks: [],
    tricksWon: {
      N: 0,
      E: 0,
      S: 0,
      W: 0,
    },
    roundNumber: 1,
  };
}

function createEmptyRoom(roomCode: string): Room {
  return {
    roomCode,
    players: {
      N: null,
      E: null,
      S: null,
      W: null,
    },
    playerTokens: {
      N: null,
      E: null,
      S: null,
      W: null,
    },
    cumulativeScores: {
      N: 0,
      E: 0,
      S: 0,
      W: 0,
    },
    roundScored: false,
    game: createWaitingGame(),
  };
}

function findAvailableSeat(room: Room): PlayerId | null {
  for (const seat of playerSeats) {
    if (room.players[seat] === null) {
      return seat;
    }
  }

  return null;
}

function isRoomFull(room: Room): boolean {
  return playerSeats.every((seat) => room.players[seat] !== null);
}

function getSeatBySocketId(room: Room, socketId: string): PlayerId | null {
  for (const seat of playerSeats) {
    if (room.players[seat] === socketId) {
      return seat;
    }
  }

  return null;
}

function getSeatByPlayerToken(room: Room, playerToken: string): PlayerId | null {
  for (const seat of playerSeats) {
    if (room.playerTokens[seat] === playerToken) {
      return seat;
    }
  }

  return null;
}

function getDisconnectTimerKey(roomCode: string, seat: PlayerId): string {
  return `${roomCode}:${seat}`;
}

function clearDisconnectTimer(roomCode: string, seat: PlayerId) {
  const key = getDisconnectTimerKey(roomCode, seat);
  const timer = disconnectTimers[key];

  if (!timer) {
    return;
  }

  clearTimeout(timer);
  delete disconnectTimers[key];
}

function getRoomSnapshot(room: Room) {
  return {
    roomCode: room.roomCode,
    players: room.players,
    cumulativeScores: room.cumulativeScores,
  };
}

function createPrivateGameSnapshot(game: GameState, viewer: PlayerId): GameState {
  const hiddenCard: Card = { rank: "2", suit: "C" };
  const privateHands: GameState["hands"] = {
    N: game.hands.N,
    E: game.hands.E,
    S: game.hands.S,
    W: game.hands.W,
  };

  for (const seat of playerSeats) {
    if (seat !== viewer) {
      privateHands[seat] = game.hands[seat].map(() => hiddenCard);
    }
  }

  return {
    ...game,
    hands: privateHands,
    hiddenPartner: game.partnerRevealed ? game.hiddenPartner : undefined,
  };
}

function emitRoomState(room: Room) {
  io.to(room.roomCode).emit("room-updated", getRoomSnapshot(room));

  for (const seat of playerSeats) {
    const socketId = room.players[seat];

    if (!socketId) {
      continue;
    }

    io.to(socketId).emit("game-updated", createPrivateGameSnapshot(room.game, seat));
  }
}

function getNextPlayer(player: PlayerId): PlayerId {
  const index = playerSeats.indexOf(player);
  return playerSeats[(index + 1) % playerSeats.length];
}

function getTrumpStrength(trump: Trump): number {
  return trumpOptions.indexOf(trump);
}

function getHighestBid(bids: GameState["bids"]): GameState["contract"] {
  const realBids = bids.filter((bid) => bid.tricks > 0);

  if (realBids.length === 0) {
    return undefined;
  }

  return realBids.reduce((bestBid, currentBid) => {
    if (currentBid.tricks > bestBid.tricks) {
      return currentBid;
    }

    if (
      currentBid.tricks === bestBid.tricks &&
      getTrumpStrength(currentBid.trump) > getTrumpStrength(bestBid.trump)
    ) {
      return currentBid;
    }

    return bestBid;
  });
}

function isBidHigherThanCurrentBid(
  tricks: number,
  trump: Trump,
  currentHighestBid: GameState["contract"]
): boolean {
  if (!currentHighestBid) {
    return true;
  }

  if (tricks > currentHighestBid.tricks) {
    return true;
  }

  if (
    tricks === currentHighestBid.tricks &&
    getTrumpStrength(trump) > getTrumpStrength(currentHighestBid.trump)
  ) {
    return true;
  }

  return false;
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

function findCardHolder(hands: GameState["hands"], card: Card): PlayerId | undefined {
  return playerSeats.find((player) =>
    hands[player].some((handCard) => sameCard(handCard, card))
  );
}

function removeCardFromHand(hand: Card[], card: Card): Card[] {
  const index = hand.findIndex((handCard) => sameCard(handCard, card));

  if (index === -1) {
    return hand;
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function canPlayCard(hand: Card[], currentTrick: Play[], card: Card): boolean {
  if (currentTrick.length === 0) {
    return true;
  }

  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some((handCard) => handCard.suit === ledSuit);

  if (!hasLedSuit) {
    return true;
  }

  return card.suit === ledSuit;
}

function isTrumpBroken(game: GameState): boolean {
  const trump = game.contract?.trump;

  if (!trump || trump === "NT") {
    return true;
  }

  return game.completedTricks.some((trick) =>
    trick.some((play) => play.card.suit === trump)
  );
}

function canLeadCard(game: GameState, hand: Card[], card: Card): boolean {
  const trump = game.contract?.trump;

  if (game.currentTrick.length !== 0) {
    return true;
  }

  if (!trump || trump === "NT") {
    return true;
  }

  if (card.suit !== trump) {
    return true;
  }

  const handHasNonTrump = hand.some((handCard) => handCard.suit !== trump);

  if (!handHasNonTrump) {
    return true;
  }

  return isTrumpBroken(game);
}

function getDeclarerTargetSets(contractLevel: number): number {
  return 6 + contractLevel;
}

function calculateScoreChange(params: {
  players: PlayerId[];
  declarer: PlayerId;
  partner: PlayerId;
  declarerSucceeded: boolean;
}): Record<PlayerId, number> {
  const scoreChange: Record<PlayerId, number> = {
    N: 0,
    E: 0,
    S: 0,
    W: 0,
  };

  const declarerTeam = new Set<PlayerId>([params.declarer, params.partner]);

  for (const player of params.players) {
    const isDeclarerTeam = declarerTeam.has(player);

    if (params.declarerSucceeded) {
      if (player === params.declarer) {
        scoreChange[player] = -0.5;
      } else if (!isDeclarerTeam) {
        scoreChange[player] = 1;
      }
    } else {
      if (player === params.declarer) {
        scoreChange[player] = 1.5;
      } else if (isDeclarerTeam) {
        scoreChange[player] = 1;
      }
    }
  }

  return scoreChange;
}

function scoreCompletedRound(room: Room) {
  if (room.roundScored) {
    return;
  }

  const contract = room.game.contract;
  const declarer = room.game.declarer;
  const partner = room.game.hiddenPartner;

  if (!contract || !declarer || !partner) {
    return;
  }

  const declarerTargetSets = getDeclarerTargetSets(contract.tricks);
  const declarerTeamTricks = room.game.tricksWon[declarer] + room.game.tricksWon[partner];
  const declarerSucceeded = declarerTeamTricks >= declarerTargetSets;
  const scoreChange = calculateScoreChange({
    players: room.game.players,
    declarer,
    partner,
    declarerSucceeded,
  });

  for (const player of playerSeats) {
    room.cumulativeScores[player] += scoreChange[player];
  }

  room.roundScored = true;
}

function getRoomOrError(roomCodeInput: string, socketId: string): Room | null {
  const roomCode = roomCodeInput.toUpperCase();
  const room = rooms[roomCode];

  if (!room) {
    io.to(socketId).emit("error-message", "Room not found.");
    return null;
  }

  return room;
}

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

  socket.on("create-room", () => {
    const roomCode = createRoomCode();
    const room = createEmptyRoom(roomCode);

    const seat = findAvailableSeat(room);

    if (!seat) {
      socket.emit("error-message", "Could not create room.");
      return;
    }

    room.players[seat] = socket.id;
    room.playerTokens[seat] = createPlayerToken();
    clearDisconnectTimer(roomCode, seat);
    rooms[roomCode] = room;

    socket.join(roomCode);

    socket.emit("room-joined", {
      room: getRoomSnapshot(room),
      seat,
      playerToken: room.playerTokens[seat],
    });

    emitRoomState(room);
  });

  socket.on("join-room", (roomCodeInput: string) => {
    const roomCode = roomCodeInput.toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("error-message", "Room not found.");
      return;
    }

    const seat = findAvailableSeat(room);

    if (!seat) {
      socket.emit("error-message", "Room is full.");
      return;
    }

    room.players[seat] = socket.id;
    room.playerTokens[seat] = createPlayerToken();
    clearDisconnectTimer(roomCode, seat);
    socket.join(roomCode);

    socket.emit("room-joined", {
      room: getRoomSnapshot(room),
      seat,
      playerToken: room.playerTokens[seat],
    });

    emitRoomState(room);
  });

  socket.on("resume-room", (payload: ResumeRoomPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatByPlayerToken(room, payload.playerToken);

    if (!seat) {
      socket.emit("error-message", "Could not resume seat. Please join again.");
      return;
    }

    const currentSocketId = room.players[seat];

    if (currentSocketId && currentSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(currentSocketId);

      if (oldSocket?.connected) {
        socket.emit("error-message", "This seat is already active in another tab.");
        return;
      }
    }

    room.players[seat] = socket.id;
    clearDisconnectTimer(room.roomCode, seat);
    socket.join(room.roomCode);

    socket.emit("room-joined", {
      room: getRoomSnapshot(room),
      seat,
      playerToken: room.playerTokens[seat],
    });

    emitRoomState(room);
  });

  socket.on("start-game", (payload: RoomActionPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (seat !== "N") {
      socket.emit("error-message", "Only player N can start the game.");
      return;
    }

    if (!isRoomFull(room)) {
      socket.emit("error-message", "Need 4 players before starting.");
      return;
    }

    if (room.game.phase !== "WAITING_FOR_PLAYERS") {
      socket.emit("error-message", "Game has already started.");
      return;
    }

    room.game = createNewGame();
    room.roundScored = false;
    emitRoomState(room);
  });

  socket.on("make-bid", (payload: BidPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (!seat || seat !== room.game.currentTurn) {
      socket.emit("error-message", "It is not your turn.");
      return;
    }

    if (room.game.phase !== "BIDDING") {
      socket.emit("error-message", "You cannot bid right now.");
      return;
    }

    const currentHighestBid = getHighestBid(room.game.bids);

    if (!isBidHigherThanCurrentBid(payload.contractLevel, payload.trump, currentHighestBid)) {
      socket.emit("error-message", "Bid must be higher than the current highest bid.");
      return;
    }

    room.game = {
      ...room.game,
      bids: [
        ...room.game.bids,
        {
          player: seat,
          tricks: payload.contractLevel,
          trump: payload.trump,
        },
      ],
      consecutivePasses: 0,
      currentTurn: getNextPlayer(seat),
    };

    emitRoomState(room);
  });

  socket.on("pass-bid", (payload: RoomActionPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (!seat || seat !== room.game.currentTurn) {
      socket.emit("error-message", "It is not your turn.");
      return;
    }

    if (room.game.phase !== "BIDDING") {
      socket.emit("error-message", "You cannot pass right now.");
      return;
    }

    const currentHighestBid = getHighestBid(room.game.bids);
    const updatedConsecutivePasses = room.game.consecutivePasses + 1;

    if (!currentHighestBid && updatedConsecutivePasses >= 4) {
      room.game = createNewGame();
      room.roundScored = false;
      emitRoomState(room);
      return;
    }

    if (currentHighestBid && updatedConsecutivePasses >= 3) {
      room.game = {
        ...room.game,
        phase: "CALLING_PARTNER",
        contract: currentHighestBid,
        declarer: currentHighestBid.player,
        partnerRevealed: false,
        consecutivePasses: updatedConsecutivePasses,
        currentTurn: currentHighestBid.player,
      };

      emitRoomState(room);
      return;
    }

    room.game = {
      ...room.game,
      consecutivePasses: updatedConsecutivePasses,
      currentTurn: getNextPlayer(seat),
    };

    emitRoomState(room);
  });

  socket.on("call-card", (payload: CallCardPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (room.game.phase !== "CALLING_PARTNER") {
      socket.emit("error-message", "You cannot call a card right now.");
      return;
    }

    if (!seat || seat !== room.game.declarer) {
      socket.emit("error-message", "Only declarer can call teammate.");
      return;
    }

    const cardHolder = findCardHolder(room.game.hands, payload.card);

    if (!cardHolder) {
      socket.emit("error-message", "That card is not in any player's hand.");
      return;
    }

    room.game = {
      ...room.game,
      phase: "PLAYING",
      calledCard: payload.card,
      hiddenPartner: cardHolder,
      partnerRevealed: cardHolder === room.game.declarer,
      currentTurn: room.game.declarer ? getNextPlayer(room.game.declarer) : room.game.currentTurn,
    };

    emitRoomState(room);
  });

  socket.on("play-card", (payload: PlayCardPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (!seat || seat !== room.game.currentTurn) {
      socket.emit("error-message", "It is not your turn.");
      return;
    }

    if (room.game.phase !== "PLAYING") {
      socket.emit("error-message", "You cannot play a card right now.");
      return;
    }

    const hand = room.game.hands[seat];
    const ownsCard = hand.some((card) => sameCard(card, payload.card));

    if (!ownsCard) {
      socket.emit("error-message", "You do not have that card.");
      return;
    }

    if (!canPlayCard(hand, room.game.currentTrick, payload.card)) {
      socket.emit("error-message", "Illegal move: you must follow suit.");
      return;
    }

    if (!canLeadCard(room.game, hand, payload.card)) {
      socket.emit("error-message", "Trump cannot be led until trump has been broken.");
      return;
    }

    const newPlay: Play = { player: seat, card: payload.card };
    const updatedTrick = [...room.game.currentTrick, newPlay];
    const updatedHands = {
      ...room.game.hands,
      [seat]: sortHand(removeCardFromHand(room.game.hands[seat], payload.card)),
    };
    const updatedPartnerRevealed =
      room.game.partnerRevealed ||
      (!!room.game.calledCard && sameCard(room.game.calledCard, payload.card));

    if (updatedTrick.length === 4) {
      const trump = room.game.contract?.trump ?? "NT";
      const winningPlay = determineTrickWinner(updatedTrick, trump);
      const winner = winningPlay.player;
      const updatedCompletedTricks = [...room.game.completedTricks, updatedTrick];
      const updatedTricksWon = {
        ...room.game.tricksWon,
        [winner]: room.game.tricksWon[winner] + 1,
      };
      const isRoundComplete = updatedCompletedTricks.length === 13;

      room.game = {
        ...room.game,
        phase: isRoundComplete ? "SCORING" : "PLAYING",
        hands: updatedHands,
        currentTrick: [],
        completedTricks: updatedCompletedTricks,
        currentTurn: winner,
        tricksWon: updatedTricksWon,
        partnerRevealed: isRoundComplete ? true : updatedPartnerRevealed,
      };

      if (isRoundComplete) {
        scoreCompletedRound(room);
      }

      emitRoomState(room);
      return;
    }

    room.game = {
      ...room.game,
      hands: updatedHands,
      currentTrick: updatedTrick,
      currentTurn: getNextPlayer(seat),
      partnerRevealed: updatedPartnerRevealed,
    };

    emitRoomState(room);
  });

  socket.on("reset-game", (payload: RoomActionPayload) => {
    const room = getRoomOrError(payload.roomCode, socket.id);

    if (!room) {
      return;
    }

    const seat = getSeatBySocketId(room, socket.id);

    if (seat !== "N") {
      socket.emit("error-message", "Only player N can reset the game.");
      return;
    }

    room.game = createNewGame();
    room.roundScored = false;
    emitRoomState(room);
  });

  socket.on("disconnect", (reason) => {
    console.log("disconnected:", socket.id, reason);

    for (const room of Object.values(rooms)) {
      for (const seat of playerSeats) {
        if (room.players[seat] === socket.id) {
          const timerKey = getDisconnectTimerKey(room.roomCode, seat);

          if (disconnectTimers[timerKey]) {
            clearTimeout(disconnectTimers[timerKey]);
          }

          disconnectTimers[timerKey] = setTimeout(() => {
            if (room.players[seat] === socket.id) {
              room.players[seat] = null;
              emitRoomState(room);
            }

            delete disconnectTimers[timerKey];
          }, 30000);
        }
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 3001;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Socket server running on port ${PORT}`);
});