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