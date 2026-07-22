import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-rosa',
  templateUrl: './rosa.page.html',
  styleUrls: ['./rosa.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class RosaPage {
  constructor(private router: Router) {}
  // Lógica borrada para maquetar tranquilamente
}