
import { Role } from './models/api.models';

export const ROLE_HOME: Record<Role, string> = {
  patient: '/patient',
  staff: '/staff',
  owner: '/owner',
};

export function roleHome(role: Role): string {
  return ROLE_HOME[role] ?? '/login';
}
