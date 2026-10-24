import tasks from "../../measure/tasks.v1.json";

/** Comparison panel. Shows the task definitions only: no run has been observed yet. */
export function Measure() {
  return (
    <section className="panel" aria-labelledby="measure-heading">
      <h2 id="measure-heading">UI versus text comparison</h2>
      <p className="muted small">
        Results: <strong>pending</strong>. No observed runs exist, so no numbers or winners are shown. Both modes use the
        same server, data, filters and formatting. Characters are not tokens; wall time comes only from real runs.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Question</th>
            <th scope="col">Text plan</th>
            <th scope="col">UI plan</th>
          </tr>
        </thead>
        <tbody>
          {tasks.readTasks.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.question}</td>
              <td>{t.text.calls.map((c) => c.tool).join(", ")}</td>
              <td>{t.ui.actions.length === 0 ? "read launch view" : t.ui.actions.map((a) => a.do).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Policy demonstrations (reported separately)</h3>
      <ul>
        {tasks.policyDemonstrations.map((d) => (
          <li key={d.id}>
            {d.id}: {d.description} Text mode: {d.textPolicy}
          </li>
        ))}
      </ul>
    </section>
  );
}
