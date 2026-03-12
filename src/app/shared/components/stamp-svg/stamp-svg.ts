import { Component, input } from '@angular/core';
import { StampType } from '../../models/stamp.model';


@Component({
  selector: 'app-stamp-svg',
  templateUrl: './stamp-svg.html',
})
export class StampSvg {
  type = input.required<StampType>();
  size = input<number>(200);
}