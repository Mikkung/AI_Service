import {
  createDefaultPublishApprovedKnowledgeUseCase,
} from "@/core/ai-platform/integrations/sharepoint/default-publish-approved-knowledge";

import {
  handleSharePointPublicationRequest,
} from "@/core/ai-platform/integrations/sharepoint/power-automate-http-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
) {
  try {
    return await handleSharePointPublicationRequest(
      request,
      {
        secret:
          process.env
            .SHAREPOINT_PUBLISHER_SECRET,
        useCase:
          createDefaultPublishApprovedKnowledgeUseCase(),
      },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "SharePoint publication failed",
      },
      {
        status: 500,
      },
    );
  }
}
