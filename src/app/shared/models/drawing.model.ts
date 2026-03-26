export type DrawingTool = 'pen' | 'stamp';
export type StampIcon = 'star' | 'close_small' | 'check' | 'favorite';
export type Point = {
  x: number;
  y: number;
  pressure: number;
};

export type DrawingStroke = {
  id: string;
  studentName: string;
  color: string;
  points: Point[];
  committed: boolean;
};

export type StampAnnotation = {
  id: string;
  studentName: string;
  color: string;
  type: StampIcon;
  x: number;
  y: number;
};