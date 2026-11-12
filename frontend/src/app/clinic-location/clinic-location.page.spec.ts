import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClinicLocationPage } from './clinic-location.page';

describe('ClinicLocationPage', () => {
  let component: ClinicLocationPage;
  let fixture: ComponentFixture<ClinicLocationPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ClinicLocationPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
