export function isValidSiteData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  for (const key of ['identity', 'projects', 'stats', 'activity', 'sections']) {
    if (!(key in data)) return false;
  }
  const identity = data.identity;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  for (const key of ['displayName', 'classTitle', 'tagline']) {
    if (typeof identity[key] !== 'string') return false;
  }
  if (!Array.isArray(data.projects) || data.projects.length === 0) return false;
  for (const project of data.projects) {
    if (!project || typeof project.name !== 'string' || typeof project.url !== 'string') return false;
  }
  if (!data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) return false;
  if (!data.activity || typeof data.activity !== 'object' || Array.isArray(data.activity)) return false;
  if (!data.sections || typeof data.sections !== 'object' || Array.isArray(data.sections)) return false;
  return true;
}

export function isValidShowcase(showcase) {
  if (!showcase || typeof showcase !== 'object' || Array.isArray(showcase)) return false;
  const intro = showcase.intro;
  if (!intro || typeof intro !== 'object' || Array.isArray(intro)) return false;
  if (typeof intro.headline !== 'string' || !Array.isArray(intro.paragraphs)) return false;
  if (!Array.isArray(showcase.problems) || showcase.problems.length === 0) return false;
  for (const problem of showcase.problems) {
    if (!problem || typeof problem !== 'object' || Array.isArray(problem)) return false;
    if (typeof problem.name !== 'string' || problem.name.length === 0) return false;
    if (typeof problem.headline !== 'string' || problem.headline.length === 0) return false;
    if (!Array.isArray(problem.highlights) || problem.highlights.length === 0) return false;
  }
  return true;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value) {
  return value == null || isFiniteNumber(value);
}

function isChartableContender(contender) {
  if (!contender || typeof contender !== 'object' || Array.isArray(contender)) return false;
  if (typeof contender.label !== 'string') return false;
  for (const key of ['overall', 'low', 'high', 'runs', 'passed', 'errors']) {
    if (!isFiniteNumber(contender[key])) return false;
  }
  if (!isNullableNumber(contender.safety) || !isNullableNumber(contender.served)) return false;
  if (contender.vsHighlight == null) return true;
  if (typeof contender.vsHighlight !== 'object' || Array.isArray(contender.vsHighlight)) return false;
  return isFiniteNumber(contender.vsHighlight.p) && isFiniteNumber(contender.vsHighlight.low) && isFiniteNumber(contender.vsHighlight.high);
}

export function isValidBenchmark(benchmark) {
  if (!benchmark || typeof benchmark !== 'object' || Array.isArray(benchmark)) return false;
  if (!Array.isArray(benchmark.contenders)) return false;
  if (!benchmark.focusCounts || typeof benchmark.focusCounts !== 'object' || Array.isArray(benchmark.focusCounts)) return false;
  if (typeof benchmark.generatedAt !== 'string') return false;
  for (const key of ['models', 'scenarios', 'contenderCount', 'runsPerContender', 'totalRuns']) {
    if (!isFiniteNumber(benchmark[key])) return false;
  }
  return benchmark.contenders.every(isChartableContender);
}

export function isValidBenchmarkMatrix(matrix) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return false;
  if (!Array.isArray(matrix.models) || matrix.models.length === 0) return false;
  if (!Array.isArray(matrix.scenarios) || matrix.scenarios.length === 0) return false;
  if (!Array.isArray(matrix.contenders) || matrix.contenders.length === 0) return false;
  if (!Array.isArray(matrix.cells) || matrix.cells.length !== matrix.scenarios.length) return false;
  return true;
}

export function fallbackShowcase(data) {
  const paragraphs = [data.identity.tagline];
  return {
    intro: { headline: data.identity.classTitle, paragraphs },
    problems: data.projects.map((project) => ({
      name: project.name,
      kicker: project.language || 'Project',
      headline: project.description || project.name,
      problem: 'The full story for this tool could not be loaded.',
      answer: project.description || 'Public repository.',
      highlights: ['Public repository'],
      size: 'default',
    })),
    evidence: null,
    principles: [],
    colophon: paragraphs,
  };
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function countWord(value) {
  return NUMBER_WORDS[value] ?? String(value);
}

export function formatWindow(range) {
  const [start, end] = String(range).split('..');
  if (!end) return range;
  if (end.length === 2) return `${start} to ${start.slice(0, 8)}${end}`;
  return `${start} to ${end}`;
}
