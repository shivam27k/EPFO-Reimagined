import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div className="landing-shell">
      <header className="site-masthead" aria-label="EPF Sahayak">
        <Link className="wordmark" href="/" aria-label="EPF Sahayak home">
          <span className="wordmark-mark" aria-hidden="true">ES</span>
          <span>EPF Sahayak</span>
        </Link>
        <span className="prototype-tag">Prototype</span>
      </header>

      <main className="landing-main">
        <section className="landing-intro" aria-labelledby="landing-title">
          <p className="utility-label">Member support, made clearer</p>
          <h1 id="landing-title">Your EPF journey, explained one step at a time.</h1>
          <p className="landing-summary">
            Practise common provident fund tasks in a calm, guided demo built
            around the questions members ask.
          </p>
          <Link className="primary-action" href="/login">
            Enter demo
            <ArrowRight aria-hidden="true" size={20} strokeWidth={2} />
          </Link>
        </section>

        <aside className="prototype-notice" aria-labelledby="prototype-title">
          <div className="notice-rule" aria-hidden="true" />
          <ShieldCheck className="notice-icon" aria-hidden="true" size={24} />
          <p className="utility-label">Before you continue</p>
          <h2 id="prototype-title">Independent hackathon prototype</h2>
          <p>
            This demonstration uses synthetic data only. It is not connected to
            EPFO or any live government system.
          </p>
          <dl className="notice-facts">
            <div>
              <dt>Data</dt>
              <dd>Synthetic only</dd>
            </div>
            <div>
              <dt>Integration</dt>
              <dd>None</dd>
            </div>
          </dl>
        </aside>
      </main>

      <footer className="site-footer">
        <p>Built independently for demonstration and learning.</p>
      </footer>
    </div>
  );
}
