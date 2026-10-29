// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// The same rules and hidden tests as outcome-character-rules: only the way the rule book
// reaches Claude differs, so the two tasks compare directly.
import rules from '../outcome-character-rules/check.mjs';

export default rules.map((c) => (c.hidden ? { ...c, hidden: `../outcome-character-rules/${c.hidden}` } : c));
