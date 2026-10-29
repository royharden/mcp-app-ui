// Bridge Lab entry. Not wrapped in StrictMode: the Lab owns real sessions in effects, and the
// StrictMode lifecycle contract is a requirement of the view (view/main.tsx), not of this host.
import { createRoot } from "react-dom/client";
import { LabHost } from "./LabHost.tsx";
import "./lab.css";

const container = document.getElementById("root");
if (container) createRoot(container).render(<LabHost />);
