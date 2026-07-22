import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then( m => m.LoginPage)
  },
  {
    path: 'panel',
    loadComponent: () => import('./panel/panel.page').then( m => m.PanelPage)
  },
  {
    path: 'rosa',
    loadComponent: () => import('./rosa/rosa.page').then( m => m.RosaPage)
  },
  {
    path: 'reservar', 
    loadComponent: () => import('./reservar/reservar.page').then( m => m.ReservarPage)
  },
  {
    path: 'pietra',
    loadComponent: () => import('./pietra/pietra.page').then( m => m.PietraPage)
  },
  {
    path: 'reservar-pietra', 
    loadComponent: () => import('./reservar-pietra/reservar-pietra.page').then( m => m.ReservarPietraPage)
  }
];