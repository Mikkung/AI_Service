import { getFacebookIntegrationConfig } from "@/core/ai-platform/integrations/facebook/facebook-config";
import type { FacebookMessageService } from "@/core/ai-platform/integrations/facebook/facebook-message-service";
import {
  processFacebookWebhook,
  timingSafeTokenEqual,
  verifyFacebookWebhookSignature,
} from "@/core/ai-platform/integrations/facebook/facebook-webhook-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FacebookWebhookRouteDependencies {
  getConfig(): {
    appSecret: string;
    verifyToken: string;
    pageId: string;
  };
  createFacebookMessageService(): Promise<Pick<FacebookMessageService, "processTextEvent">> | Pick<FacebookMessageService, "processTextEvent">;
}

export function createFacebookWebhookHandlers(
  dependencies: FacebookWebhookRouteDependencies,
) {
  return {
    GET: async (request: Request): Promise<Response> => {
      let config: ReturnType<FacebookWebhookRouteDependencies["getConfig"]>;
      try {
        config = dependencies.getConfig();
      } catch {
        return Response.json({ ok: false, error: "Facebook Messenger integration is not configured" }, { status: 503 });
      }
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode !== "subscribe" || challenge === null || !timingSafeTokenEqual(token, config.verifyToken)) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    },
    POST: async (request: Request): Promise<Response> => {
      let config: ReturnType<FacebookWebhookRouteDependencies["getConfig"]>;
      try {
        config = dependencies.getConfig();
      } catch {
        return Response.json({ ok: false, error: "Facebook Messenger integration is not configured" }, { status: 503 });
      }
      const rawBody = new Uint8Array(await request.arrayBuffer());
      if (!verifyFacebookWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret)) {
        return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      try {
        const summary = await processFacebookWebhook(
          rawBody,
          config.pageId,
          await dependencies.createFacebookMessageService(),
        );
        return Response.json({ ok: true, ...summary });
      } catch (error) {
        if (error instanceof Error && /Malformed Facebook/.test(error.message)) {
          return Response.json({ ok: false, error: "Invalid Facebook webhook" }, { status: 400 });
        }
        console.error("Facebook webhook processing failed");
        return Response.json({ ok: false, error: "Facebook webhook processing failed" }, { status: 500 });
      }
    },
  };
}

const handlers = createFacebookWebhookHandlers({
  getConfig: getFacebookIntegrationConfig,
  createFacebookMessageService: async () => {
    const { createProductionFacebookEnvironment } = await import(
      "@/core/ai-platform/integrations/facebook/production-facebook-environment"
    );
    return createProductionFacebookEnvironment().facebookMessageService;
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;
