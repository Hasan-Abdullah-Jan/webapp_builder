export default function Loading() {
  return (
    <div className="content" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 26, width: 220, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: 320, marginBottom: 24 }} />
      <div className="grid grid-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}</div>
      <div className="skeleton" style={{ height: 260, marginTop: 16 }} />
    </div>
  );
}
