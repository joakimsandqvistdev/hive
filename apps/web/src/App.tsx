import { useEffect, useState } from "react";

type Health = { status: string; database: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "unavailable", database: "unavailable" }));
  }, [apiUrl]);

  return (
    <main className="shell">
      <div className="eyebrow"><span className="bee">✳</span> YOUR PROJECT STARTS HERE</div>
      <h1>Welcome to <em>Hive.</em></h1>
      <p className="intro">Your workspace is ready. A clean foundation for the ideas you’ll build next.</p>
      <section className="status-card">
        <div className="status-heading"><span className="pulse" /> LOCAL DEVELOPMENT</div>
        <div className="service"><span>Web app</span><strong className="online">Running · React + Vite</strong></div>
        <div className="service"><span>API server</span><strong className={health?.status === "ok" ? "online" : "waiting"}>{health?.status === "ok" ? "Connected · Express" : "Waiting · Express"}</strong></div>
        <div className="service"><span>Database</span><strong className={health?.database === "connected" ? "online" : "waiting"}>{health?.database === "connected" ? "Connected · PostgreSQL" : "Start Docker to connect"}</strong></div>
      </section>
      <footer>BUILT TO GROW <span>·</span> NODE · REACT · POSTGRES</footer>
    </main>
  );
}
