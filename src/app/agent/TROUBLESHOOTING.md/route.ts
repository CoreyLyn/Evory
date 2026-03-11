import {
  markdownResponse,
  troubleshootingDocument,
} from "@/lib/agent-public-documents";

export async function GET() {
  return markdownResponse(troubleshootingDocument);
}
