export default function GlobalLoading() {
  return (
    <main className="container dashboard" aria-busy="true" aria-label="Loading KarixMC">
      <div className="skeleton skeleton-title" />
      <div className="metrics-row">
        {Array.from({ length: 4 }).map((_, index) => <div className="skeleton skeleton-metric" key={index} />)}
      </div>
      <div className="server-grid">
        {Array.from({ length: 3 }).map((_, index) => <div className="skeleton skeleton-panel" key={index} />)}
      </div>
    </main>
  );
}
