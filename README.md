# Footsies Web

Portage fidèle dans le navigateur de **FOOTSIES**, le jeu de combat minimaliste de HiFight.

> Original game by [HiFight](https://github.com/hifight/Footsies) · **portage non officiel**, non
> affilié à HiFight. Il ne reprend rien de la version commerciale « FOOTSIES Rollback Edition ».

## Licence et crédits

FOOTSIES est un jeu de **HiFight**, publié sous **GPL-3.0** (<https://github.com/hifight/Footsies>).
Ce projet en est une **version modifiée : un portage dans le navigateur (TypeScript, Canvas 2D,
Web Audio), réalisé en 2026**. Il reprend la logique, les données, les sprites et les sons de
l'original et est donc lui-même distribué sous **GPL-3.0** (voir `LICENSE`). Le code source doit
rester public tant que le jeu est publié.

Copyright (C) 2020 HiFight (jeu original) — Copyright (C) 2026 Nicolas Villetelle (portage).
Fourni **sans aucune garantie**. Détails dans `NOTICE` et `LICENSE` ; mentions légales du site
déployé dans `public/mentions-legales.html`.

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

## Contrôles

Par défaut :

|     | Gauche | Droite | Attaque      |
| --- | ------ | ------ | ------------ |
| J1  | `A`    | `D`    | `Espace`     |
| J2  | `←`    | `→`    | `Maj` droite |

Les touches se changent dans **Options** (une touche déjà prise est échangée avec l'autre action)
et sont sauvegardées dans le navigateur, avec les volumes et le réglage de la musique. Ce sont des
touches physiques (`KeyboardEvent.code`) : l'écran d'options affiche ce qui est gravé sur ton
clavier (la touche « A » de J1 s'affiche « Q » sur un clavier AZERTY). `F12` affiche / masque les
boxes et la frame data.

**Manettes :** branchées dans l'ordre de connexion (la première est J1, la seconde J2). Croix ou
stick gauche pour se déplacer, `A` pour attaquer, `Start` pour la pause. Dans les menus, la
manette 1 navigue à la croix ou au stick, `A` valide, `B` ou `Start` reviennent en arrière. Une
manette n'est détectée qu'après un premier appui sur un bouton (règle des navigateurs) ;
l'écran d'options indique les manettes reconnues.

**Menus :** haut / bas ou `W` / `S`, gauche / droite pour régler les curseurs, validation
`Entrée` ou `Espace`, ou la souris. `Échap` ouvre
la pause en combat. Le son démarre à la première touche ou au premier clic (règle des
navigateurs) ; la case en haut à droite du titre coupe la musique.

**Outils de debug :** `F12` affiche les boxes et la frame data. En combat, `F1` fige le jeu et
`F2` avance d'un tick (comme l'original). Le menu de pause propose le **rejeu du dernier round
terminé** : le moteur étant déterministe, il se rejoue à l'identique, et l'écran vérifie le hash
de l'état à chaque tick (« identique ✓ » ou « divergence au tick N »). `?seed=N` dans l'URL
rejoue exactement le même CPU (la graine est affichée dans la console).

## Données extraites

`npm run extract` lit l'original (`vendor/`) et produit dans `src/data/` : `f00.json` (frame data),
`f00-atlas.png` + `f00-sprites.json` (sprites du combattant), `ui-atlas.png` + `ui-sprites.json` + `ui-animations.json` (interface de combat et ses animations) et `audio/` (`.mp3`). Ces
fichiers sont versionnés : le site déployé n'a pas besoin de `vendor/`. La conversion audio demande
`ffmpeg` (`brew install ffmpeg`).

Specs complètes : `SPECS.md`.
