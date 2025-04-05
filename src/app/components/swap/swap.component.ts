import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, finalize, Observable, Subject, takeUntil } from 'rxjs';
import { EthereumService } from '../../services/ethereum.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LlmService } from '../../services/llm.service';
import { TOKENS } from '../../models/tokens';
import { ethers } from 'ethers';

@Component({
  selector: 'app-swap',
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
  amountOut: any = null;
  poolAddress: any = null;
  poolContract: any = null;
  quoterContract: any = null;
  quotedAmountIn: any = null;
  formattedQuotedAmountIn: any = null;

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
    this.amountOut = null;
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

          this.amountOut = parsed.amount;
        },
      });
  }

  onExample() {
    this.swapForm.get('instruction')?.setValue('Buy 5 USDC using WETH');
  }

  async getUniswapPoolAddress() {
    try {
      this.isLoading = true;
      this.error = null;
      this.poolAddress = await this.ethereumService.getUniswapPoolAddress(
        this.tokenInSymbol,
        this.tokenOutSymbol
      );
      console.log('Pool address:', this.poolAddress);
    } catch (error: any) {
      console.error('Error getting pool:', error);
      this.error = error.message || 'Failed to get pool address';
    } finally {
      this.isLoading = false;
    }
  }

  async getUniswapPoolContract() {
    try {
      this.poolContract = await this.ethereumService.getUniswapPoolData(this.poolAddress);
    } catch (error: any) {
      console.error('Error getting pool contract:', error);
      this.error = error.message || 'Failed to get pool contract';
    } finally {
      this.isLoading = false;
    }
  }

  async getQuoterContract() {
    try {
      this.quoterContract = await this.ethereumService.getQuoterContract();
    } catch (error: any) {
      console.error('Error getting quoter contract:', error);
      this.error = error.message || 'Failed to get quoter contract';
    } finally {
      this.isLoading = false;
    }
  }

  async getQuotedAmountIn() {
    try {
      console.log('*quotedAmountIn*');
      console.log('this.tokenInSymbol: ', this.tokenInSymbol);
      console.log('this.tokenOutSymbol: ', this.tokenOutSymbol);
      console.log('this.amountOut: ', this.amountOut);

      this.quotedAmountIn = await this.ethereumService.getQuotedAmountIn(
        this.quoterContract,
        this.tokenInSymbol,
        this.tokenOutSymbol,
        this.amountOut
      );
      console.log('this.quotedAmountIn: ', this.quotedAmountIn);

      this.formattedQuotedAmountIn = ethers.utils.formatUnits(
        this.quotedAmountIn,
        TOKENS[this.tokenInSymbol].decimals
      );
    } catch (error: any) {
      console.error('Error getting quoted amount in:', error);
      this.error = error.message || 'Failed to get quoted amount in';
    } finally {
      this.isLoading = false;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
