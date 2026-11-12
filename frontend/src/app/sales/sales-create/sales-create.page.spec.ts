import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SalesCreatePage } from './sales-create.page';

describe('SalesCreatePage', () => {
  let component: SalesCreatePage;
  let fixture: ComponentFixture<SalesCreatePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SalesCreatePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
