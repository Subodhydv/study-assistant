import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Quiz from '../src/components/Quiz.jsx';

const questions = [
  { id: 'q1', question: 'Capital of France?', options: ['Paris', 'Rome'], answerIndex: 0, explanation: 'Paris.' },
  { id: 'q2', question: 'Largest planet?', options: ['Mars', 'Jupiter'], answerIndex: 1, explanation: 'Jupiter.' },
  { id: 'q3', question: 'H2O is?', options: ['Water', 'Salt'], answerIndex: 0, explanation: 'Water.' },
];

const option = (name) => screen.getByRole('button', { name: new RegExp(`^[A-F]?\\s*${name}`) });

describe('Quiz', () => {
  it('scores answers and retests only the wrong ones', async () => {
    const user = userEvent.setup();
    render(<Quiz questions={questions} />);

    await user.click(option('Paris')); // right
    expect(screen.getByText('Correct.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));

    await user.click(option('Mars')); // wrong
    expect(screen.getByText(/Not quite. The answer is B/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next question' }));

    await user.click(option('Salt')); // wrong
    await user.click(screen.getByRole('button', { name: 'See results' }));

    expect(screen.getByText('2 to go over again.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retest the 2 you missed' }));

    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByText('Capital of France?')).not.toBeInTheDocument();
  });

  it('supports answering with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Quiz questions={questions} />);
    await user.keyboard('a');
    expect(screen.getByText('Correct.')).toBeInTheDocument();
  });

  it('cannot change an answer once given', async () => {
    const user = userEvent.setup();
    render(<Quiz questions={questions} />);
    await user.click(option('Rome'));
    await user.click(option('Paris'));
    expect(screen.getByText(/Not quite/)).toBeInTheDocument();
  });
});
