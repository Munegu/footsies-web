import { describe, expect, it } from 'vitest';
import { hitAt } from '../src/ui/hit-test.ts';
import { messageText, optionsHitAt, rowRect } from '../src/ui/options-screen.ts';
import { OPTION_ITEMS } from '../src/ui/options.ts';

const centerOf = (i: number): [number, number] => {
  const r = rowRect(i);
  return [r.x + 40, r.y + r.h / 2];
};

describe("lignes de l'écran d'options", () => {
  it("12 lignes dans l'écran de 900 de haut, sans chevauchement", () => {
    const rows = OPTION_ITEMS.map((_, i) => rowRect(i));
    expect(rows).toHaveLength(12);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i]?.y ?? 0) >= (rows[i - 1]?.y ?? 0) + (rows[i - 1]?.h ?? 0)).toBe(true);
    }
    const last = rows[11];
    expect((last?.y ?? 0) + (last?.h ?? 0)).toBeLessThanOrEqual(900);
  });

  it('chaque ligne est trouvée au clic sur son libellé', () => {
    OPTION_ITEMS.forEach((id, i) => {
      const [x, y] = centerOf(i);
      expect(optionsHitAt(x, y)).toEqual({ id });
    });
  });

  it('en dehors des lignes : rien', () => {
    expect(optionsHitAt(10, 10)).toBeNull();
    expect(optionsHitAt(800, 120)).toBeNull(); // entre le titre et la 1re ligne
    expect(optionsHitAt(rowRect(0).x - 1, rowRect(0).y + 10)).toBeNull();
  });
});

describe('clic sur un curseur de volume', () => {
  const row = OPTION_ITEMS.indexOf('music');
  const y = rowRect(row).y + 28;

  it('chaque case donne son cran : première case 10 %, dixième 100 %', () => {
    expect(optionsHitAt(801, y)).toEqual({ id: 'music', value: 0.1 });
    expect(optionsHitAt(800 + 46 * 4 + 10, y)).toEqual({ id: 'music', value: 0.5 });
    expect(optionsHitAt(800 + 46 * 9 + 20, y)).toEqual({ id: 'music', value: 1 });
  });

  it('la marge à gauche du curseur donne 0 %', () => {
    expect(optionsHitAt(780, y)).toEqual({ id: 'music', value: 0 });
  });

  it('ailleurs sur la ligne : sélection seule, sans valeur', () => {
    expect(optionsHitAt(400, y)).toEqual({ id: 'music' });
    expect(optionsHitAt(1290, y)).toEqual({ id: 'music' });
  });

  it("les lignes de touches n'ont pas de curseur", () => {
    expect(optionsHitAt(900, rowRect(0).y + 10)).toEqual({ id: 'p1Left' });
  });

  it("hitAt route vers l'écran d'options", () => {
    expect(hitAt('options', 801, y)).toEqual({ id: 'music', value: 0.1 });
    expect(hitAt('title', 800, 600)).toEqual({ id: 'vsCpu' });
    expect(hitAt('battle', 800, 600)).toBeNull();
  });
});

describe('message sous le titre', () => {
  it("par défaut : l'aide des touches", () => {
    expect(messageText(null)).toContain('Échap');
  });

  it("capture : annonce l'action attendue", () => {
    expect(messageText({ kind: 'capture', id: 'p2Attack' })).toBe(
      'J2  Attaque : appuyez sur une touche (Échap pour annuler)',
    );
  });

  it('affectation et échange, avec le nom de la touche sur le clavier réel', () => {
    const azerty = new Map([['KeyA', 'q']]);
    expect(
      messageText({ kind: 'assigned', id: 'p1Left', code: 'KeyA', swappedWith: null }, azerty),
    ).toBe('J1  Gauche : Q');
    expect(
      messageText({ kind: 'assigned', id: 'p1Left', code: 'KeyD', swappedWith: 'p1Right' }),
    ).toBe('J1  Gauche : D (échangée avec J1  Droite)');
  });

  it('touche réservée et réinitialisation', () => {
    expect(messageText({ kind: 'reserved', code: 'F12' })).toContain('réservée');
    expect(messageText({ kind: 'reset' })).toBe('Touches réinitialisées');
  });
});
