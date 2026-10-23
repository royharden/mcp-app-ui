import { recommendedPolicy } from "../domain/securityPolicy.ts";

export function SecurityNote() {
  const policy = recommendedPolicy();
  const frame = policy.sandboxAttribute;

  return (
    <article className="panel prose">
      <h2>Security note</h2>
      <p>
        The iframe is not the trust boundary. A modified view can skip the checkbox. The server still has to
        require a signed-in owner, an unused confirmation token, and the exact statement.
      </p>
      <h3>What the source checks</h3>
      <ul>
        <li>Outer sandbox attribute for the reference policy is <code>{frame}</code>. Same-origin and top navigation are rejected.</li>
        <li>Sandbox origin and host origin must both be http(s) origins, and they must differ.</li>
        <li>The app document CSP is deny-all for default and connect sources. It has no external URL.</li>
        <li>The host bridge drops messages from any source other than the sandbox origin.</li>
        <li>The host bridge does not deliver a view notification before <code>ui/notifications/initialized</code>.</li>
        <li>
          <code>request_decision</code> and <code>commit_decision</code> are app-only. A model audience receives an
          error and the row does not change.
        </li>
        <li>The confirmation token is kept out of the tool&apos;s text fallback. Hosts must not copy app-only structured content into the model transcript.</li>
        <li>The stored HTML stays idle until a sandbox proxy sets <code>mcp-host-origin</code>. The view then posts only to that origin.</li>
        <li>Bolt Database grants no client update on approvals. <code>approval-decision</code> checks the user JWT, then calls security-definer SQL.</li>
      </ul>
      <h3>What has not been executed</h3>
      <ul>
        <li>No browser loaded the iframe, so <code>contentDocument</code> isolation is not observed.</li>
        <li>No migration has been applied, and RLS has not been tried with two users.</li>
        <li>The edge function has not been deployed. Missing-secret and anon-key behavior are specified, not called.</li>
        <li>A real Claude or ChatGPT host has not rendered the resource.</li>
      </ul>
      <p>Details and the later checks are in <code>docs/SECURITY-NOTE.md</code>.</p>
    </article>
  );
}
