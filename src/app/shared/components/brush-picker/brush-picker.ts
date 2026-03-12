import { Component,signal } from '@angular/core';
import { DEFAULT_BRUSHES, BRUSH_KEYS } from '../../utils/brushes';

@Component({
  selector: 'app-brush-picker',
  templateUrl: './brush-picker.html',
  styleUrl: './brush-picker.scss',
})
export class BrushPicker {
  selectedBrush=signal('');
  brushOptions = BRUSH_KEYS.map(key => ({
    key,
    color: DEFAULT_BRUSHES[key].color,
  }));
}