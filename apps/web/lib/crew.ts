export interface CrewMember {
  id: string;
  userId: string;
  yachtId: string;
  roleNameOverride: string | null;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    isActive: boolean;
  };
  createdAt: string;
}

export interface GrantAccessRequest {
  userId: string;
  roleNameOverride: string;
}

export interface UpdateAccessRequest {
  roleNameOverride?: string;
}
