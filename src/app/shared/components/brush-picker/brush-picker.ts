import { Component,signal,output } from '@angular/core';
import { DEFAULT_BRUSHES, BRUSH_KEYS } from '../../utils/brushes';

@Component({
  selector: 'app-brush-picker',
  templateUrl: './brush-picker.html',
  styleUrl: './brush-picker.scss',
})
export class BrushPicker {
  selectedBrush=signal('');
  colorSelected = output<string>();
  brushOptions = BRUSH_KEYS.map(key => ({
    key,
    color: DEFAULT_BRUSHES[key].color,
  }));
  selectBrush(key: string): void {
    this.selectedBrush.set(key);
    this.colorSelected.emit(DEFAULT_BRUSHES[key].color);
  }
}