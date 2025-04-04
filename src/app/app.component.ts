import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwapComponent } from './components/swap/swap.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SwapComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'Uniswap Natural Language UI';
}
