export default function PortalLoading() {
  return (
    <section data-portal-loading aria-busy="true" aria-label="Loading page">
      <p role="status">Opening section…</p>
      <div aria-hidden="true" style={{ display: "grid", gap: 20, paddingTop: 16 }}>
        <div style={{ height: 36, width: "65%", borderRadius: 8, background: "#e3eaf2" }} />
        <div style={{ height: 180, borderRadius: 12, background: "#e3eaf2" }} />
        <div style={{ height: 100, borderRadius: 12, background: "#e3eaf2" }} />
      </div>
    </section>
  );
}
