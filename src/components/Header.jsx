import { IconMoon, IconStack, IconSun } from './Icons.jsx';

export default function Header({ theme, onToggleTheme, savedCount, onOpenSaved, onHome }) {
  const brand = (
    <>
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">Cue Cards</span>
    </>
  );
  return (
    <header className="header">
      {onHome ? (
        <button type="button" className="brand brand-button" onClick={onHome} title="Start a new set">
          {brand}
        </button>
      ) : (
        <span className="brand">{brand}</span>
      )}
      <nav className="header-actions" aria-label="App">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onOpenSaved}
          aria-label={savedCount > 0 ? `Saved sets (${savedCount})` : 'Saved sets'}
        >
          <IconStack />
          <span>Saved sets</span>
          {savedCount > 0 && <span className="count-pill">{savedCount}</span>}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </nav>
    </header>
  );
}
