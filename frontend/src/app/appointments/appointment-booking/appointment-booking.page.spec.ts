import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppointmentBookingPage } from './appointment-booking.page';

describe('AppointmentBookingPage', () => {
  let component: AppointmentBookingPage;
  let fixture: ComponentFixture<AppointmentBookingPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AppointmentBookingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
