export interface HowToPlayPage {
    title: string;
    body: string;
}

export const HOW_TO_PLAY_PAGES: HowToPlayPage[] = [
    {
        title: "Step 1",
        body: "Build the four foundation piles from Ace up to King. Each pile must stay in the same suit from start to finish."
    },
    {
        title: "Step 2",
        body: "On the tableau, stack cards in descending order while alternating red and black suits. You can move a face-up card or a valid face-up run."
    },
    {
        title: "Step 3",
        body: "Only Kings can move into an empty tableau column. Uncover face-down cards whenever you can to open more moves."
    },
    {
        title: "Step 4",
        body: "Tap the stock to draw new cards into the waste. Only the top waste card is playable, so plan your stock flips carefully."
    },
    {
        title: "Step 5",
        body: "If you finish a full stock cycle without making a successful move, the run ends when the stock is exhausted."
    }
];
