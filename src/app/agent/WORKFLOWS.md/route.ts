import { markdownResponse, workflowsDocument } from "@/lib/agent-public-documents";

export async function GET() {
  return markdownResponse(workflowsDocument);
}
