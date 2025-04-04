import { Injectable } from '@angular/core';
import { HfInference } from '@huggingface/inference';
import { z } from 'zod';
import { environment } from '../environments/environment';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

interface ParsedInstruction {
  action: 'buy' | 'sell';
  amount: string;
  token: string;
  using?: string;
}

@Injectable({
  providedIn: 'root',
})
export class LlmService {
  private hf: HfInference;
  private instructionSchema = z.object({
    action: z.enum(['buy', 'sell']),
    amount: z.string(),
    token: z.string(),
    using: z.string(),
  });

  constructor() {
    if (!environment.huggingFaceApiKey) {
      console.error('Hugging Face API key not found in environment variables');
    }
    this.hf = new HfInference(environment.huggingFaceApiKey);
  }

  parseNaturalLanguage(text: string): Observable<ParsedInstruction | null> {
    const prompt = `<s>[INST] Extract trading details from this text and output only valid JSON.
Input: ${text}
Required JSON format:
{
  "action": "buy" or "sell",
  "amount": "numeric amount without $ symbol",
  "token": "token symbol in uppercase",
  "using": "payment token in uppercase"
}

Examples:
"Buy 100 USDC with WETH" -> {"action": "buy", "amount": "100", "token": "USDC", "using": "WETH"}
"Sell 5 WETH using USDC" -> {"action": "sell", "amount": "5", "token": "WETH", "using": "USDC"}
"Buy 50 USDC using WETH" -> {"action": "buy", "amount": "50", "token": "USDC", "using": "WETH"}

Output only the JSON for the input text, nothing else: [/INST]`;

    return from(
      this.hf.textGeneration({
        model: 'mistralai/Mistral-7B-Instruct-v0.2',
        inputs: prompt,
        parameters: {
          max_new_tokens: 100,
          temperature: 0.1,
          return_full_text: false,
        },
      })
    ).pipe(
      map((response) => {
        const jsonStr = response.generated_text.trim();
        console.log('Generated JSON:', jsonStr);
        const parsed = JSON.parse(jsonStr);
        return this.instructionSchema.parse(parsed);
      }),
      catchError((error) => {
        console.error('Error parsing natural language:', error);
        if (error instanceof z.ZodError) {
          return throwError(() => new Error('Invalid instruction format'));
        }
        if (error instanceof SyntaxError) {
          return throwError(() => new Error('Invalid JSON response from model'));
        }
        return throwError(() => new Error('Failed to process instruction'));
      })
    );
  }
}
