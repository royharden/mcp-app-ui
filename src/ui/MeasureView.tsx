import { buildScriptedReport } from "../domain/measure.ts";

export function MeasureView() {
  const report = buildScriptedReport();

  return (
    <article className="panel">
      <h2>UI versus text</h2>
      <p>Three scripted tasks. These numbers are not a model study.</p>
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Fair</th>
            <th>UI</th>
            <th>Text</th>
          </tr>
        </thead>
        <tbody>
          {report.comparisons.map((item) => (
            <tr key={item.taskId}>
              <td>
                {item.taskId}
                <div className="muted">{item.note}</div>
              </td>
              <td>{item.fairComparison ? "yes" : "no"}</td>
              <td>
                {item.ui.success ? "success" : "fail"} · {item.ui.turns} turns · {item.ui.tokensEstimate} tokens
              </td>
              <td>
                {item.text.success ? "success" : "fail"} · {item.text.turns} turns · {item.text.tokensEstimate} tokens
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Limits</h3>
      <ul>
        {report.limits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </article>
  );
}
