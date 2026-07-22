import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RosaPage } from './rosa.page';

describe('RosaPage', () => {
  let component: RosaPage;
  let fixture: ComponentFixture<RosaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(RosaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
