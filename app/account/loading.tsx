export default function AccountLoading() {
  return (
    <main className="container dashboard" aria-busy="true" aria-label="Loading account">
      <div className="skeleton skeleton-title" />
      <div className="metrics-row">
        {Array.from({ length: 4 }).map((_, index) => <div className="skeleton skeleton-metric" key={index} />)}
      </div>
      <div className="dashboard-grid">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    </main>
  );
}
