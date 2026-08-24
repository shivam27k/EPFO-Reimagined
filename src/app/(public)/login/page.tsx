"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, ClipboardCheck, UserRoundCheck } from "lucide-react";

const personas = [
  {
    key: "new",
    title: "New member journey",
    name: "Rohan Mehta",
    username: "new.member@demo.epfsahayak.in",
    password: "DemoNew#2026",
    detail: "Starts before onboarding with KYC checks still open.",
  },
  {
    key: "existing",
    title: "Existing member journey",
    name: "Ananya Sharma",
    username: "existing.member@demo.epfsahayak.in",
    password: "DemoExisting#2026",
    detail: "Starts with prior employment, draft claim, and missing exit date.",
  },
] as const;

type LoginState = {
  username: string;
  password: string;
  error: string | null;
  pending: boolean;
};

export default function LoginPage() {
  const [state, setState] = useState<LoginState>({
    username: "",
    password: "",
    error: null,
    pending: false,
  });

  function fillCredentials(persona: (typeof personas)[number]) {
    setState({
      username: persona.username,
      password: persona.password,
      error: null,
      pending: false,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState((current) => ({ ...current, error: null, pending: true }));

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: state.username,
          password: state.password,
        }),
      });
      const payload = (await response.json()) as {
        redirectTo?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "Could not sign in with those credentials.");
      window.location.assign(payload.redirectTo ?? "/overview");
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "The demo could not be started. Check the connection and try again.",
        pending: false,
      }));
    }
  }

  return (
    <main className="login-shell" aria-labelledby="login-title">
      <section className="login-intro">
        <p className="utility-label">EPF Sahayak prototype access</p>
        <h1 id="login-title">Choose a fictional member record.</h1>
        <p>
          These credentials and all account data are synthetic. This prototype
          is independent and is not connected to EPFO or any live government
          system.
        </p>
        <p className="prototype-warning">
          Every sign-in starts a fresh, isolated copy of the selected journey. Logging
          out clears that copy so the same credentials can replay it from the beginning.
        </p>
      </section>

      <section className="login-workspace" aria-label="Demo sign in">
        <div className="persona-list" aria-label="Fictional demo personas">
          {personas.map((persona) => (
            <article className="persona-card" key={persona.key}>
              <div>
                <p className="utility-label">{persona.name}</p>
                <h2>{persona.title}</h2>
                <p>{persona.detail}</p>
              </div>
              <dl className="credential-list">
                <div>
                  <dt>Username</dt>
                  <dd>{persona.username}</dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>{persona.password}</dd>
                </div>
              </dl>
              <button
                className="secondary-action"
                type="button"
                onClick={() => fillCredentials(persona)}
              >
                <ClipboardCheck aria-hidden="true" size={18} />
                Fill these credentials
              </button>
            </article>
          ))}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <UserRoundCheck aria-hidden="true" size={22} />
            <div>
              <p className="utility-label">Manual sign in</p>
              <h2>Enter demo credentials</h2>
            </div>
          </div>

          <label className="form-field" htmlFor="username">
            <span>Username</span>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={state.username}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  username: event.target.value,
                  error: null,
                }))
              }
              required
            />
          </label>

          <label className="form-field" htmlFor="password">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={state.password}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  password: event.target.value,
                  error: null,
                }))
              }
              required
            />
          </label>

          <p className="prototype-warning">
            Prototype only: do not use personal UAN, Aadhaar, PAN, bank, or EPFO
            credentials here.
          </p>

          {state.error ? (
            <p className="login-error" role="alert">
              {state.error}
            </p>
          ) : null}

          <button className="primary-action login-submit" type="submit" disabled={state.pending}>
            {state.pending ? "Starting demo..." : "Start demo"}
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
