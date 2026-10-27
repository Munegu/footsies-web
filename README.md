# Footsies Web

Portage fidèle dans le navigateur de **FOOTSIES**, le jeu de combat minimaliste de HiFight.

> Original game by [HiFight](https://github.com/hifight/Footsies)

## Licence

Ce projet reprend la logique, les données, les sprites et les sons de l'original, publié sous
**GPL-3.0**. Il est donc lui-même distribué sous GPL-3.0 (voir `LICENSE`). Le code source doit
rester public si le jeu est publié.

## Démarrage

```sh
npm install
git clone https://github.com/hifight/Footsies vendor/footsies-original
npm run dev
```

L'original cloné (`vendor/`, ignoré par git) sert de source de vérité : on le lit, on ne le modifie
jamais. Version de référence : commit `08c293961bd0420ed7cdf26afa2fa032b6f98b70`.

## Commandes

| Commande            | Rôle                           |
| ------------------- | ------------------------------ |
| `npm run dev`       | Serveur de développement       |
| `npm run build`     | Vérification des types + build |
| `npm test`          | Tests Vitest                   |
| `npm run lint`      | ESLint                         |
| `npm run format`    | Prettier                       |
| `npm run typecheck` | `tsc --noEmit`                 |

Specs complètes : `SPECS.md`.
