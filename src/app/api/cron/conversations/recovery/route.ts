import {
  runConversationRecovery,
} from "@/core/ai-platform/conversations/run-conversation-recovery";

import type {
  RunConversationRecoveryInput,
} from "@/core/ai-platform/conversations/run-conversation-recovery";

const CRON_RECOVERY_LIMIT = 10;

type ConversationRecoveryRunner = (
  input: RunConversationRecoveryInput,
) => ReturnType<
  typeof runConversationRecovery
>;

export function createConversationRecoveryCronHandler(
  recoveryRunner: ConversationRecoveryRunner =
    runConversationRecovery,
) {
  return async function GET(
    request: Request,
  ): Promise<Response> {
    const cronSecret =
      process.env.CRON_SECRET;
    const authorization =
      request.headers.get(
        "authorization",
      );

    if (
      !cronSecret ||
      authorization !==
        `Bearer ${cronSecret}`
    ) {
      return Response.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        },
      );
    }

    try {
      const summary =
        await recoveryRunner({
          limit:
            CRON_RECOVERY_LIMIT,
        });

      console.info(
        "Conversation recovery cron completed",
        summary,
      );

      return Response.json({
        ok: true,
        ...summary,
      });
    } catch {
      console.error(
        "Conversation recovery cron failed",
      );

      return Response.json(
        {
          ok: false,
          error:
            "Unexpected conversation error",
        },
        {
          status: 500,
        },
      );
    }
  };
}

export const GET =
  createConversationRecoveryCronHandler();
