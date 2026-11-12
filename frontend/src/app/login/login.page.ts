
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSpinner
} from '@ionic/angular';

import {
  Haptics,
  ImpactStyle,
  NotificationType
} from '@capacitor/haptics';

import { addIcons } from 'ionicons';

import {
  alertCircleOutline,
  eyeOffOutline,
  eyeOutline,
  lockClosedOutline,
  mailOutline,
  timeOutline
} from 'ionicons/icons';

import { ApiError } from '../core/models/api.models';
import { roleHome } from '../core/role-routes';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

// Must match MAX_FAILED_ATTEMPTS in auth.php.
const MAX_FAILED_ATTEMPTS = 3;

// UI convenience only. The real lockout is enforced by PHP.
const LOCK_STORAGE_KEY = 'ov_login_lock_until';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner
  ]
})
export class LoginPage implements OnInit {

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = this.fb.nonNullable.group({
    email: ['', [
      Validators.required,
      Validators.email
    ]],
    password: ['', [
      Validators.required
    ]]
  });

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly attemptsHint = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly lockSeconds = signal(0);
  readonly shake = signal(false);

  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private lockEndsAt = 0;
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({
      alertCircleOutline,
      eyeOffOutline,
      eyeOutline,
      lockClosedOutline,
      mailOutline,
      timeOutline
    });

    this.destroyRef.onDestroy(() => {
      this.stopLockTimer();

      if (this.shakeTimer !== null) {
        clearTimeout(this.shakeTimer);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    // If the page was refreshed during a lockout, resume the countdown.
    this.restoreLockout();

    const user = await this.auth.getCurrentUser();

    if (user) {
      await this.router.navigateByUrl(
        roleHome(user.role),
        { replaceUrl: true }
      );
    }
  }

  togglePassword(): void {
    this.showPassword.update(value => !value);
  }

  get countdownText(): string {
    const seconds = Math.max(0, this.lockSeconds());
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    return (
      String(minutes).padStart(2, '0') +
      ':' +
      String(remaining).padStart(2, '0')
    );
  }

  async submit(): Promise<void> {
    if (this.loading() || this.lockSeconds() > 0) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    this.clearErrors();
    this.loading.set(true);

    try {
      const { email, password } = this.form.getRawValue();

      const user = await this.auth.login(
        email.trim(),
        password
      );

      this.clearStoredLock();

      await this.router.navigateByUrl(
        roleHome(user.role),
        { replaceUrl: true }
      );

    } catch (err) {
      this.handleError(ApiService.toApiError(err));

    } finally {
      this.loading.set(false);
    }
  }

  private handleError(error: ApiError): void {
    switch (error.status) {

      case 0:
        this.errorMessage.set(error.message);
        break;

      case 429: {
        const seconds = error.retryAfterSeconds ?? 30;

        this.errorMessage.set(
          'Login is temporarily disabled. Please try again later.'
        );

        // 3rd failed attempt (or still locked): strongest feedback.
        this.playFailureFeedback(3);
        this.triggerShake();
        this.startLockout(seconds);
        break;
      }

      case 401: {
        this.errorMessage.set(error.message);

        let level: 1 | 2 = 1;

        if (error.attemptsRemaining !== undefined) {
          const remaining = error.attemptsRemaining;

          this.attemptsHint.set(
            `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          );

          // remaining 2 => 1st failure, remaining 1 => 2nd failure.
          const failedCount = MAX_FAILED_ATTEMPTS - remaining;
          level = failedCount >= 2 ? 2 : 1;
        }

        // Unknown email has no attempt counter, so it gets the light pattern.
        this.playFailureFeedback(level);
        this.triggerShake();
        break;
      }

      case 422:
        this.fieldErrors.set(error.fieldErrors);

        if (Object.keys(error.fieldErrors).length === 0) {
          this.errorMessage.set(error.message);
        }
        break;

      default:
        this.errorMessage.set(error.message);
    }
  }

  // =====================================
  // HAPTIC FEEDBACK
  // 1 = light, 2 = stronger, 3 = strongest
  // Not every device supports every style, so failures are ignored.
  // =====================================

  private playFailureFeedback(level: 1 | 2 | 3): void {
    void this.runHaptics(level);
  }

  private async runHaptics(level: 1 | 2 | 3): Promise<void> {
    try {
      if (level === 1) {
        await Haptics.impact({ style: ImpactStyle.Light });

      } else if (level === 2) {
        await Haptics.impact({ style: ImpactStyle.Medium });
        await this.wait(120);
        await Haptics.impact({ style: ImpactStyle.Medium });

      } else {
        await Haptics.notification({ type: NotificationType.Error });
        await this.wait(150);
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await this.wait(100);
        // Duration is honored on Android; iOS ignores it.
        await Haptics.vibrate({ duration: 500 });
      }
    } catch {
      // Haptics unsupported (browser, emulator, or device without a motor).
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private triggerShake(): void {
    if (this.shakeTimer !== null) {
      clearTimeout(this.shakeTimer);
    }

    this.shake.set(false);

    // Re-apply on the next tick so the animation can restart.
    setTimeout(() => this.shake.set(true), 0);

    this.shakeTimer = setTimeout(() => {
      this.shake.set(false);
      this.shakeTimer = null;
    }, 550);
  }

  // =====================================
  // LOCKOUT COUNTDOWN
  // Uses an end timestamp, so the countdown stays accurate even if
  // the app is in the background or the timer is delayed.
  // =====================================

  private startLockout(seconds: number): void {
    const safeSeconds = Math.max(1, Math.ceil(seconds));

    this.beginCountdown(Date.now() + safeSeconds * 1000);
  }

  private beginCountdown(endsAt: number): void {
    this.stopLockTimer();

    this.lockEndsAt = endsAt;
    this.storeLock(endsAt);

    this.tickLockout();

    if (this.lockSeconds() > 0) {
      this.lockTimer = setInterval(() => this.tickLockout(), 250);
    }
  }

  private tickLockout(): void {
    const remaining = Math.max(
      0,
      Math.ceil((this.lockEndsAt - Date.now()) / 1000)
    );

    if (remaining <= 0) {
      this.lockSeconds.set(0);
      this.stopLockTimer();
      this.clearStoredLock();
      this.errorMessage.set(null);
      this.attemptsHint.set(null);
      return;
    }

    this.lockSeconds.set(remaining);
  }

  private stopLockTimer(): void {
    if (this.lockTimer !== null) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
  }

  private restoreLockout(): void {
    try {
      const stored = Number(localStorage.getItem(LOCK_STORAGE_KEY));

      // Ignore expired values and anything unreasonably far in the future.
      if (
        Number.isFinite(stored) &&
        stored > Date.now() &&
        stored <= Date.now() + 120_000
      ) {
        this.beginCountdown(stored);
      } else {
        this.clearStoredLock();
      }
    } catch {
      // Storage unavailable: PHP still enforces the lockout.
    }
  }

  private storeLock(endsAt: number): void {
    try {
      localStorage.setItem(LOCK_STORAGE_KEY, String(endsAt));
    } catch {
      // Ignore storage errors.
    }
  }

  private clearStoredLock(): void {
    try {
      localStorage.removeItem(LOCK_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }

  private clearErrors(): void {
    this.errorMessage.set(null);
    this.attemptsHint.set(null);
    this.fieldErrors.set({});
  }
}