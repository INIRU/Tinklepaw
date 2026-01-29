import 'next-auth';

declare module 'next-auth' {
  interface Session {
    discordAccessToken?: string;
    isAdmin?: boolean;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    discordAccessToken?: string;
    discordUserId?: string;
    isAdmin?: boolean;
    adminCheckedAt?: number;
  }
}
