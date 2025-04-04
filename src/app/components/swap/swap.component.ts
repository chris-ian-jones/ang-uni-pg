import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, Observable, Subject, takeUntil } from 'rxjs';
import { EthereumService } from '../../services/ethereum.service';


@Component({
  selector: 'app-swap',
  standalone: true,
  imports: [CommonModule],
  providers: [EthereumService],
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss'],
})
export class SwapComponent implements OnInit, OnDestroy {
  account$: Observable<string | null> = new Observable();
  private destroy$ = new Subject<void>();

  constructor(private ethereumService: EthereumService) {}

  ngOnInit() {
    this.account$ = this.ethereumService.account$;
  }

  connectWallet() {
    this.ethereumService.connectWallet().pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error('Error connecting wallet:', error);
        throw error;
      })
    ).subscribe();
  }

  disconnectWallet() {
    this.ethereumService.disconnectWallet();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
