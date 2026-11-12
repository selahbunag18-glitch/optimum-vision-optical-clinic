import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SalesListPage } from './sales-list.page';

describe('SalesListPage', () => {
  let component: SalesListPage;
  let fixture: ComponentFixture<SalesListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SalesListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
