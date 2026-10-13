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
    principles: [],
    colophon: paragraphs,
  };
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function countWord(value) {
  return NUMBER_WORDS[value] ?? String(value);
}

function sameMonthDay(start, day) {
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  const startDay = Number(start.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(startDay) || Number(day) >= startDay) {
    return `${start.slice(0, 8)}${day}`;
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-${day}`;
}

export function formatWindow(range) {
  const [start, end] = String(range).split('..');
  if (!end) return range;
  const expanded = end.length === 2 ? sameMonthDay(start, end) : end;
  return expanded === start ? start : `${start} to ${expanded}`;
}
