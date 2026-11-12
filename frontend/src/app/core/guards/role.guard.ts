
import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
} from '@angular/router';

import { AuthService } from '../services/auth.service';

type UserRole = 'patient' | 'staff' | 'owner';

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await auth.getCurrentUser();

  // Redirect if not logged in
  if (!user) {
    return router.createUrlTree(['/login']);
  }

  // Accept one role or multiple roles
  const requiredRole = route.data['role'] as
    | UserRole
    | UserRole[]
    | undefined;

  // Allow access if no role is required
  if (!requiredRole) {
    return true;
  }

  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole
    : [requiredRole];

  // Check if the user's role is allowed
  if (allowedRoles.includes(user.role)) {
    return true;
  }

  // Redirect to the correct dashboard
  switch (user.role) {
    case 'patient':
      return router.createUrlTree(['/patient']);

    case 'staff':
      return router.createUrlTree(['/staff']);

    case 'owner':
      return router.createUrlTree(['/owner']);

    default:
      return router.createUrlTree(['/login']);
  }
};
