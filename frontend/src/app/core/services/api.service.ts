
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiError } from '../models/api.models';

type Params = Record<string, string | number | boolean>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private url(resource: string): string {
    return `${environment.apiBaseUrl}/${resource}.php`;
  }

  get<T>(resource: string, params: Params = {}): Observable<T> {
    return this.http.get<T>(this.url(resource), { params });
  }

  post<T>(
    resource: string,
    body: unknown,
    params: Params = {}
  ): Observable<T> {
    return this.http.post<T>(this.url(resource), body, { params });
  }

  put<T>(
  resource: string,
  body: unknown,
  params: Params = {}
): Observable<T> {
  return this.http.put<T>(this.url(resource), body, { params });
}

  delete<T>(resource: string, params: Params = {}): Observable<T> {
    return this.http.delete<T>(this.url(resource), { params });
  }

  static toApiError(err: unknown): ApiError {
    if (!(err instanceof HttpErrorResponse)) {
      return {
        status: -1,
        message: 'Something went wrong. Please try again.',
        fieldErrors: {},
      };
    }

    if (err.status === 0) {
      return {
        status: 0,
        message: 'Cannot reach the server. Make sure XAMPP Apache is running.',
        fieldErrors: {},
      };
    }

    const body = (err.error ?? {}) as Record<string, unknown>;

    const fieldErrors =
      body['errors'] && typeof body['errors'] === 'object'
        ? (body['errors'] as Record<string, string>)
        : {};

    return {
      status: err.status,
      message:
        typeof body['message'] === 'string'
          ? body['message']
          : 'Request failed.',
      fieldErrors,
      retryAfterSeconds:
        typeof body['retry_after_seconds'] === 'number'
          ? body['retry_after_seconds']
          : undefined,
      attemptsRemaining:
        typeof body['attempts_remaining'] === 'number'
          ? body['attempts_remaining']
          : undefined,
    };
  }
}
