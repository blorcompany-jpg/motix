import type { ConsentType, Role, StructureType } from './constants';

export type UserStatus = 'active' | 'pending_parental_consent' | 'suspended' | 'deleted';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired' | 'free';
export type ClientLinkStatus = 'requested_by_user' | 'requested_by_trainer' | 'active' | 'declined' | 'closed';

export interface StructureSummary {
  id: string;
  displayName: string;
  city: string;
  type: StructureType;
}

export interface MeResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  birthDate: string | null;
  profileVisibility: 'private' | 'public';
  referralCode: string | null;
  consents: Record<ConsentType, boolean>;
  structure: StructureSummary | null;
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    firstChargeAt: string | null;
  } | null;
  trainer: { id: string; status: ApprovalStatus; inviteCode: string; pointsBalance: number } | null;
  ownedStructure: (StructureSummary & { status: ApprovalStatus; code: string | null }) | null;
  instructorOf: StructureSummary | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: MeResponse;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}
