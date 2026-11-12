
import { inject } from '@angular/core';

import {
  CanActivateFn,
  Router
} from '@angular/router';

import { AuthService } from '../services/auth.service';
import { roleHome } from '../role-routes';

export const guestGuard: CanActivateFn = async () => {

  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await auth.getCurrentUser();

  // Kapag naka-login, bawal bumalik sa
  // Login at Registration pages.
  if (user) {
    return router.createUrlTree([
      roleHome(user.role)
    ]);
  }

  // Kapag hindi naka-login,
  // puwedeng mag-login o register.
  return true;
};
