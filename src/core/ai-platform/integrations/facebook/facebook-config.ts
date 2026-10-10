export interface FacebookIntegrationConfig {
  appSecret: string;
  verifyToken: string;
  pageAccessToken: string;
  pageId: string;
  graphApiVersion: string;
}

export function getFacebookIntegrationConfig(): FacebookIntegrationConfig {
  const config = {
    appSecret: process.env.FACEBOOK_APP_SECRET,
    verifyToken: process.env.FACEBOOK_VERIFY_TOKEN,
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    pageId: process.env.FACEBOOK_PAGE_ID,
    graphApiVersion: process.env.FACEBOOK_GRAPH_API_VERSION,
  };
  if (Object.values(config).some((value) => !value)) {
    throw new Error("Facebook Messenger integration is not configured");
  }
  return config as FacebookIntegrationConfig;
}

export function getFacebookIntegrationConfigIfAvailable(): FacebookIntegrationConfig | null {
  try {
    return getFacebookIntegrationConfig();
  } catch {
    return null;
  }
}
