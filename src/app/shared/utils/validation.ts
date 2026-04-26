export const validateSolution=(newSolution: string[],solutions:string[][]): string | null =>{
    for (const existing of solutions ?? []) {
      // find how far the two lines are identical
      const commonLength = Math.min(existing.length, newSolution.length);
      let divergesAt = -1;
      for (let i = 0; i < commonLength; i++) {
        if (existing[i] !== newSolution[i]) {
          divergesAt = i;
          break;
        }
      }
      // if divergence happens at an even index (0,2,4...) thats a player move -> ok
      // if divergence happens at an odd index (1,3,5...) thats a computer move -> conflict
      if (divergesAt !== -1 && divergesAt % 2 === 1) {
        return `Conflict at move ${Math.ceil(divergesAt / 2) + 1}: computer already has a different response recorded for this position.`;
      }
    }
    return null;
  }