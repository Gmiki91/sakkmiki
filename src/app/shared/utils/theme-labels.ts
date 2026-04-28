/**
 * Display labels for raw Lichess theme strings.
 * Used only in the UI — never stored in the database.
 */
export const THEME_LABELS: Record<string, string> = {
  // Mating patterns
  mateIn1:           'Mate in 1',
  mateIn2:           'Mate in 2',
  mateIn3:           'Mate in 3',
  mateIn4:           'Mate in 4',
  mateIn5:           'Mate in 5+',
  anastasiaMate:     "Anastasia's Mate",
  arabianMate:       'Arabian Mate',
  backRankMate:      'Back Rank Mate',
  bodensMate:        "Boden's Mate",
  doubleBishopMate:  'Double Bishop Mate',
  dovetailMate:      'Dovetail Mate',
  hookMate:          'Hook Mate',
  smotheredMate:     'Smothered Mate',
  operaMate:         'Opera Mate',
  // Tactical motifs
  fork:              'Fork',
  pin:               'Pin',
  skewer:            'Skewer',
  discoveredAttack:  'Discovered Attack',
  doubleCheck:       'Double Check',
  deflection:        'Deflection',
  attraction:        'Decoy / Attraction',
  interference:      'Interference',
  intermezzo:        'Zwischenzug',
  capturingDefender: 'Removing the Defender',
  xRayAttack:        'X-Ray Attack',
  sacrifice:         'Sacrifice',
  quietMove:         'Quiet Move',
  defensiveMove:     'Defensive Move',
  trappedPiece:      'Trapped Piece',
  hangingPiece:      'Hanging Piece',
  clearance:         'Clearance',
  // overloading:       'Overloading', //lichess themes do not include overloading :O
  // Endgame
  pawnEndgame:       'Pawn Endgame',
  rookEndgame:       'Rook Endgame',
  bishopEndgame:     'Bishop Endgame',
  knightEndgame:     'Knight Endgame',
  queenEndgame:      'Queen Endgame',
  zugzwang:          'Zugzwang',
  promotion:         'Promotion',
  underPromotion:    'Underpromotion',
  enPassant:         'En Passant',
  // Strategy
  advancedPawn:      'Advanced Pawn',
  kingsideAttack:    'Kingside Attack',
  queensideAttack:   'Queenside Attack',
  exposedKing:       'Exposed King',
};

/** Returns a human-readable label, falling back to the raw key if unknown. */
export const themeLabel = (theme: string): string =>
  THEME_LABELS[theme] ?? theme;
