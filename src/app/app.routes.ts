import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'pietra',
    loadComponent: () => import('./pietra/pietra.page').then(m => m.PietraPage),
    canActivate: [authGuard]
  },
  {
    path: 'rosa',
    loadComponent: () => import('./rosa/rosa.page').then(m => m.RosaPage),
    canActivate: [authGuard]
  },
  {
    path: 'llorona',
    loadComponent: () => import('./llorona/llorona.page').then(m => m.LloronaPage),
    canActivate: [authGuard]
  },
  {
    path: 'panel',
    loadComponent: () => import('./panel/panel.page').then(m => m.PanelPage),
    canActivate: [authGuard]
  },
  // RUTAS PÚBLICAS PARA CLIENTES (SIN LOGIN / GUARD)
  {
  path: 'reservar',
  loadComponent: () => import('./reservar/reservar.page').then(m => m.ReservarPage)
  }, 
  {
  path: 'reservar-pietra',
  loadComponent: () => import('./reservar-pietra/reservar-pietra.page').then(m => m.ReservarPietraPage)
  },
  {
    path: 'reservar-llorona',
    loadComponent: () => import('./reservar-llorona/reservar-llorona.page').then(m => m.ReservarLloronaPage)
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];