import { determineTrickWinner } from "./trick";
import type { Play, PlayerId, Trump } from "./types";

type TrickTestCase = {
  name: string;
  plays: Play[];
  trump: Trump;
  expectedWinner: PlayerId;
};

const testCases: TrickTestCase[] = [
  {
    name: "No trump: highest led suit wins",
    trump: "NT",
    expectedWinner: "E",
    plays: [
      { player: "N", card: { suit: "H", rank: "10" } },
      { player: "E", card: { suit: "H", rank: "A" } },
      { player: "S", card: { suit: "D", rank: "A" } },
      { player: "W", card: { suit: "H", rank: "K" } },
    ],
  },
  {
    name: "Trump beats higher led suit",
    trump: "S",
    expectedWinner: "S",
    plays: [
      { player: "N", card: { suit: "H", rank: "A" } },
      { player: "E", card: { suit: "H", rank: "K" } },
      { player: "S", card: { suit: "S", rank: "2" } },
      { player: "W", card: { suit: "H", rank: "Q" } },
    ],
  },
  {
    name: "Higher trump beats lower trump",
    trump: "S",
    expectedWinner: "W",
    plays: [
      { player: "N", card: { suit: "H", rank: "A" } },
      { player: "E", card: { suit: "S", rank: "2" } },
      { player: "S", card: { suit: "D", rank: "A" } },
      { player: "W", card: { suit: "S", rank: "K" } },
    ],
  },
  {
    name: "Off-suit non-trump cannot win even if rank is high",
    trump: "NT",
    expectedWinner: "N",
    plays: [
      { player: "N", card: { suit: "C", rank: "3" } },
      { player: "E", card: { suit: "D", rank: "A" } },
      { player: "S", card: { suit: "H", rank: "K" } },
      { player: "W", card: { suit: "S", rank: "Q" } },
    ],
  },
  {
    name: "Led suit beats off-suit when no trump appears",
    trump: "S",
    expectedWinner: "W",
    plays: [
      { player: "N", card: { suit: "D", rank: "7" } },
      { player: "E", card: { suit: "C", rank: "A" } },
      { player: "S", card: { suit: "H", rank: "A" } },
      { player: "W", card: { suit: "D", rank: "Q" } },
    ],
  },
  {
    name: "First card wins when everyone plays lower led suit cards",
    trump: "NT",
    expectedWinner: "N",
    plays: [
      { player: "N", card: { suit: "C", rank: "A" } },
      { player: "E", card: { suit: "C", rank: "K" } },
      { player: "S", card: { suit: "C", rank: "Q" } },
      { player: "W", card: { suit: "C", rank: "J" } },
    ],
  },
  {
    name: "Trump led: highest trump wins",
    trump: "H",
    expectedWinner: "S",
    plays: [
      { player: "N", card: { suit: "H", rank: "4" } },
      { player: "E", card: { suit: "H", rank: "10" } },
      { player: "S", card: { suit: "H", rank: "A" } },
      { player: "W", card: { suit: "D", rank: "A" } },
    ],
  },
  {
    name: "Last player can win with trump",
    trump: "D",
    expectedWinner: "W",
    plays: [
      { player: "N", card: { suit: "S", rank: "A" } },
      { player: "E", card: { suit: "S", rank: "K" } },
      { player: "S", card: { suit: "S", rank: "Q" } },
      { player: "W", card: { suit: "D", rank: "2" } },
    ],
  },
];

function formatPlay(play: Play): string {
  return `${play.player}:${play.card.rank}${play.card.suit}`;
}

function runTest(testCase: TrickTestCase): boolean {
  const winningPlay = determineTrickWinner(testCase.plays, testCase.trump);
  const passed = winningPlay.player === testCase.expectedWinner;

  if (passed) {
    console.log(`PASS: ${testCase.name}`);
    return true;
  }

  console.error(`FAIL: ${testCase.name}`);
  console.error(`Trump: ${testCase.trump}`);
  console.error(`Plays: ${testCase.plays.map(formatPlay).join("  ")}`);
  console.error(`Expected winner: ${testCase.expectedWinner}`);
  console.error(`Actual winner: ${winningPlay.player}`);
  return false;
}

let passedCount = 0;

for (const testCase of testCases) {
  if (runTest(testCase)) {
    passedCount += 1;
  }
}

console.log("");
console.log(`${passedCount}/${testCases.length} trick tests passed.`);

if (passedCount !== testCases.length) {
  throw new Error("Some trick tests failed.");
}