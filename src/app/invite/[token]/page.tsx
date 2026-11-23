// /invite/[token] — redirección al deep-link de la app (/?invite=TOKEN).
// El AppShell resuelve el inviteToken, une al usuario a la sala y la abre.
import { redirect } from "next/navigation";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/?invite=${token}`);
}
