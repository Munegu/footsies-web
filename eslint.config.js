import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Règle d'architecture n°1 : le moteur et l'IA sont purs et déterministes.
const impureGlobals = ['window', 'document', 'performance', 'Date', 'localStorage', 'navigator'];

export default tseslint.config(
  { ignores: ['dist', 'vendor', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/engine/**/*.ts', 'src/ai/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...impureGlobals.map((name) => ({
          name,
          message: 'Interdit dans src/engine et src/ai (module pur).',
        })),
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Utiliser le RNG seedé (rng.ts), pas Math.random().',
        },
      ],
    },
  },
);
