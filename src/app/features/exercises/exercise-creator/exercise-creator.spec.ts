import { validateSolution } from '../../../shared/utils/validation';
describe('validateSolution', () => {
  it('returns null for a valid new solution', () => {
    expect(validateSolution(['e4', 'e5', 'Nf3'], [['e4', 'e5', 'Bc4']])).toBeNull();
  });

  it('returns null when solutions share player moves but diverge at player level', () => {
    // diverge at index 0 (player move) — ok
    expect(validateSolution(['d4', 'e5', 'Nf3'], [['e4', 'e5', 'Nf3']])).toBeNull();
  });

  it('rejects conflict at odd index (computer response)', () => {
    // same player move e4, but computer responses differ: existing has e5, new has c5
    const result = validateSolution(['e4', 'c5', 'Nf3'], [['e4', 'e5', 'Nf3']]);
    expect(result).toContain('computer already has a different response');
  });

  it('rejects conflict deeper in the line', () => {
    // agree on e4 e5 Nf3, then computer has Nc6 in existing but Nf6 in new
    const result = validateSolution(
      ['e4', 'e5', 'Nf3', 'Nf6'],
      [['e4', 'e5', 'Nf3', 'Nc6']]
    );
    expect(result).toBeTruthy();
  });

  it('allows a new solution that extends an existing shorter one', () => {
    // existing: ['e4', 'e5'] — solved in 1
    // new: ['e4', 'e5', 'Nf3', 'Nc6'] — longer line, same start
    expect(validateSolution(['e4', 'e5', 'Nf3', 'Nc6'], [['e4', 'e5']])).toBeNull();
  });

  it('handles empty existing solutions', () => {
    expect(validateSolution(['e4', 'e5'], [])).toBeNull();
  });
});