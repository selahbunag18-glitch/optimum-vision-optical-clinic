import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SalesReportsPage } from './sales-reports.page';

describe('SalesReportsPage', () => {
  let component: SalesReportsPage;
  let fixture: ComponentFixture<SalesReportsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SalesReportsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
