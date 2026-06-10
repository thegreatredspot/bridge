console.log("testDeal.ts is running");

import { createDeck, shuffleDeck, dealCards } from "./deck";

const deck = createDeck();
const shuffled = shuffleDeck(deck);
const hands = dealCards(shuffled);

console.log("North:", hands.N);
console.log("East:", hands.E);
console.log("South:", hands.S);
console.log("West:", hands.W);

console.log("North card count:", hands.N.length);
console.log("East card count:", hands.E.length);
console.log("South card count:", hands.S.length);
console.log("West card count:", hands.W.length);