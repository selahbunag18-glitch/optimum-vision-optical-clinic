import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EyeExaminationsPage } from './eye-examinations.page';

describe('EyeExaminationsPage', () => {
  let component: EyeExaminationsPage;
  let fixture: ComponentFixture<EyeExaminationsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EyeExaminationsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
