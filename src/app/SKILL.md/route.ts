import { markdownResponse, skillDocument } from "@/lib/agent-public-documents";

export async function GET() {
  return markdownResponse(skillDocument);
}
