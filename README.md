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

| Commande            | Rôle                                   |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Serveur de développement               |
| `npm run build`     | Vérification des types + build         |
| `npm test`          | Tests Vitest                           |
| `npm run lint`      | ESLint                                 |
| `npm run format`    | Prettier                               |
| `npm run typecheck` | `tsc --noEmit`                         |
| `npm run extract`   | Régénère `src/data/` depuis l'original |

## Contrôles (provisoires)

|     | Gauche | Droite | Attaque      |
| --- | ------ | ------ | ------------ |
| J1  | `A`    | `D`    | `Espace`     |
| J2  | `←`    | `→`    | `Maj` droite |

Touches physiques (`KeyboardEvent.code`) : sur un clavier AZERTY, la touche de J1 « A » est
la touche `Q`. `F12` affiche / masque les boxes et la frame data.

## Modes (provisoires)

Par défaut J2 est le CPU (port de `BattleAI.cs`). Paramètres d'URL, en attendant le menu :

- `?mode=2p` : deux joueurs sur le même clavier ;
- `?seed=N` : graine du CPU, pour rejouer exactement la même partie (affichée dans la console).

## Données extraites

`npm run extract` lit l'original (`vendor/`) et produit dans `src/data/` : `f00.json` (frame data),
`f00-atlas.png` + `f00-sprites.json` (sprites du combattant), `ui-atlas.png` + `ui-sprites.json` + `ui-animations.json` (interface de combat et ses animations) et `audio/` (`.mp3`). Ces
fichiers sont versionnés : le site déployé n'a pas besoin de `vendor/`. La conversion audio demande
`ffmpeg` (`brew install ffmpeg`).

Specs complètes : `SPECS.md`.
