import { Injectable, signal } from "@angular/core";
import { Key } from "@lichess-org/chessground/types";
import { PromotionPiece } from "../../shared/components/promotion/promotion";

@Injectable({ providedIn: 'root' })
export class PromotionService {
  pending = signal<{ orig: Key; dest: Key } | null>(null);
  private resolver: ((role: PromotionPiece) => void) | null = null;

  requestPromotion(orig: Key, dest: Key): Promise<PromotionPiece> {
    this.pending.set({ orig, dest });

    return new Promise(resolve => {
      this.resolver = resolve;
    });
  }

  completePromotion(role: PromotionPiece) {
    if (!this.resolver) return;
    this.pending.set(null);
    this.resolver(role);
    this.resolver = null;
  }
}