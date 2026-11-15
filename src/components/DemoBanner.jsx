export default function DemoBanner({ health }) {
  if (health.status === 'down') {
    return (
      <p className="banner banner-bad" role="alert">
        Can&apos;t reach the app server. Make sure <code>npm start</code> is running, then reload.
      </p>
    );
  }
  if (health.status !== 'ok') return null;
  if (health.demo) {
    return (
      <p className="banner">
        <strong>Demo mode.</strong> Answers come from an offline stand-in model, so cards are rough.
        Add an API key to <code>.env</code> and restart for real results.
      </p>
    );
  }
  return null;
}
