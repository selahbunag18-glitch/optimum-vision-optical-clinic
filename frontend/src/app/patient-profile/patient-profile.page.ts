
import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  personCircleOutline,
  mailOutline,
  callOutline,
  shieldCheckmarkOutline,
  createOutline,
  lockClosedOutline,
  checkmarkCircleOutline,
  alertCircleOutline
} from 'ionicons/icons';

import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { AuthUser } from '../core/models/api.models';

@Component({
  selector: 'app-patient-profile',
  standalone: true,
  templateUrl: './patient-profile.page.html',
  styleUrls: ['./patient-profile.page.scss'],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonSpinner
  ]
})
export class PatientProfilePage implements OnInit {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  // =====================================
  // PATIENT INFORMATION
  // =====================================

  readonly user = signal<AuthUser | null>(null);

  readonly loading = signal(true);

  // =====================================
  // PROFILE STATES
  // =====================================

  readonly editing = signal(false);
  readonly savingProfile = signal(false);

  readonly profileError = signal('');
  readonly profileSuccess = signal('');

  // =====================================
  // PASSWORD STATES
  // =====================================

  readonly changingPassword = signal(false);
  readonly savingPassword = signal(false);

  readonly passwordError = signal('');
  readonly passwordSuccess = signal('');

  // =====================================
  // EDIT PROFILE FORM
  // =====================================

  readonly profileForm = this.fb.group({
    full_name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100)
      ]
    ],

    email: [
      '',
      [
        Validators.required,
        Validators.email
      ]
    ],

    phone: [
      '',
      [
        Validators.pattern(/^[0-9+\-\s()]{7,20}$/)
      ]
    ]
  });

  // =====================================
  // CHANGE PASSWORD FORM
  // =====================================

  readonly passwordForm = this.fb.group({
    current_password: [
      '',
      [
        Validators.required
      ]
    ],

    new_password: [
      '',
      [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[A-Za-z])(?=.*[0-9]).+$/)
      ]
    ],

    confirm_password: [
      '',
      [
        Validators.required
      ]
    ]
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      personCircleOutline,
      mailOutline,
      callOutline,
      shieldCheckmarkOutline,
      createOutline,
      lockClosedOutline,
      checkmarkCircleOutline,
      alertCircleOutline
    });
  }

  // =====================================
  // LOAD PATIENT PROFILE
  // =====================================

  async ngOnInit(): Promise<void> {
    try {
      const currentUser = await this.auth.getCurrentUser();

      if (!currentUser) {
        await this.router.navigateByUrl('/login', {
          replaceUrl: true
        });
        return;
      }

      if (currentUser.role !== 'patient') {
        await this.router.navigateByUrl(
          currentUser.role === 'owner'
            ? '/owner'
            : '/staff',
          {
            replaceUrl: true
          }
        );
        return;
      }

      this.user.set(currentUser);

      this.profileForm.patchValue({
        full_name: currentUser.full_name,
        email: currentUser.email,
        phone: currentUser.phone || ''
      });

    } catch (error) {
      console.error('Failed to load patient profile:', error);

      await this.router.navigateByUrl('/login', {
        replaceUrl: true
      });

    } finally {
      this.loading.set(false);
    }
  }

  // =====================================
  // DISPLAY PHONE NUMBER
  // =====================================

  get phone(): string {
    return this.user()?.phone || 'Not provided';
  }

  // =====================================
  // OPEN EDIT PROFILE
  // =====================================

  editProfile(): void {
    const currentUser = this.user();

    if (!currentUser) {
      return;
    }

    this.profileForm.patchValue({
      full_name: currentUser.full_name,
      email: currentUser.email,
      phone: currentUser.phone || ''
    });

    this.profileForm.markAsPristine();
    this.profileForm.markAsUntouched();

    this.profileError.set('');
    this.profileSuccess.set('');

    this.editing.set(true);
  }

  // =====================================
  // CANCEL EDIT PROFILE
  // =====================================

  cancelEditProfile(): void {
    if (this.savingProfile()) {
      return;
    }

    this.editing.set(false);
    this.profileError.set('');
  }

  // =====================================
  // SAVE PROFILE CHANGES
  // =====================================

  async saveProfile(): Promise<void> {
    if (this.savingProfile()) {
      return;
    }

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();

      this.profileError.set(
        'Please check the information you entered.'
      );
      return;
    }

    this.savingProfile.set(true);
    this.profileError.set('');
    this.profileSuccess.set('');

    const formValue = this.profileForm.getRawValue();

    try {
      const updatedUser = await this.auth.updateProfile({
        full_name: (formValue.full_name || '').trim(),
        email: (formValue.email || '').trim(),
        phone: (formValue.phone || '').trim()
      });

      this.user.set(updatedUser);

      this.profileForm.patchValue({
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone || ''
      });

      this.editing.set(false);

      this.profileSuccess.set(
        'Your personal information has been updated successfully.'
      );

    } catch (error) {
      const apiError = ApiService.toApiError(error);

      const fieldError =
        apiError.fieldErrors['full_name'] ||
        apiError.fieldErrors['email'] ||
        apiError.fieldErrors['phone'];

      this.profileError.set(
        fieldError || apiError.message
      );

    } finally {
      this.savingProfile.set(false);
    }
  }

  // =====================================
  // OPEN CHANGE PASSWORD
  // =====================================

  openChangePassword(): void {
    this.passwordForm.reset();

    this.passwordError.set('');
    this.passwordSuccess.set('');

    this.changingPassword.set(true);
  }

  // =====================================
  // CANCEL CHANGE PASSWORD
  // =====================================

  cancelChangePassword(): void {
    if (this.savingPassword()) {
      return;
    }

    this.passwordForm.reset();

    this.changingPassword.set(false);
    this.passwordError.set('');
  }

  // =====================================
  // SAVE NEW PASSWORD
  // =====================================

  async savePassword(): Promise<void> {
    if (this.savingPassword()) {
      return;
    }

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();

      this.passwordError.set(
        'Please complete all password fields correctly.'
      );
      return;
    }

    const values = this.passwordForm.getRawValue();

    const currentPassword = values.current_password || '';
    const newPassword = values.new_password || '';
    const confirmPassword = values.confirm_password || '';

    // Check maximum password size in bytes.
    const passwordBytes = new TextEncoder().encode(
      newPassword
    ).length;

    if (passwordBytes > 72) {
      this.passwordError.set(
        'New password must not exceed 72 bytes.'
      );
      return;
    }

    // Check matching passwords.
    if (newPassword !== confirmPassword) {
      this.passwordError.set(
        'New password and confirm password do not match.'
      );
      return;
    }

    // Prevent using the same password.
    if (currentPassword === newPassword) {
      this.passwordError.set(
        'Your new password must be different from your current password.'
      );
      return;
    }

    this.savingPassword.set(true);

    this.passwordError.set('');
    this.passwordSuccess.set('');

    try {
      const message = await this.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });

      this.passwordSuccess.set(message);

      this.passwordForm.reset();
      this.changingPassword.set(false);

    } catch (error) {
      const apiError = ApiService.toApiError(error);

      const currentPasswordError =
        apiError.fieldErrors['current_password'];

      const newPasswordError =
        apiError.fieldErrors['new_password'];

      this.passwordError.set(
        currentPasswordError ||
        newPasswordError ||
        apiError.message
      );

    } finally {
      this.savingPassword.set(false);
    }
  }
}
