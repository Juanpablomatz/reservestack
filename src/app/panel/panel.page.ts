import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular'; // <--- ESTA ES LA LÍNEA MÁGICA
import { RouterModule } from '@angular/router'; // Necesario para el routerLink

@Component({
  selector: 'app-panel',
  templateUrl: './panel.page.html',
  styleUrls: ['./panel.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule] // <--- AQUÍ SE IMPORTA TODO
})
export class PanelPage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}