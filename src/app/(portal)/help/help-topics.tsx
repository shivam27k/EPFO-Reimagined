"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type HelpTopic = { title: string; summary: string; owner: string; route: string; action: string; terms: string };

const helpTopics: readonly HelpTopic[] = [
  { title: "UAN and profile setup", summary: "Understand the simulated UMANG handoff, profile fields, and identity checks.", owner: "Member, then Aadhaar/EPFO", route: "/onboarding", action: "Open onboarding", terms: "uan activation umang aadhaar profile kyc" },
  { title: "Bank or PAN name mismatch", summary: "Compare saved fictional names and correct the ordinary profile form before a claim.", owner: "Member and bank", route: "/profile", action: "Review KYC", terms: "bank pan name mismatch rejected verification" },
  { title: "Missing contribution", summary: "Find the exact wage month and see whether employer payroll or ECR posting acts next.", owner: "Employer", route: "/passbook", action: "Open contributions", terms: "passbook ecr wage month contribution missing delayed" },
  { title: "Missing date of exit", summary: "See why the previous employer must update the service record before final settlement.", owner: "Previous employer", route: "/employment", action: "Open employment", terms: "exit date employer service history" },
  { title: "Final settlement claim", summary: "Review eligibility blockers, member confirmations, claim status, and simulated payment.", owner: "Member, EPFO, then bank", route: "/claims", action: "Open claims", terms: "form 19 claim settlement status payment rejected" },
  { title: "Transfer and Annexure K", summary: "Review previous and present employment records and understand the transfer document.", owner: "Member, employer/trust, EPFO", route: "/transfers", action: "Open transfers", terms: "form 13 transfer annexure k member id trust" },
  { title: "e-Nomination", summary: "Preview family allocation and the Aadhaar-based e-sign requirement without submitting.", owner: "Member", route: "/nomination", action: "Open nomination", terms: "family nominee share esign aadhaar form 2" },
];

export function HelpTopics() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return helpTopics;
    return helpTopics.filter((topic) => `${topic.title} ${topic.summary} ${topic.owner} ${topic.terms}`.toLocaleLowerCase().includes(value));
  }, [query]);

  return (
    <section className="help-search" aria-labelledby="help-topics-heading">
      <div className="help-search-heading">
        <div><p className="utility-label">Member help</p><h2 id="help-topics-heading">Find the next correct action</h2></div>
        <label><span>Search help topics</span><div><Search aria-hidden="true" size={18} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Try ‘exit date’ or ‘bank mismatch’" type="search" value={query} /></div></label>
      </div>
      <p className="search-result-count" aria-live="polite">{filtered.length} topic{filtered.length === 1 ? "" : "s"} shown</p>
      {filtered.length ? (
        <div className="help-topic-list">
          {filtered.map((topic) => <article key={topic.title}><div><h3>{topic.title}</h3><p>{topic.summary}</p><span><b>Who acts:</b> {topic.owner}</span></div><Link href={topic.route}>{topic.action}</Link></article>)}
        </div>
      ) : <div className="empty-register"><p>No help topic matches “{query}”.</p><span>Try a process name, document, status, or responsible actor.</span></div>}
    </section>
  );
}
