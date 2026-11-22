export default function Loading() {
  return (
    <div className="container" style={{ padding: '32px 16px' }} aria-busy="true" aria-label="Loading">
      <div className="skel" style={{ height: 32, width: 200, marginBottom: 20 }} />
      <div className="grid cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="skel" style={{ aspectRatio: '1' }} />
            <div className="skel" style={{ height: 14, width: '70%', marginTop: 10 }} />
            <div className="skel" style={{ height: 14, width: '40%', marginTop: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
