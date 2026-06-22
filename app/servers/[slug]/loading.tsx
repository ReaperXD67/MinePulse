export default function ServerProfileLoading() {
  return (
    <main className="server-profile-page" aria-busy="true" aria-label="Loading server profile">
      <div className="skeleton skeleton-profile-hero" />
      <div className="container profile-content-grid">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    </main>
  );
}
