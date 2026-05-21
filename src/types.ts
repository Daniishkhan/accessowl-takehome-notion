export type Member = {
  name: string | null;
  email: string | null;
  role: string | null;
};

export type MembersOutput = {
  workspaceId: string;
  startUrl: string;
  capturedAt: string;
  source: "notion-settings-members";
  members: Member[];
};
