import { ErrorHandler, enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';
import * as Sentry from '@sentry/angular';

import { addIcons } from 'ionicons';
import { 
  documentTextOutline, 
  restaurantOutline, 
  calendarOutline, 
  timeOutline, 
  personOutline, 
  lockClosedOutline, 
  mailOutline, 
  phonePortraitOutline,
  logOutOutline,
  chevronBackOutline,
  addOutline,
  trashOutline,
  createOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// Inicializacion de Sentry para captura de errores y rendimiento
Sentry.init({
  dsn: 'https://dea8a97f127c8d364ecf20437357f7a6@o4511998120689664.ingest.us.sentry.io/4511998154375168',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
});

// Registro explicito de iconos en TypeScript con formato kebab-case
addIcons({
  'document-text-outline': documentTextOutline,
  'restaurant-outline': restaurantOutline,
  'calendar-outline': calendarOutline,
  'time-outline': timeOutline,
  'person-outline': personOutline,
  'lock-closed-outline': lockClosedOutline,
  'mail-outline': mailOutline,
  'phone-portrait-outline': phonePortraitOutline,
  'log-out-outline': logOutOutline,
  'chevron-back-outline': chevronBackOutline,
  'add-outline': addOutline,
  'trash-outline': trashOutline,
  'create-outline': createOutline,
  'checkmark-circle-outline': checkmarkCircleOutline
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient()
  ],
});