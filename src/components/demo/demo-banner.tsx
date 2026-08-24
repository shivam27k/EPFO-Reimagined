import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="demo-banner" role="note">
      <FlaskConical size={16} aria-hidden="true" />
      <strong>Independent prototype - synthetic data</strong>
      <span>No connection to EPFO systems or real member records. Log out and sign in again to replay this account from the beginning.</span>
    </div>
  );
}
