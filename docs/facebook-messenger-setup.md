# Facebook Messenger Setup

1. Create or select the Meta app and connect the Facebook Page.
2. Add the Messenger product and obtain the required `pages_messaging` permission for the deployment.
3. Create a Page access token and store it only in the server environment.
4. Configure the callback URL as `/api/integrations/facebook/webhook` on the deployed service.
5. Choose a private verification token and use the same value in Meta and the server environment.
6. Subscribe the Page to Messenger messaging webhook events.
7. Set the server variables below and redeploy:

```text
FACEBOOK_APP_SECRET=
FACEBOOK_VERIFY_TOKEN=
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
FACEBOOK_GRAPH_API_VERSION=
```

The Graph API version is deployment configuration and is not hardcoded. Verify webhook delivery in `off` mode first, then configure `draft` or `auto` for the Facebook Page ID from the Staff Inbox.

F5.4A supports Messenger text only. It does not support Facebook attachments, message tags, templates, or sends outside the standard 24-hour messaging window.
