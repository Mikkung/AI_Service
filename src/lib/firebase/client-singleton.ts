export interface FirebaseClientSingletonDependencies<
  App,
  Auth,
> {
  isBrowser: () => boolean;
  getApps: () => App[];
  getApp: () => App;
  initializeApp: () => App;
  getAuth: (app: App) => Auth;
}

export function createFirebaseClientAuthSingleton<
  App,
  Auth,
>(
  dependencies:
    FirebaseClientSingletonDependencies<
      App,
      Auth
    >,
): () => Auth {
  let app: App | undefined;
  let auth: Auth | undefined;

  return () => {
    if (!dependencies.isBrowser()) {
      throw new Error(
        "Firebase client authentication is only available in the browser.",
      );
    }

    if (auth !== undefined) {
      return auth;
    }

    app =
      app ??
      (dependencies.getApps().length > 0
        ? dependencies.getApp()
        : dependencies.initializeApp());
    auth = dependencies.getAuth(app);

    return auth;
  };
}
