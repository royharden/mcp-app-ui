/** Evidence panel: claim-to-case map from docs/SECURITY.md. Every case is pending until it runs. */
const CASES: Array<[string, string]> = [
  ["DOMAIN-01", "Read semantics match independent answers"],
  ["DEC-01..04", "Atomic, one-time, statement-bound decisions"],
  ["MCP-01", "Five tools, visibility, one UI link, exact resource"],
  ["MCP-02", "stdio subprocess, protocol-only stdout"],
  ["SEC-01", "Untrusted text stays inert and delimited"],
  ["SEC-02", "ui/message carries only id + decision"],
  ["SEC-03", "Visibility is host policy, not proof of a human"],
  ["SEC-04..07", "Nonce effects, exact bundle, host gates, CSP envelope"],
  ["BROWSER-01", "Real-browser sandbox and CSP"],
  ["HOST-01", "Named host journey over local stdio"],
];

export function Evidence() {
  return (
    <section className="panel" aria-labelledby="evidence-heading">
      <h2 id="evidence-heading">Evidence</h2>
      <p className="muted small">
        Layers: source inspected → SDK simulation → exact bundle in DOM → reference browser → named host. Written tests
        never count as passed.
      </p>
      <table>
        <tbody>
          {CASES.map(([id, claim]) => (
            <tr key={id}>
              <td>{id}</td>
              <td>{claim}</td>
              <td>pending</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
