import { posix } from 'node:path';

export interface MdImage { caption: string | null; path: string; }
export interface MdDoc {
  mdPath: string;
  componentId: string | null;
  sourcePath: string | null;
  images: MdImage[];
}

function splitRow(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function extractComponentId(lines: string[], content: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('コンポーネントID') && lines[i].includes('|')) {
      const idx = splitRow(lines[i]).indexOf('コンポーネントID');
      const dataLine = lines[i + 2];
      if (idx >= 0 && dataLine && dataLine.includes('|')) {
        const cell = splitRow(dataLine)[idx];
        if (cell) return cell;
      }
    }
  }
  const m = content.match(/^#\s*\[([^\]]+)\]/m);
  return m ? m[1].trim() : null;
}

function extractSourcePath(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*ソースパス/.test(lines[i])) {
      for (let j = i + 1; j < lines.length && !/^#/.test(lines[j]); j++) {
        const m = lines[j].match(/`([^`]+)`/);
        if (m) return m[1].trim().replace(/\\/g, '/');
      }
    }
  }
  return null;
}

function extractImages(lines: string[], mdPath: string): MdImage[] {
  const dir = posix.dirname(mdPath.replace(/\\/g, '/'));
  const images: MdImage[] = [];
  let lastHeading: string | null = null;
  for (const line of lines) {
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) { lastHeading = h[1].trim(); continue; }
    const img = line.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (img) {
      const raw = img[1].trim().replace(/\\/g, '/');
      images.push({ caption: lastHeading, path: posix.normalize(posix.join(dir, raw)) });
    }
  }
  return images;
}

export function parseMdDoc(content: string, mdPath: string): MdDoc {
  const lines = content.split(/\r?\n/);
  return {
    mdPath,
    componentId: extractComponentId(lines, content),
    sourcePath: extractSourcePath(lines),
    images: extractImages(lines, mdPath),
  };
}
