import type { PortalAction } from "@/domain/portal-actions";
import type { AssistantIntent } from "./intent";
import type { AssistantReply } from "./respond";

function offlineNavigation(message: string): PortalAction | null {
  // Full, explicit navigation requests only. No keyword-triggered workflow/mutation.
  const match = message.trim().toLowerCase().match(/^(?:please\s+)?(?:open|go to|navigate to)\s+(?:the\s+)?(overview|home|profile|employment|contributions|passbook|claims|services|transfers|nomination|help)(?:\s+page)?[.!]?$/);
  if (!match) return null;
  const destinations = {
    overview: "overview", home: "overview", profile: "profile", employment: "employment",
    contributions: "contributions", passbook: "contributions", claims: "claims",
    services: "services", transfers: "transfers", nomination: "nomination", help: "help",
  } as const;
  const destination = destinations[match[1] as keyof typeof destinations];
  return { name: "navigate_to", arguments: { destination } };
}

export function offlineReply(message: string, intent: AssistantIntent): AssistantReply {
  const action = offlineNavigation(message);
  const hindi = /[\u0900-\u097f]/u.test(message);
  return {
    text: action
      ? "The assistant service is unavailable. I’ve queued your explicit page-opening request; its completion is not confirmed."
      : hindi
        ? "सहायक सेवा अभी उपलब्ध नहीं है। इस अनुरोध से कोई सदस्य रिकॉर्ड नहीं बदला है। आगे बढ़ने के लिए पेज पर दिए गए विकल्प इस्तेमाल करें।"
        : "The assistant service is unavailable. No member records were changed by this request. Use the visible page actions to continue.",
    intent, actions: [], portalActions: action ? [action] : [], usedFallback: true,
  };
}
