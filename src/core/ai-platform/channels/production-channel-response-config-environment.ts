import {
  ChannelResponseConfigService,
} from "@/core/ai-platform/channels/channel-response-config-service";

import {
  FirestoreChannelResponseConfigRepository,
} from "@/core/ai-platform/repositories/firestore/firestore-channel-response-config-repository";

export function createProductionChannelResponseConfigEnvironment() {
  const repository =
    new FirestoreChannelResponseConfigRepository();
  const service =
    new ChannelResponseConfigService(
      repository,
    );

  return {
    repository,
    service,
  };
}
