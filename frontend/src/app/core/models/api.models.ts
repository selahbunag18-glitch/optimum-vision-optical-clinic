
export type Role = 'patient' | 'owner' | 'staff';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  phone?: string | null;
}

export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
}

export interface LoginData {
  token: string;
  token_type: 'Bearer';
  expires_at: string;
  user: AuthUser;
}

export interface ApiError {
  status: number;
  message: string;
  fieldErrors: Record<string, string>;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

export interface UpdateProfileData {
  full_name: string;
  email: string;
  phone: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}
