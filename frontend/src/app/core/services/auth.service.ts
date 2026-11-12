
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { TokenStorageService } from './token-storage.service';

import {
  ApiSuccess,
  AuthUser,
  LoginData
} from '../models/api.models';

export interface RegisterData {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
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

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly api = inject(ApiService);
  private readonly storage = inject(TokenStorageService);

  // =====================================
  // LOGIN
  // =====================================

  async login(
    email: string,
    password: string
  ): Promise<AuthUser> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<LoginData>>(
        'auth',
        { email, password },
        { action: 'login' }
      )
    );

    const { token, expires_at, user } = response.data;

    await this.storage.saveSession(
      token,
      expires_at,
      user
    );

    return user;
  }

  // =====================================
  // REGISTER
  // =====================================

  async register(
    data: RegisterData
  ): Promise<AuthUser> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<AuthUser>>(
        'auth',
        data,
        { action: 'register' }
      )
    );

    return response.data;
  }

  // =====================================
  // REGISTER AND LOGIN
  // =====================================

  async registerAndLogin(
    data: RegisterData
  ): Promise<AuthUser> {

    const registeredUser = await this.register(data);

    if (registeredUser.role !== 'patient') {
      throw new Error(
        'Registration did not create a patient account.'
      );
    }

    const loggedInUser = await this.login(
      data.email,
      data.password
    );

    if (
      loggedInUser.role !== 'patient' ||
      loggedInUser.id !== registeredUser.id
    ) {
      await this.storage.clear();

      throw new Error(
        'Unable to verify the new patient session.'
      );
    }

    return loggedInUser;
  }

  // =====================================
  // GET CURRENT USER
  // =====================================

  async getCurrentUser(): Promise<AuthUser | null> {

    const token = await this.storage.getValidToken();

    if (!token) {
      return null;
    }

    return this.storage.getUser();
  }

  // =====================================
  // REFRESH PATIENT PROFILE
  // =====================================

  async refreshProfile(): Promise<AuthUser> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<
        AuthUser & {
          patient?: {
            phone?: string | null;
          } | null;
        }
      >>(
        'auth',
        { action: 'me' }
      )
    );

    const data = response.data;

    const user: AuthUser = {
      id: data.id,
      full_name: data.full_name,
      email: data.email,
      role: data.role,
      phone: data.patient?.phone ?? null
    };

    await this.storage.updateUser(user);

    return user;
  }

  // =====================================
  // UPDATE PATIENT PROFILE
  // =====================================

  async updateProfile(
    data: UpdateProfileData
  ): Promise<AuthUser> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<AuthUser>>(
        'auth',
        data,
        { action: 'update_profile' }
      )
    );

    const updatedUser = response.data;

    await this.storage.updateUser(updatedUser);

    return updatedUser;
  }

  // =====================================
  // CHANGE PASSWORD
  // =====================================

  async changePassword(
    data: ChangePasswordData
  ): Promise<string> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<{
        other_sessions_revoked: number;
      }>>(
        'auth',
        data,
        { action: 'change_password' }
      )
    );

    return response.message ||
      'Password changed successfully.';
  }

  // =====================================
  // LOGOUT
  // =====================================

  async logout(): Promise<void> {

    try {
      await firstValueFrom(
        this.api.post(
          'auth',
          {},
          { action: 'logout' }
        )
      );
    } finally {
      await this.storage.clear();
    }
  }

  // =====================================
  // CHECK LOGIN STATUS
  // =====================================

  async isLoggedIn(): Promise<boolean> {

    const token = await this.storage.getValidToken();

    return token !== null;
  }
}
