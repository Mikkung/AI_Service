export interface StaffEmailLinkRequestInput<
  AuthInstance,
> {
  email: string;
  origin: string;
  getAuth: () => AuthInstance;
  sendLink: (
    auth: AuthInstance,
    email: string,
    settings: {
      url: string;
      handleCodeInApp: true;
    },
  ) => Promise<void>;
  persistEmail: (email: string) => void;
}

export async function requestStaffEmailLink<
  AuthInstance,
>(
  input: StaffEmailLinkRequestInput<AuthInstance>,
): Promise<void> {
  const email = input.email.trim();
  const auth = input.getAuth();

  await input.sendLink(
    auth,
    email,
    {
      url: `${input.origin}/admin/inbox/auth/complete`,
      handleCodeInApp: true,
    },
  );
  input.persistEmail(email);
}
