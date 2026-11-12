
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from '../services/token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Attach tokens only to our PHP backend.
  if (!req.url.startsWith(environment.apiBaseUrl + '/')) {
    return next(req);
  }

  const storage = inject(TokenStorageService);

  return from(storage.getValidToken()).pipe(
    switchMap((token) =>
      token
        ? next(
            req.clone({
              setHeaders: {
                Authorization: `Bearer ${token}`,
              },
            })
          )
        : next(req)
    )
  );
};
