export interface HostSimulation {
  id: string;
  theme: "light" | "dark";
  displayMode: "inline" | "fullscreen";
  locale: string;
}

export const HOST_SIMULATIONS: HostSimulation[] = [
  { id: "light-inline", theme: "light", displayMode: "inline", locale: "en-US" },
  { id: "dark-fullscreen", theme: "dark", displayMode: "fullscreen", locale: "en-US" },
];

export function simulationById(id: string): HostSimulation | undefined {
  return HOST_SIMULATIONS.find((simulation) => simulation.id === id);
}
