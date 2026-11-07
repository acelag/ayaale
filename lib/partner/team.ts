export type PropertyTeam = {
  staff: { id: string; slot: number; email: string | null }[];
  invites: { id: string; email: string; expiresAt: string }[];
};
