import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  //  Si existe el token activo en localStorage, PERMITE QUEDARSE en la ruta al recargar (F5)
  if (authService.isAuthenticated()) {
    return true;
  }

  //  Redirigir al login si intenta ingresar sin haber iniciado sesión
  router.navigate(['/login']);
  return false;
};