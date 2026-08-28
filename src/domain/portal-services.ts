/** Shared by the Services page and assistant; labels stay in sync. */
export function getPortalServiceGroups(claimStatus?: string) {
  return [
    {
      title: "Withdraw money",
      services: [
        { href: "/claims", title: claimStatus ? `Track your ${claimStatus} full-withdrawal claim` : "Withdraw your full PF balance", term: "Final settlement · Form 19", description: "Check eligibility, submit the fictional claim, or track its current EPFO and bank status." },
        { href: "/claims/advance", title: "Take an advance for an allowed purpose", term: "PF advance · Form 31", description: "See which common purpose and service conditions this fictional record can assess." },
      ],
    },
    {
      title: "Plan pension",
      services: [
        { href: "/claims/pension-withdrawal", title: "Preserve service or review withdrawal benefit", term: "Withdrawal benefit / Scheme Certificate · Form 10C", description: "See how the ten-year service boundary changes the available EPS route." },
        { href: "/claims/pension", title: "Check monthly pension readiness", term: "Monthly pension · Form 10D", description: "Review the member pension result and the categories this prototype cannot assess." },
      ],
    },
    {
      title: "Move service history",
      services: [
        { href: "/transfers", title: "Move past service into your current account", term: "Transfer claim · Form 13 / auto-transfer", description: "Check whether the core identity, exit-date, and Member ID records are present." },
        { href: "/transfers/annexure-k", title: "Check your transfer record", term: "Transfer Certificate · Annexure K", description: "See whether an official download can be expected and what the document contains." },
      ],
    },
    {
      title: "Protect family",
      services: [
        { href: "/nomination", title: "Prepare a family nomination", term: "e-Nomination · Form 2 and Aadhaar e-sign", description: "Check readiness and preview the information needed for the official nomination journey." },
      ],
    },
    {
      title: "Understand benefits and support",
      services: [
        { href: "/pmvbry", title: "Check first-timer benefit evidence", term: "PMVBRY Part A · First Timer", description: "Read the deterministic status from joining, authentication, wage evidence, and ECR months." },
        { href: "/help", title: "Resolve an EPF issue", term: "Help and grievance guidance · EPFiGMS", description: "Find the responsible actor and when to use the official grievance channel." },
      ],
    },
  ];
}

