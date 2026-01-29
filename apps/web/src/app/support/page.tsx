import SupportClient from './ui';

export const runtime = 'nodejs';

export default async function SupportPage() {
  const invite = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? 'https://discord.gg/tinklepaw';

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <SupportClient inviteUrl={invite} homeHref="/" />
    </main>
  );
}
