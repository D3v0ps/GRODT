/**
 * Laddningsskelett för alla vyer i appen – visas omedelbart vid varje
 * navigering medan servern renderar, enligt designsystemets
 * skimmer-mönster (stängs av vid prefers-reduced-motion).
 */
export default function AppLoading() {
  return (
    <section className="view" aria-busy="true" aria-label="Laddar">
      <div className="view-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <span className="skeleton" style={{ width: 180, height: 18 }} />
          <span className="skeleton" style={{ width: 320 }} />
        </div>
      </div>
      <div className="card">
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="skeleton" style={{ width: "45%" }} />
          <span className="skeleton" style={{ width: "92%" }} />
          <span className="skeleton" style={{ width: "88%" }} />
          <span className="skeleton" style={{ width: "95%" }} />
          <span className="skeleton" style={{ width: "70%" }} />
          <span className="skeleton" style={{ width: "90%" }} />
          <span className="skeleton" style={{ width: "60%" }} />
        </div>
      </div>
    </section>
  );
}
