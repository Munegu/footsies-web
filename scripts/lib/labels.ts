import { PNG } from 'pngjs';

// Libellés de Menu.png : 4 lignes de 50x11, texte en police 5x5 (lettres de 5 pixels de large,
// 1 pixel d'écart) sur les lignes 3 à 7. L'original n'a pas de libellé OPTIONS (son EXIT n'a pas
// de sens dans un navigateur) : on le compose avec les lettres existantes (P, T, I, S) et deux
// lettres dessinées dans la même grille (O, N).

export const LABEL_WIDTH = 50;
export const LABEL_HEIGHT = 11;
const GLYPH_TOP = 3;
const GLYPH_SIZE = 5;

/** Lignes de Menu.png, de haut en bas. */
const ROW = { vsCpu: 0, vsPlayer: 1, exit: 2 } as const;

export type Glyph = readonly string[];

/** O et N n'existent pas dans les libellés utilisables : dessinés sur la même grille 5x5. */
export const GLYPH_O: Glyph = ['#####', '##.##', '##.##', '##.##', '#####'];
export const GLYPH_N: Glyph = ['#...#', '##..#', '#.#.#', '#..##', '#...#'];

const isInk = (png: PNG, x: number, y: number): boolean =>
  (png.data[(y * png.width + x) * 4 + 3] ?? 0) > 0;

/** Les lettres d'une ligne : groupes de colonnes contenant de l'encre, séparés par des colonnes vides. */
function glyphsOfRow(png: PNG, row: number): Glyph[] {
  const y0 = row * LABEL_HEIGHT + GLYPH_TOP;
  const columnHasInk = (x: number): boolean => {
    for (let y = y0; y < y0 + GLYPH_SIZE; y++) if (isInk(png, x, y)) return true;
    return false;
  };

  const glyphs: Glyph[] = [];
  let x = 0;
  while (x < LABEL_WIDTH) {
    if (!columnHasInk(x)) {
      x++;
      continue;
    }
    let end = x;
    while (end < LABEL_WIDTH && columnHasInk(end)) end++;
    const width = end - x;
    if (width !== GLYPH_SIZE)
      throw new Error(`Lettre de ${width} px de large (ligne ${row}, x ${x})`);
    const rows: string[] = [];
    for (let y = y0; y < y0 + GLYPH_SIZE; y++) {
      let line = '';
      for (let gx = x; gx < end; gx++) line += isInk(png, gx, y) ? '#' : '.';
      rows.push(line);
    }
    glyphs.push(rows);
    x = end;
  }
  return glyphs;
}

function pick(glyphs: Glyph[], index: number, label: string): Glyph {
  const g = glyphs[index];
  if (!g) throw new Error(`Lettre ${index} introuvable dans ${label}`);
  return g;
}

/** Sprite « OPTIONS » (50x11), centré, dans la police des autres libellés. */
export function buildOptionsLabel(menu: PNG): PNG {
  const vsCpu = glyphsOfRow(menu, ROW.vsCpu); // V S C P U
  const vsPlayer = glyphsOfRow(menu, ROW.vsPlayer); // V S P L 2
  const exit = glyphsOfRow(menu, ROW.exit); // E X I T

  const letters: Glyph[] = [
    GLYPH_O,
    pick(vsCpu, 3, 'VS CPU'), // P
    pick(exit, 3, 'EXIT'), // T
    pick(exit, 2, 'EXIT'), // I
    GLYPH_O,
    GLYPH_N,
    pick(vsPlayer, 1, 'VS PL2'), // S
  ];

  // Couleur de l'encre : celle des libellés d'origine.
  let ink = [0, 0, 0, 255];
  outer: for (let y = 0; y < LABEL_HEIGHT; y++) {
    for (let x = 0; x < LABEL_WIDTH; x++) {
      if (isInk(menu, x, y)) {
        const i = (y * menu.width + x) * 4;
        ink = [
          menu.data[i] ?? 0,
          menu.data[i + 1] ?? 0,
          menu.data[i + 2] ?? 0,
          menu.data[i + 3] ?? 255,
        ];
        break outer;
      }
    }
  }

  const out = new PNG({ width: LABEL_WIDTH, height: LABEL_HEIGHT });
  const total = letters.length * GLYPH_SIZE + (letters.length - 1);
  const x0 = Math.floor((LABEL_WIDTH - total) / 2);
  letters.forEach((glyph, n) => {
    glyph.forEach((line, gy) => {
      [...line].forEach((c, gx) => {
        if (c !== '#') return;
        const x = x0 + n * (GLYPH_SIZE + 1) + gx;
        const i = ((GLYPH_TOP + gy) * LABEL_WIDTH + x) * 4;
        out.data[i] = ink[0] ?? 0;
        out.data[i + 1] = ink[1] ?? 0;
        out.data[i + 2] = ink[2] ?? 0;
        out.data[i + 3] = ink[3] ?? 255;
      });
    });
  });
  return out;
}
