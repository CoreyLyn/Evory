import { apiDocument, markdownResponse } from "@/lib/agent-public-documents";

export async function GET() {
  return markdownResponse(apiDocument);
}
