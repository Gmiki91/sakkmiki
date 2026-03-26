import { Component, output, signal, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BrushPicker } from '../brush-picker/brush-picker';
import {  StampIcon, DrawingTool } from '../../models/drawing.model';
import { DEFAULT_BRUSH_COLOR } from '../../utils/brushes';

@Component({
  selector: 'app-drawing-toolbar',
  templateUrl: './drawing-toolbar.html',
  styleUrl: './drawing-toolbar.scss',
  imports: [MatButtonModule, MatIconModule, BrushPicker],
})
export class DrawingToolbar {
  activeTool = model<DrawingTool>('pen');
  activeStampIcon = model<StampIcon>('star');
  colorSelected = output<string>();

  selectedColor = signal(DEFAULT_BRUSH_COLOR);
  stampIconOptions:StampIcon[] = ['star','check','close_small','favorite'];

  onColorSelected(color: string): void {
    this.selectedColor.set(color);
    this.colorSelected.emit(color);
  }

  selectTool(tool: DrawingTool): void {
    this.activeTool.set(tool);
  }

  selectStamp(stamp: StampIcon): void {
    this.activeStampIcon.set(stamp);
    this.activeTool.set('stamp');
  }
}