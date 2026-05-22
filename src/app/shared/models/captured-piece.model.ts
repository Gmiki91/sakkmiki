import { Color, PieceSymbol } from "chess.js"

export type CapturedPiece ={
    piece:PieceSymbol,
    color:Color,
    scoreDelta: number;
}