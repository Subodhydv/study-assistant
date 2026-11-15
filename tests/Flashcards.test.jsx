import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Flashcards from '../src/components/Flashcards.jsx';

const cards = [
  { id: 'c1', front: 'Front one', back: 'Back one' },
  { id: 'c2', front: 'Front two', back: 'Back two' },
];

describe('Flashcards', () => {
  it('flips, marks, and offers a review of cards still to learn', async () => {
    const user = userEvent.setup();
    render(<Flashcards cards={cards} />);

    const card = screen.getByRole('button', { name: /Question: Front one/ });
    await user.click(card);
    expect(screen.getByRole('button', { name: /Answer: Back one/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Got it/ }));
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Still learning/ }));

    expect(screen.getByText('End of the deck.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review the 1 still to learn' }));
    expect(screen.getByRole('button', { name: /Question: Front two/ })).toBeInTheDocument();
    expect(screen.getByText('Card 1 of 1')).toBeInTheDocument();
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    render(<Flashcards cards={cards} />);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: /Question: Front two/ })).toBeInTheDocument();
  });
});
