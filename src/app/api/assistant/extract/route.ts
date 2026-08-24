import { z } from "zod";

import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import {
  deterministicSyntheticExtraction,
  type SyntheticDocumentKind,
} from "@/server/assistant/document-extractor";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { storeFormPatchProposal } from "@/server/assistant/assistant-store";

const MAX_BYTES = 5 * 1024 * 1024;
const acceptedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const metadataSchema = z.object({
  syntheticDisclosureAccepted: z.literal("true", { error: "Confirm that the upload is entirely synthetic." }),
  documentKind: z.enum(["IDENTITY_RETURN", "JOINING_LETTER", "PAN_CARD", "BANK_STATEMENT"]),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    if (current.demoRun.persona !== "NEW_MEMBER") {
      return Response.json({ error: "Document-assisted onboarding is available only for the new-member demo." }, { status: 403 });
    }
    const formData = await request.formData();
    const metadata = metadataSchema.parse({
      syntheticDisclosureAccepted: formData.get("syntheticDisclosureAccepted"),
      documentKind: formData.get("documentKind"),
    });
    const upload = formData.get("document");
    if (!(upload instanceof File)) {
      return Response.json({ error: "Choose a synthetic PDF, JPEG, or PNG document." }, { status: 422 });
    }
    if (!acceptedTypes.has(upload.type)) {
      return Response.json({ error: "Unsupported file type. Use a synthetic PDF, JPEG, or PNG." }, { status: 415 });
    }
    if (upload.size === 0) return Response.json({ error: "The selected synthetic file is empty." }, { status: 422 });
    if (upload.size > MAX_BYTES) return Response.json({ error: "The file is larger than 5 MB. Choose a smaller synthetic document." }, { status: 413 });

    // Privacy boundary: file bytes are intentionally not read or forwarded. The selected
    // synthetic document type drives a deterministic demo extraction proposal.
    const snapshot = await getMemberSnapshot(current.demoRun.id);
    const proposals = deterministicSyntheticExtraction(
      metadata.documentKind as SyntheticDocumentKind,
      upload.name.slice(0, 120),
      snapshot,
    );
    await storeFormPatchProposal(current.demoRun.id, proposals);
    return Response.json({
      proposals,
      extractionMode: "deterministic-synthetic-demo",
      persisted: false,
      disclosure: "The upload was not stored and its bytes were not sent to OpenAI or any government system. Review every proposed value before applying it.",
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Check the synthetic document details." }, { status: 422 });
    if (error instanceof TypeError) return Response.json({ error: "Upload the document as multipart form data." }, { status: 400 });
    return Response.json({ error: "The synthetic document could not be reviewed. Try again." }, { status: 500 });
  }
}
