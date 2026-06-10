/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

import { createDeck, dealCards, shuffleDeck } from "./game/deck";
import type { Card, GameState, Play, PlayerId, Trump } from "./game/types";

const socket = io("http://localhost:3001", {
  autoConnect: false,
});

const savedRoomCodeKey = "sg-bridge-room-code";
const savedPlayerTokenKey = "sg-bridge-player-token";

const players: PlayerId[] = ["N", "E", "S", "W"];

const defaultPartner: PlayerId = "S";
const trumpOptions: Trump[] = ["C", "D", "H", "S", "NT"];
const bidLevelOptions = [1, 2, 3, 4, 5, 6, 7];
const rankOptions: Card["rank"][] = [
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
const callSuitOptions: Card["suit"][] = ["C", "D", "H", "S"];

const defaultContractLevel = 1;


type RoomSnapshot = {
  roomCode: string;
  players: Record<PlayerId, string | null>;
  cumulativeScores: Record<PlayerId, number>;
};

type RoomJoinedPayload = {
  room: RoomSnapshot;
  seat: PlayerId;
  playerToken: string;
};

function createNewGame(): GameState {
  const deck = shuffleDeck(createDeck());
  const hands = dealCards(deck);

  return {
    phase: "BIDDING",
    players,
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

function formatCard(card: Card): string {
  const suitSymbol: Record<Card["suit"], string> = {
    S: "♠",
    H: "♥",
    D: "♦",
    C: "♣",
  };

  return `${card.rank}${suitSymbol[card.suit]}`;
}

function renderCardFace(card: Card) {
  const suitSymbol: Record<Card["suit"], string> = {
    S: "♠",
    H: "♥",
    D: "♦",
    C: "♣",
  };

  return (
    <div className={`large-card-face ${card.suit}`}>
      <div className="large-card-corner large-card-corner-top">
        <span>{card.rank}</span>
        <span>{suitSymbol[card.suit]}</span>
      </div>

      <div className="large-card-center">{suitSymbol[card.suit]}</div>

      <div className="large-card-corner large-card-corner-bottom">
        <span>{card.rank}</span>
        <span>{suitSymbol[card.suit]}</span>
      </div>
    </div>
  );
}

function formatTrump(trump: Trump): string {
  const trumpName: Record<Trump, string> = {
    C: "♣",
    D: "♦",
    H: "♥",
    S: "♠",
    NT: "NT",
  };

  return trumpName[trump];
}

function sortCardsForDisplay(cards: Card[]): Card[] {
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

  return [...cards].sort((a, b) => {
    const suitDifference = suitSortOrder[a.suit] - suitSortOrder[b.suit];

    if (suitDifference !== 0) {
      return suitDifference;
    }

    return rankSortOrder[a.rank] - rankSortOrder[b.rank];
  });
}


function groupCardsBySuit(cards: Card[]): Array<{ suit: Card["suit"]; cards: Card[] }> {
  const sortedCards = sortCardsForDisplay(cards);
  const suits: Card["suit"][] = ["C", "D", "H", "S"];

  return suits
    .map((suit) => ({
      suit,
      cards: sortedCards.filter((card) => card.suit === suit),
    }))
    .filter((group) => group.cards.length > 0);
}

function getRotationFromPlayer(player: PlayerId): PlayerId[] {
  const clockwiseOrder: PlayerId[] = ["N", "E", "S", "W"];
  const startIndex = clockwiseOrder.indexOf(player);

  return [
    clockwiseOrder[startIndex],
    clockwiseOrder[(startIndex + 1) % clockwiseOrder.length],
    clockwiseOrder[(startIndex + 2) % clockwiseOrder.length],
    clockwiseOrder[(startIndex + 3) % clockwiseOrder.length],
  ];
}

function getCurrentActionText(game: GameState): string {
  if (game.phase === "BIDDING") {
    return `Player ${game.currentTurn} to bid or pass`;
  }

  if (game.phase === "CALLING_PARTNER") {
    return `Player ${game.currentTurn} to call partner`;
  }

  if (game.phase === "PLAYING") {
    return `Player ${game.currentTurn} to play a card`;
  }

  if (game.phase === "SCORING") {
    return "Game complete";
  }

  if (game.phase === "WAITING_FOR_PLAYERS") {
    return "Waiting for players";
  }

  return `Current action: Player ${game.currentTurn}`;
}

function getDeclarerTargetSets(contractLevel: number): number {
  return 6 + contractLevel;
}

function getOpponentTargetSets(declarerTargetSets: number): number {
  return 14 - declarerTargetSets;
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


function isRoomFull(room: RoomSnapshot): boolean {
  return players.every((player) => room.players[player]);
}

export default function App() {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [mySeat, setMySeat] = useState<PlayerId | null>(null);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const [game, setGame] = useState<GameState>(() => createNewGame());
  const [latestBidAction, setLatestBidAction] = useState<string | null>(null);
  const previousCardsPlayedRef = useRef(0);
  const previousCompletedTricksRef = useRef(0);
  const previousJoinedPlayersRef = useRef(0);
  const previousBidSignatureRef = useRef<string | null>(null);
  const previousPassCountRef = useRef(0);
  const previousPhaseRef = useRef<GameState["phase"]>(game.phase);
  const trumpAnnouncedRef = useRef(false);

  function playTone(frequency: number, durationMs: number, volume = 0.08) {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + durationMs / 1000
    );

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationMs / 1000);
  }

  function playCardSound() {
    playTone(520, 90, 0.06);
  }

  function playSetSound() {
    playTone(320, 120, 0.07);

    window.setTimeout(() => {
      playTone(620, 160, 0.07);
    }, 120);
  }

  function playJoinSound() {
    playTone(440, 80, 0.055);

    window.setTimeout(() => {
      playTone(660, 90, 0.055);
    }, 85);
  }

  function playBidSound() {
    playTone(740, 85, 0.06);

    window.setTimeout(() => {
      playTone(880, 95, 0.055);
    }, 80);
  }

  function playPassSound() {
    playTone(360, 80, 0.055);

    window.setTimeout(() => {
      playTone(260, 90, 0.05);
    }, 80);
  }

  function playGameStartSound() {
    playTone(330, 110, 0.065);

    window.setTimeout(() => {
      playTone(495, 120, 0.065);
    }, 110);

    window.setTimeout(() => {
      playTone(660, 150, 0.065);
    }, 230);
  }

  function playTrumpAnnouncementSound() {
    playTone(260, 140, 0.055);

    window.setTimeout(() => {
      playTone(520, 180, 0.055);
    }, 145);
  }

  function speakTrumpSuit(trumpSuit: Trump) {
    if (!("speechSynthesis" in window)) {
      return;
    }

    const trumpName: Record<Trump, string> = {
      C: "clubs",
      D: "diamonds",
      H: "hearts",
      S: "spades",
      NT: "no trump",
    };

    window.speechSynthesis.cancel();

    const message = new SpeechSynthesisUtterance(
      `Trump suit is ${trumpName[trumpSuit]}`
    );
    message.rate = 0.95;
    message.pitch = 1;
    message.volume = 0.8;

    window.speechSynthesis.speak(message);
  }

  useEffect(() => {
    socket.on("room-joined", (payload: RoomJoinedPayload) => {
      setRoom(payload.room);
      setMySeat(payload.seat);
      setOnlineError("");
      sessionStorage.setItem(savedRoomCodeKey, payload.room.roomCode);
      sessionStorage.setItem(savedPlayerTokenKey, payload.playerToken);
    });

    socket.on("room-updated", (updatedRoom: RoomSnapshot) => {
      setRoom(updatedRoom);
    });

    socket.on("game-updated", (updatedGame: GameState) => {
      setGame(updatedGame);
    });

    socket.on("error-message", (message: string) => {
      setOnlineError(message);
    });

    socket.on("connect_error", () => {
      setOnlineError("Cannot connect to game server. Run npm run server first.");
    });

    const savedRoomCode = sessionStorage.getItem(savedRoomCodeKey);
    const savedPlayerToken = sessionStorage.getItem(savedPlayerTokenKey);

    if (savedRoomCode && savedPlayerToken) {
      if (!socket.connected) {
        socket.connect();
      }

      socket.emit("resume-room", {
        roomCode: savedRoomCode,
        playerToken: savedPlayerToken,
      });
    }

    return () => {
      socket.off("room-joined");
      socket.off("room-updated");
      socket.off("game-updated");
      socket.off("error-message");
      socket.off("connect_error");
    };
  }, []);

  useEffect(() => {
    const cardsPlayed =
      game.completedTricks.length * 4 + game.currentTrick.length;
    const completedTricks = game.completedTricks.length;

    if (cardsPlayed > previousCardsPlayedRef.current) {
      playCardSound();
    }

    if (completedTricks > previousCompletedTricksRef.current) {
      playSetSound();
    }

    previousCardsPlayedRef.current = cardsPlayed;
    previousCompletedTricksRef.current = completedTricks;
  }, [game.currentTrick.length, game.completedTricks.length]);

  useEffect(() => {
    if (!room) {
      previousJoinedPlayersRef.current = 0;
      return;
    }

    const joinedPlayers = players.filter((player) => room.players[player]).length;

    if (joinedPlayers > previousJoinedPlayersRef.current) {
      playJoinSound();
    }

    previousJoinedPlayersRef.current = joinedPlayers;
  }, [room?.players.N, room?.players.E, room?.players.S, room?.players.W]);

  useEffect(() => {
    const latestBid = game.bids[game.bids.length - 1];

    if (!latestBid) {
      previousBidSignatureRef.current = null;
      return;
    }

    const latestBidSignature = `${game.bids.length}-${latestBid.player}-${latestBid.tricks}-${latestBid.trump}`;

    if (latestBidSignature !== previousBidSignatureRef.current) {
      playBidSound();
      setLatestBidAction(
        `Player ${latestBid.player} bid ${latestBid.tricks} ${formatTrump(latestBid.trump)}`
      );
      previousBidSignatureRef.current = latestBidSignature;
    }
  }, [game.bids]);

  useEffect(() => {
    if (game.consecutivePasses > previousPassCountRef.current) {
      playPassSound();
      setLatestBidAction(`Player ${game.currentTurn} passed`);
    }

    previousPassCountRef.current = game.consecutivePasses;
  }, [game.consecutivePasses]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;

    if (previousPhase === "WAITING_FOR_PLAYERS" && game.phase === "BIDDING") {
      playGameStartSound();
    }

    if (game.phase === "PLAYING") {
      if (!trumpAnnouncedRef.current && game.contract) {
        playTrumpAnnouncementSound();
        speakTrumpSuit(game.contract.trump);
        trumpAnnouncedRef.current = true;
      }
    } else {
      trumpAnnouncedRef.current = false;
    }

    previousPhaseRef.current = game.phase;
  }, [game.phase, game.contract]);

  const highestBid = getHighestBid(game.bids);
  const trump = game.contract?.trump ?? highestBid?.trump ?? "NT";
  const declarer = game.declarer ?? highestBid?.player ?? "N";
  const partner = game.hiddenPartner ?? defaultPartner;
  const contractLevel =
    game.contract?.tricks ?? highestBid?.tricks ?? defaultContractLevel;
  const contractTricks = getDeclarerTargetSets(contractLevel);
  const opponentTargetSets = getOpponentTargetSets(contractTricks);
  const isRoundOver = game.completedTricks.length === 13;
  const declarerTeamTricks = game.tricksWon[declarer] + game.tricksWon[partner];
  const declarerSucceeded = declarerTeamTricks >= contractTricks;
  const scoreChange = calculateScoreChange({
    players: game.players,
    declarer,
    partner,
    declarerSucceeded,
  });
  const cumulativeScores = room?.cumulativeScores ?? {
    N: 0,
    E: 0,
    S: 0,
    W: 0,
  };
  const highestVisibleScore = Math.max(
    ...game.players.map((player) => cumulativeScores[player])
  );
  const canSeeScores = mySeat !== null && cumulativeScores[mySeat] === highestVisibleScore;
  const rotation = getRotationFromPlayer(game.currentTurn);
  const currentActionText = getCurrentActionText(game);

  function createRoom() {
    sessionStorage.removeItem(savedRoomCodeKey);
    sessionStorage.removeItem(savedPlayerTokenKey);
    setOnlineError("");

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("create-room");
  }

  function joinRoom() {
    const cleanedRoomCode = joinRoomCode.trim().toUpperCase();

    if (!cleanedRoomCode) {
      setOnlineError("Enter a room code first.");
      return;
    }

    sessionStorage.removeItem(savedRoomCodeKey);
    sessionStorage.removeItem(savedPlayerTokenKey);
    setOnlineError("");

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join-room", cleanedRoomCode);
  }

  function startGame() {
    if (!room) {
      return;
    }

    socket.emit("start-game", {
      roomCode: room.roomCode,
    });
  }

  function leaveRoom() {
    sessionStorage.removeItem(savedRoomCodeKey);
    sessionStorage.removeItem(savedPlayerTokenKey);
    setRoom(null);
    setMySeat(null);
    setOnlineError("");
    setJoinRoomCode("");
    setGame(createNewGame());
    setLatestBidAction(null);

    if (socket.connected) {
      socket.disconnect();
    }
  }

  function makeBid(contractLevel: number, trump: Trump) {
    if (!room) {
      return;
    }

    socket.emit("make-bid", {
      roomCode: room.roomCode,
      contractLevel,
      trump,
    });
  }

  function passBid() {
    if (!room) {
      return;
    }

    socket.emit("pass-bid", {
      roomCode: room.roomCode,
    });
  }

  function callTeammate(card: Card) {
    if (!room) {
      return;
    }

    socket.emit("call-card", {
      roomCode: room.roomCode,
      card,
    });
  }


  function playCard(player: PlayerId, card: Card) {
    if (!room) {
      return;
    }

    if (player !== mySeat) {
      alert("You can only play your own cards.");
      return;
    }

    socket.emit("play-card", {
      roomCode: room.roomCode,
      card,
    });
  }

  function resetGame() {
    if (!room) {
      setGame(createNewGame());
      return;
    }

    socket.emit("reset-game", {
      roomCode: room.roomCode,
    });
  }

  if (!room) {
    return (
      <div className="app">
        <h1>Singaporean Bridge Online</h1>

        <div className="bidding-panel">
          <h2>Join a Room</h2>
          <p>Create a room, then share the code with 3 other players.</p>

          <button className="pass-button" onClick={createRoom}>
            Create Room
          </button>

          <div className="join-room-row">
            <input
              value={joinRoomCode}
              onChange={(event) => setJoinRoomCode(event.target.value)}
              placeholder="Room code"
              className="room-code-input"
            />
            <button className="pass-button" onClick={joinRoom}>
              Join Room
            </button>
          </div>

          {onlineError && <p className="error-text">{onlineError}</p>}
        </div>
      </div>
    );
  }

  const roomReady = isRoomFull(room);

  return (
    <div className="app">
      <h1>Singaporean Bridge Online</h1>

      <div className="bidding-panel">
        <h2>Room {room.roomCode}</h2>
        <div className="room-actions">
          <p>Your seat: {mySeat}</p>
          <button className="leave-button" onClick={leaveRoom}>
            Leave Room
          </button>
        </div>
        <div className="score-grid">
          {players.map((player) => (
            <div key={player} className="score-row">
              {player}: {room.players[player] ? "Joined" : "Waiting"}
            </div>
          ))}
        </div>
        {!roomReady && <p>Waiting for 4 players before starting.</p>}
        {roomReady && game.phase === "WAITING_FOR_PLAYERS" && mySeat === "N" && (
          <button className="pass-button" onClick={startGame}>
            Start Game
          </button>
        )}
        {roomReady && game.phase === "WAITING_FOR_PLAYERS" && mySeat !== "N" && (
          <p>Waiting for player N to start the game.</p>
        )}
        {onlineError && <p className="error-text">{onlineError}</p>}
      </div>

      {roomReady && game.phase !== "WAITING_FOR_PLAYERS" && (
        <>
          <div className="top-bar">
            <div>Phase: {game.phase}</div>
            <div>
              Contract:{" "}
              {highestBid
                ? `${contractLevel} ${formatTrump(
                    trump
                  )} — declarer needs ${contractTricks} sets, opponents need ${opponentTargetSets}`
                : "No bid yet"}
            </div>
            <div>Declarer: {game.declarer ?? "Not decided"}</div>
            <div>
              Partner:{" "}
              {game.partnerRevealed
                ? game.hiddenPartner ?? "None"
                : game.calledCard
                ? "Hidden"
                : "Not called"}
            </div>
            <div>
              Called card: {game.calledCard ? formatCard(game.calledCard) : "None"}
            </div>
            {game.phase === "PLAYING" && game.currentTrick.length === 0 && game.contract && (
              <div className="trump-announcement">
                Trump suit: {formatTrump(game.contract.trump)}
              </div>
            )}
            <div>Current player: {game.currentTurn}</div>
            <button onClick={resetGame}>New Game</button>
          </div>

          <div className="current-action-banner">
            <span className="current-action-label">Current action</span>
            <strong>{currentActionText}</strong>
          </div>

          {game.phase === "BIDDING" && (
            <div className="bidding-panel">
              <h2>Bidding</h2>
              <p>
                Current highest bid:{" "}
                {highestBid
                  ? `${highestBid.player} bid ${highestBid.tricks} ${formatTrump(
                      highestBid.trump
                    )}`
                  : "None"}
              </p>
              <p>Consecutive passes: {game.consecutivePasses}</p>

              {latestBidAction && (
                <div className="latest-bid-banner">
                  <span className="latest-bid-label">Latest action</span>
                  <strong>{latestBidAction}</strong>
                </div>
              )}

              <div className="bid-table">
                <div className="bid-header-spacer" />
                {bidLevelOptions.map((contractLevel) => (
                  <div key={contractLevel} className="bid-level-header">
                    {contractLevel}
                  </div>
                ))}

                {trumpOptions.map((bidTrump) => (
                  <div className="bid-row" key={bidTrump}>
                    <div className={`bid-suit-label suit-${bidTrump}`}>
                      {formatTrump(bidTrump)}
                    </div>

                    {bidLevelOptions.map((contractLevel) => {
                      const legal = isBidHigherThanCurrentBid(
                        contractLevel,
                        bidTrump,
                        highestBid
                      );
                      const declarerTarget = getDeclarerTargetSets(contractLevel);
                      const opponentTarget = getOpponentTargetSets(declarerTarget);

                      return (
                        <button
                          key={`${contractLevel}-${bidTrump}`}
                          className={`bid-button suit-${bidTrump}`}
                          disabled={!legal || game.currentTurn !== mySeat}
                          title={`Declarer needs ${declarerTarget} sets. Opponents need ${opponentTarget} sets.`}
                          onClick={() => makeBid(contractLevel, bidTrump)}
                        >
                          {contractLevel}
                          {formatTrump(bidTrump)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <button
                className="pass-button"
                disabled={game.currentTurn !== mySeat}
                onClick={passBid}
              >
                Pass
              </button>

              <div className="bid-history">
                <h3>Bid History</h3>
                {game.bids.length === 0 ? (
                  <p>No bids yet.</p>
                ) : (
                  game.bids.map((bid, index) => (
                    <div
                      key={`${bid.player}-${bid.tricks}-${bid.trump}-${index}`}
                      className={index === game.bids.length - 1 ? "bid-history-latest" : ""}
                    >
                      {bid.player}: {bid.tricks} {formatTrump(bid.trump)}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {game.phase === "CALLING_PARTNER" && (
            <div className="calling-panel">
              <h2>Call Teammate</h2>
              <p>
                Declarer {game.declarer} calls one card. The player holding that
                card becomes the hidden partner.
              </p>

              <div className="call-table">
                <div className="call-header-spacer" />
                {rankOptions.map((rank) => (
                  <div key={rank} className="call-rank-header">
                    {rank}
                  </div>
                ))}

                {callSuitOptions.map((suit) => (
                  <div key={suit} className="call-row">
                    <div className={`call-suit-label suit-${suit}`}>
                      {formatTrump(suit)}
                    </div>

                    {rankOptions.map((rank) => {
                      const card: Card = { rank, suit };

                      return (
                        <button
                          key={`${rank}-${suit}`}
                          className={`call-button suit-${suit}`}
                          disabled={game.declarer !== mySeat}
                          onClick={() => callTeammate(card)}
                        >
                          {rank}
                          {formatTrump(suit)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="game-board">

            <div className="center-table-area">
              <div className="rotation-center">
                <h2>Turn Rotation</h2>
                <div className="rotation-flow">
                  {rotation.map((player, index) => (
                    <div
                      key={player}
                      className={`rotation-seat ${
                        player === game.currentTurn ? "rotation-seat-active" : ""
                      }`}
                    >
                      <span>{player}</span>
                      {player === game.currentTurn && (
                        <small className="rotation-action-chip">Now</small>
                      )}
                      {index < rotation.length - 1 && <strong>→</strong>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="current-trick current-trick-center">
                <h2>Current Trick</h2>
                {game.currentTrick.length === 0 ? (
                  <p>No cards played yet.</p>
                ) : (
                  <div className="played-cards">
                    {game.currentTrick.map((play) => (
                      <div key={play.player} className="played-card-large">
                        <div className="played-card-player">Player {play.player}</div>
                        {renderCardFace(play.card)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {mySeat && (
              <div
                className={`player-panel own-player-panel ${
                  mySeat === game.currentTurn ? "active-player" : ""
                }`}
              >
                <h2>Your Hand · Player {mySeat}</h2>
                <p>Tricks won: {game.tricksWon[mySeat]}</p>

                <div className="hand own-hand">
                  {groupCardsBySuit(game.hands[mySeat]).map((group) => (
                    <div key={group.suit} className="suit-group">
                      <span className={`suit-group-label suit-${group.suit}`}>
                        {formatTrump(group.suit)}
                      </span>

                      {group.cards.map((card) => {
                        const legal = canPlayCard(
                          game.hands[mySeat],
                          game.currentTrick,
                          card
                        );

                        return (
                          <button
                            key={`${card.rank}-${card.suit}`}
                            className={`card hand-card ${card.suit} ${
                              mySeat === game.currentTurn && legal ? "legal" : ""
                            }`}
                            disabled={
                              game.phase !== "PLAYING" ||
                              mySeat !== game.currentTurn ||
                              isRoundOver
                            }
                            onClick={() => playCard(mySeat, card)}
                          >
                            <span className="hand-card-rank">{card.rank}</span>
                            <span className="hand-card-suit">{formatTrump(card.suit)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isRoundOver && (
            <div className="current-trick">
              <h2>Round Result</h2>
              <p>
                Declarer team sets: {declarerTeamTricks} / {contractTricks}
              </p>
              <p>Opponents need: {opponentTargetSets} sets</p>
              <p>
                {declarerSucceeded ? "Contract succeeded" : "Contract failed"}
              </p>

              <h3>Game Score Change</h3>
              <div className="score-grid">
                {game.players.map((player) => (
                  <div key={player} className="score-row">
                    Player {player}: {scoreChange[player] > 0 ? "+" : ""}
                    {scoreChange[player]}
                  </div>
                ))}
              </div>

              <h3>Total Score</h3>
              {canSeeScores ? (
                <div className="score-grid">
                  {game.players.map((player) => (
                    <div key={player} className="score-row">
                      Player {player}: {cumulativeScores[player] > 0 ? "+" : ""}
                      {cumulativeScores[player]}
                    </div>
                  ))}
                </div>
              ) : (
                <p>Only the current highest-scoring player can see the total scores.</p>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}