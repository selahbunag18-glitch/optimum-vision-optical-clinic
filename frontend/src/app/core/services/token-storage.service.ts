
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { AuthUser } from '../models/api.models';

const TOKEN_KEY = 'ov_token';
const EXPIRES_KEY = 'ov_expires_at';
const USER_KEY = 'ov_user';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {

  // =====================================
  // SAVE LOGIN SESSION
  // =====================================

  async saveSession(
    token: string,
    expiresAt: string,
    user: AuthUser
  ): Promise<void> {
    await Promise.all([
      Preferences.set({
        key: TOKEN_KEY,
        value: token
      }),

      Preferences.set({
        key: EXPIRES_KEY,
        value: expiresAt
      }),

      Preferences.set({
        key: USER_KEY,
        value: JSON.stringify(user)
      })
    ]);
  }

  // =====================================
  // UPDATE USER PROFILE INFORMATION
  // =====================================

  async updateUser(user: AuthUser): Promise<void> {
    await Preferences.set({
      key: USER_KEY,
      value: JSON.stringify(user)
    });
  }

  // =====================================
  // GET VALID AUTH TOKEN
  // =====================================

  async getValidToken(): Promise<string | null> {
    const [
      { value: token },
      { value: expiresAt }
    ] = await Promise.all([
      Preferences.get({
        key: TOKEN_KEY
      }),

      Preferences.get({
        key: EXPIRES_KEY
      })
    ]);

    if (!token || !expiresAt) {
      return null;
    }

    if (this.isExpired(expiresAt)) {
      await this.clear();
      return null;
    }

    return token;
  }

  // =====================================
  // GET CURRENT USER INFORMATION
  // =====================================

  async getUser(): Promise<AuthUser | null> {
    const { value } = await Preferences.get({
      key: USER_KEY
    });

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as AuthUser;
    } catch {
      return null;
    }
  }

  // =====================================
  // CLEAR SESSION ON LOGOUT
  // =====================================

  async clear(): Promise<void> {
    await Promise.all([
      Preferences.remove({
        key: TOKEN_KEY
      }),

      Preferences.remove({
        key: EXPIRES_KEY
      }),

      Preferences.remove({
        key: USER_KEY
      })
    ]);
  }

  // =====================================
  // CHECK TOKEN EXPIRATION
  // =====================================

  private isExpired(expiresAt: string): boolean {
    const expiry = new Date(
      expiresAt.replace(' ', 'T') + '+08:00'
    ).getTime();

    return Number.isNaN(expiry) || expiry <= Date.now();
  }
}
