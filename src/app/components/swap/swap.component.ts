import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, finalize, Observable, Subject, takeUntil } from 'rxjs';
import { EthereumService } from '../../services/ethereum.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LlmService } from '../../services/llm.service';

@Component({
  selector: 'app-swap',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  providers: [EthereumService, LlmService],
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss'],
})
export class SwapComponent implements OnInit, OnDestroy {
  account$: Observable<string | null> = new Observable();
  private destroy$ = new Subject<void>();
  swapForm: FormGroup;
  error: string | null = null;
  isLoading = false;
  parsedInstruction: any = null;
  tokenInSymbol: any = null;
  tokenOutSymbol: any = null;
  amountIn: any = null;

  constructor(
    private fb: FormBuilder,
    private ethereumService: EthereumService,
    private llmService: LlmService
  ) {
    this.swapForm = this.fb.group({
      instruction: ['', Validators.required],
    });
  }

  ngOnInit() {
    this.account$ = this.ethereumService.account$;
  }

  connectWallet() {
    this.ethereumService
      .connectWallet()
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Error connecting wallet:', error);
          throw error;
        })
      )
      .subscribe();
  }

  disconnectWallet() {
    this.ethereumService.disconnectWallet();
  }

  onParse() {
    if (this.swapForm.invalid) return;

    this.isLoading = true;
    this.error = null;
    this.parsedInstruction = null;
    this.tokenInSymbol = null;
    this.tokenOutSymbol = null;
    this.amountIn = null;
    const instruction = this.swapForm.get('instruction')?.value;

    this.llmService
      .parseNaturalLanguage(instruction)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          this.error = error.message;
          throw error;
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe({
        next: (parsed) => {
          if (!parsed) {
            this.error = 'Failed to parse instruction. Please try rephrasing.';
            return;
          }

          this.parsedInstruction = parsed;

          // Fix token order based on action
          if (parsed.action === 'buy') {
            // When buying, the payment token (using) is tokenIn, and the token to buy is tokenOut
            this.tokenInSymbol = parsed.using;
            this.tokenOutSymbol = parsed.token;
          } else {
            // When selling, the token to sell is tokenIn, and the payment token is tokenOut
            this.tokenInSymbol = parsed.token;
            this.tokenOutSymbol = parsed.using;
          }

          this.amountIn = parsed.amount;
        },
      });
  }

  onExample() {
    this.swapForm.get('instruction')?.setValue('Buy 5 USDC using WETH');
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
