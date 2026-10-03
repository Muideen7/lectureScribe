"use client";

import { useState } from "react";

export interface Flashcard {
  question: string;
  answer: string;
}

interface FlashcardsProps {
  cards: Flashcard[];
}

/**
 * Tap-to-flip revision cards.
 *
 * Both faces occupy the same grid cell (see `.flashcard-inner` in globals.css)
 * so the card grows to fit its longer side instead of clipping the answer.
 */
export default function Flashcards({ cards }: FlashcardsProps) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  function toggleCard(index: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  if (cards.length === 0) {
    return <p className="text-sm text-zinc-400">No flashcards.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((card, i) => {
          const isFlipped = flipped.has(i);
          return (
            <button
              key={`${card.question}-${i}`}
              type="button"
              onClick={() => toggleCard(i)}
              aria-pressed={isFlipped}
              aria-label={`Flashcard ${i + 1} of ${cards.length}: ${card.question}. Activate to ${isFlipped ? "show question" : "show answer"}.`}
              className="flashcard w-full cursor-pointer text-left"
            >
              <span
                className="flashcard-inner"
                data-flipped={isFlipped ? "true" : undefined}
              >
                <span className="flashcard-front text-sm font-medium">
                  {card.question}
                </span>
                <span className="flashcard-back text-sm">{card.answer}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-400">Tap a card to flip it.</p>
    </>
  );
}
