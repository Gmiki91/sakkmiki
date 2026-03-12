import { DrawBrushes } from '@lichess-org/chessground/draw';
export const BRUSH_KEYS =[
  'maroon','brown','olive','teal','navy','black','red','orange','yellow','green','lime','cyan','blue','purple','magenta','grey','pink','apricot','beige','mint','lavender','white'
]
export const DEFAULT_BRUSHES: DrawBrushes = {
  maroon:  { key: 'maroon',  color: '#800000', opacity: 1, lineWidth: 10 },
  brown:   { key: 'brown',   color: '#9A6324', opacity: 1, lineWidth: 10 },
  olive:   { key: 'olive',   color: '#808000', opacity: 1, lineWidth: 10 },
  teal:    { key: 'teal',    color: '#469990', opacity: 1, lineWidth: 10 },
  navy:    { key: 'navy',    color: '#000075', opacity: 1, lineWidth: 10 },
  black:   { key: 'black',   color: '#000000', opacity: 1, lineWidth: 10 },
  red:     { key: 'red',     color: '#e6194B', opacity: 1, lineWidth: 10 },
  orange:  { key: 'orange',  color: '#f58231', opacity: 1, lineWidth: 10 },
  yellow:  { key: 'yellow',  color: '#ffe119', opacity: 1, lineWidth: 10 },
  lime:    { key: 'lime',    color: '#bfef45', opacity: 1, lineWidth: 10 },
  green:   { key: 'green',   color: '#3cb44b', opacity: 1, lineWidth: 10 },
  cyan:    { key: 'cyan',    color: '#42d4f4', opacity: 1, lineWidth: 10 },
  blue:    { key: 'blue',    color: '#4363d8', opacity: 1, lineWidth: 10 },
  purple:  { key: 'purple',  color: '#911eb4', opacity: 1, lineWidth: 10 },
  magenta: { key: 'magenta', color: '#f032e6', opacity: 1, lineWidth: 10 },
  grey:    { key: 'grey',    color: '#a9a9a9', opacity: 1, lineWidth: 10 },
  pink:    { key: 'pink',    color: '#fabed4', opacity: 1, lineWidth: 10 },
  apricot: { key: 'apricot', color: '#ffd8b1', opacity: 1, lineWidth: 10 },
  beige:   { key: 'beige',   color: '#fffac8', opacity: 1, lineWidth: 10 },
  mint:    { key: 'mint',    color: '#aaffc3', opacity: 1, lineWidth: 10 },
  lavender:{ key: 'lavender',color: '#dcbeff', opacity: 1, lineWidth: 10 },
  white:   { key: 'white',   color: '#ffffff', opacity: 1, lineWidth: 10 },
 
};

export function brushForStudent(name: string, allStudents: string[]): string {
  const index = allStudents.indexOf(name);
  return index === -1 ? 'green' : `student${index % 8}`;
}