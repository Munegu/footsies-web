# Specs — Footsies Web

## 1. Concept

Portage fidèle de **FOOTSIES** (HiFight, 2018) jouable dans le navigateur. Objectif : un joueur de l'original ne doit pas sentir de différence de gameplay. Mêmes coups, même frame data, mêmes hitboxes, même IA, même déroulé des rounds.

Le jeu original : déplacements horizontaux uniquement, un seul bouton d'attaque. Pas de barre de vie : un coup spécial qui touche gagne le round. Une jauge de garde de 3. Le cœur du jeu est le spacing, le hit confirm et le whiff punish.

## 2. Source de référence et licence

- Code source officiel : https://github.com/hifight/Footsies (Unity, C#). **C'est la source de vérité** : en cas de doute sur un comportement, lire le C# plutôt que deviner.
- Le dépôt est sous **GPL-3.0**. Ce portage reprend sa logique, ses données, ses sprites et ses sons : c'est une œuvre dérivée, donc **ce projet est aussi sous GPL-3.0**.
  - Ajouter le fichier `LICENSE` (GPL-3.0) dès le premier commit.
  - Créditer HiFight dans le README et sur l'écran titre (« Original game by HiFight »).
  - Le code source doit rester public si le jeu est publié.
- Cloner le dépôt original dans `vendor/footsies-original/` (ajouté au `.gitignore`). On n'y touche jamais : on lit et on extrait.

Fichiers clés du dépôt original :

| Fichier | Rôle |
|---|---|
| `Assets/Script/BattleCore.cs` | Boucle de combat, ordre des étapes, collisions, rounds |
| `Assets/Script/Fighter.cs` | Inputs, machine à états, cancels, dash, spéciaux, dégâts |
| `Assets/Script/BattleAI.cs` | IA du CPU |
| `Assets/Script/ActionData.cs`, `AttackData.cs`, `FighterData.cs` | Modèle de données |
| `Assets/Fighter/F00/*.asset` | Données du personnage (YAML Unity) |
| `Assets/Fighter/F00/Actions/*.asset` | Une action par fichier (frame data, boxes, déplacements, cancels) |
| `Assets/Art/Fighters/F00/*.png` + `.meta` | Sprite sheets et leur découpage |
| `Assets/Sound/SE/*.wav`, `Assets/Sound/BGM/Footsies.wav` | Bruitages et musique |
| `Assets/Script/SoundManager.cs` | Panoramique stéréo selon la position |

## 3. Stack technique (décidée)

- **Vite + TypeScript** (mode `strict`), sans framework de jeu.
- **Canvas 2D** pour le combat. Les menus peuvent être en DOM simple (HTML/CSS) par-dessus le canvas.
- **Web Audio API** pour le son.
- **Vitest** pour les tests du moteur.
- Site 100 % statique, aucun backend (déploiement Netlify / Cloudflare Pages / Vercel).

Arborescence cible :

```
scripts/extract-unity.ts   # YAML Unity -> JSON + atlas de sprites
src/data/                  # JSON générés (commités), atlas, sons convertis
src/engine/                # moteur PUR : aucun accès DOM, window, Date, Math.random
  fighter.ts  battle.ts  boxes.ts  input-history.ts  rng.ts  types.ts
src/ai/                    # port de BattleAI.cs (pur, utilise le RNG seedé)
src/input/                 # clavier, manettes, configuration des touches
src/render/                # dessin canvas, caméra, debug (boxes, frame data)
src/audio/                 # Web Audio
src/ui/                    # écran titre, menus, pause, options
src/main.ts                # boucle à pas fixe, assemblage
tests/                     # Vitest
```

**Règle d'architecture n°1** : `src/engine` et `src/ai` sont des modules purs. Même état + mêmes inputs = même état suivant, bit à bit. Pas de `Math.random()`, pas d'horloge, pas de DOM. C'est ce qui rend possibles les tests, le replay et plus tard le rollback.

## 4. Le moteur original, à reproduire fidèlement

### 4.1 Pas de temps : 50 ticks par seconde

Unity exécute `FixedUpdate` avec un pas de **0,02 s** (`ProjectSettings/TimeManager.asset`). Toute la frame data est donc en ticks de **50 Hz**, pas 60. La boucle navigateur doit appeler `battle.step()` exactement 50 fois par seconde, avec un accumulateur, et rendre aussi souvent que l'écran le permet.

Le code C# multiplie les vitesses par `Time.deltaTime`. Dans `FixedUpdate` cela vaut toujours 0,02 : remplacer par une constante `DT = 0.02`.

### 4.2 Unités et espace

- Unités monde Unity (pas des pixels). Aire de combat : largeur 10, donc x de −5 à +5.
- Départ des combattants : x = −2 (J1, tourné à droite) et x = +2 (J2).
- Vitesses : marche avant 2,2 u/s, marche arrière 1,8 u/s (`F00.asset`). Les `velocity_x` des actions sont aussi en u/s.
- Sprites : `spritePixelsToUnits: 10`, soit 10 pixels de sprite par unité. Choisir une résolution interne et un facteur d'agrandissement entier (pixel art net).
- Rectangles des boxes : `x` = **centre** horizontal, `y` = **bas**, largeur et hauteur. Ils sont relatifs au personnage et miroités selon son sens (`TransformToFightRect`). `useBaseRect: 1` = utiliser `baseHurtBoxRect` ou `basePushBoxRect` de `F00.asset`.
- Collision (`BoxBase.Overlaps`) : bornes **inclusives** (`>=`, `<=`).

### 4.3 Ordre d'un tick de combat (`BattleCore.UpdateFightState`)

Respecter cet ordre exact, il a des conséquences sur le gameplay :

1. Lire l'input des deux joueurs (ou de l'IA pour J2).
2. `UpdateInput` pour chacun (historique).
3. `IncrementActionFrame` pour chacun.
4. `UpdateActionRequest` pour chacun.
5. `UpdateMovement` pour chacun.
6. `UpdateBoxes` pour chacun.
7. Poussée perso contre perso (pushboxes, correction partagée moitié-moitié).
8. Poussée contre les bords de l'aire.
9. Collisions hitbox / hurtbox, J1 attaquant d'abord, puis J2.

**Particularité de l'étape 7** (`UpdatePushCharacterVsCharacter`) : `rect1` et `rect2` sont des `UnityEngine.Rect` bruts, pas des `Pushbox`. Dans un `Rect` Unity, `x` est le bord **gauche** (`xMax = x + width`) et `Overlaps` est **strict** ; or `x` contient ici le centre. Les bornes inclusives et le `x` centré ne valent que pour `BoxBase` (hit/hurt, et poussée contre les bords). À reproduire tel quel (`rectOverlaps` dans `boxes.ts`).

### 4.4 Inputs

- Bitmask : `Left = 1`, `Right = 2`, `Attack = 4`.
- Historique de 180 ticks : `input[]`, `inputDown[]` (vient d'être pressé), `inputUp[]` (vient d'être relâché), calculés par XOR avec le tick précédent.
- Avant / arrière se déduisent du sens du personnage.
- **Attaque normale** : appui sur Attack. Avec une direction (avant ou arrière) → `B_ATTACK`, sinon → `N_ATTACK`.
- **Spécial** : relâcher Attack après l'avoir tenu pendant les 59 ticks précédents (`specialAttackHoldFrame = 60`, boucle de 1 à 59). Avec une direction → `B_SPECIAL`, sinon → `N_SPECIAL`.
- **Cancel** : appuyer à nouveau pendant un `N_ATTACK` ou `B_ATTACK` non terminé demande `N_SPECIAL`. Il ne s'exécute que si le coup a touché, en hit ou en garde (`canCancelOnWhiff = false`).
- **Dash** : double appui avant ou arrière dans une fenêtre de 9 ticks (`dashAllowFrame`). Porter `CheckForwardDashInput` et `CheckBackwardDashInput` à l'identique, y compris l'exigence d'un tick neutre entre les deux appuis.
- Avant et arrière en même temps → `STAND`.
- Tenir arrière à portée d'une hitbox de **proximité** adverse → `GUARD_PROXIMITY` au lieu de `BACKWARD` : le perso s'arrête en garde au lieu de reculer.

### 4.5 Actions et cancels (`RequestAction`)

Une demande d'action :

- est acceptée si l'action courante est terminée (`currentActionFrame >= frameCount`) ;
- est ignorée si c'est déjà l'action courante ;
- est acceptée si l'action courante est `alwaysCancelable` ;
- sinon on regarde les `cancels` actifs à la frame courante :
  - `execute` → l'action est mise en buffer et exécutée au tick suivant (si `canCancelAttack`) ;
  - `buffer` seul → mise en buffer sans validation immédiate.

Les actions `isLoop` (WIN) reviennent à `loopFromFrame` à la fin. Une action en hitstun ne fait pas avancer sa frame.

Dans les `.asset`, `actionID` des cancels est une chaîne hexadécimale d'entiers 32 bits **little-endian** : `6e000000` = 110 (`N_SPECIAL`).

### 4.6 Dégâts, garde et hitstop (`NotifyDamaged`, `UpdateHitboxHurtboxCollision`)

- Chaque coup a une `guardHealthDamage` de 1. Elle est retirée de la jauge de garde **même si le coup n'est pas gardé**.
- La jauge démarre à 3. Le guard break survient quand elle passerait **sous 0**, soit au 4e coup gardé.
- Le défenseur garde automatiquement s'il est en `BACKWARD` ou dans une action de type `Guard`.
  - Gardé : il passe dans `guardActionID` de l'attaque.
  - Guard break : même chose, puis `GUARD_BREAK` est réservé pour la fin du gel.
  - Touché : il perd `vitalHealthDamage` (1 pour les spéciaux, 0 pour les normaux) et passe dans `damageActionID`. Les normaux mènent à `DAMAGE`, les spéciaux à `DEAD`.
- Le perso mort (`vitalHealth <= 0`) fait passer le round en KO.
- **Hitstop** : à l'impact, l'attaquant **et** le défenseur reçoivent `SetHitStun(n)`. Pendant n ticks, leur frame d'action est figée et ils ne bougent pas. n = `hitStunFrame`, `guardStunFrame` ou `guardBreakStunFrame` selon le résultat.
- Tremblement du sprite touché : n / 3 pixels, plafonné à 6, alterné +/− à chaque tick.
- `numberOfHit` limite le nombre de touches par action.

| Attaque | ID | Dégâts vitaux | Garde | Hitstop hit | Hitstop garde | Hitstop guard break | Action garde |
|---|---|---|---|---|---|---|---|
| N_ATTACK | 1 | 0 | 1 | 12 | 12 | 30 | GUARD_CROUCH (306) |
| B_ATTACK | 2 | 0 | 1 | 12 | 12 | 30 | GUARD_STAND (305) |
| N_SPECIAL | 10 | 1 | 1 | 0 | 15 | 30 | GUARD_M (301) |
| B_SPECIAL | 11 | 1 | 1 | 0 | 15 | 30 | GUARD_M (301) |

### 4.7 Frame data des actions (relevé indicatif)

Valeurs relevées dans les `.asset`. Le script d'extraction (étape 1) fait foi. Frames numérotées à partir de 0, intervalles inclusifs.

| Action | ID | Durée | Hitbox active | Proximité | Counter-hit | Cancel |
|---|---|---|---|---|---|---|
| STAND | 0 | 24 | | | | toujours annulable |
| FORWARD | 1 | 24 | | | | toujours annulable |
| BACKWARD | 2 | 24 | | | | toujours annulable |
| DASH_FORWARD | 10 | 16 | | | | |
| DASH_BACKWARD | 11 | 22 | | | | |
| N_ATTACK | 100 | 22 | 4–5 | 0–5 | 0–4 | buffer 1–3, execute 4–5 → 110 |
| B_ATTACK | 105 | 21 | 3–5 | 0–5 | 0–3 | buffer 1–2, execute 3–5 → 110 |
| N_SPECIAL | 110 | 44 | 11–14 | 0–14 | 0–10 | |
| B_SPECIAL | 115 | 55 | 2–7 | 0–5 | | |
| DAMAGE | 200 | 17 | | | | |
| GUARD_M / STAND / CROUCH | 301 / 305 / 306 | 23 / 15 / 15 | | | | |
| GUARD_BREAK | 310 | 36 | | | | |
| GUARD_PROXIMITY | 350 | 1 | | | | toujours annulable (type Guard) |
| DEAD | 500 | 500 | | | | |
| WIN | 510 | 33 (boucle) | | | | |

Plusieurs actions ont des `movements` (dashes, spéciaux, reculs de garde et de dégâts), à appliquer frame par frame. Le flag `counterHit` existe dans les données mais n'est pas utilisé par le code d'origine : le reproduire tel quel (ignoré).

### 4.8 Déroulé des rounds (`BattleCore`)

- **Intro** : 3 s (150 ticks). Les persos sont replacés, guard = 3, ils ne peuvent que rester en STAND.
- **Fight** : jusqu'à ce qu'un perso soit mort.
- **KO** : 2 s. Le jeu est figé (aucune mise à jour).
- **End** : 3 s, passables après 1,5 s avec Attack. Le vainqueur prend `WIN`, son compteur de rounds augmente.
- Premier à **3 rounds**. Retour à l'écran titre ensuite.
- Double KO : aucun point marqué, round rejoué.

### 4.9 Outils de debug de l'original (à reproduire)

- **F12** : afficher les hitboxes, hurtboxes, pushboxes et la frame data.
- **F1** : pause. **F2** pendant la pause : avancer d'un tick.
- Enregistrement des inputs du round et rejeu du dernier round (`debugPlayLastRoundInput`). Avec un moteur déterministe, ce rejeu doit reproduire le round à l'identique.

## 5. Extraction des données (étape 1)

Script `scripts/extract-unity.ts`, lancé avec `npm run extract` :

1. Lire les `.asset` de `vendor/footsies-original/Assets/Fighter/F00/`. Le YAML Unity a des en-têtes non standards (`%YAML`, `%TAG`, `--- !u!114 &11400000`) à retirer avant de parser.
2. Décoder les `actionID` des cancels (hexadécimal, int32 little-endian).
3. Produire `src/data/f00.json` : paramètres du perso, actions indexées par ID, attaques indexées par ID.
4. Sprites : `MotionDataContainer` associe `motionID` → `{guid, fileID}`. Retrouver le `.png` par le `guid` de son `.meta`. Pour une sprite sheet découpée, `fileID` 21300000 + 2n désigne le n-ième sprite de `spriteSheet.sprites` du `.meta`, avec son `rect` (attention : origine en bas à gauche dans Unity) et son `pivot`.
5. Générer un atlas PNG unique et `src/data/f00-sprites.json` (motionID → rect dans l'atlas + pivot).
6. Copier les sons en `.ogg` ou `.mp3` dans `src/data/audio/`, plus la musique.
7. Tests Vitest sur le JSON produit : N_ATTACK dure 22 ticks, sa hitbox active couvre 4–5, son cancel cible 110, la marche avant vaut 2,2.

## 6. IA (port de `BattleAI.cs`)

Porter l'IA à l'identique :

- Deux files d'attente, une de mouvements et une d'attaques, remplies par des « patterns » (`AddFarApproach1`, `AddMidApproach2`, `AddFallBack1`, `AddTwoHitImmediateAttack`, `AddDelaySpecialAttack`…).
- Choix du pattern selon la distance (seuils 4 ; 3 ; 2,5 ; 2 unités) et l'état adverse (en dégâts, en guard break, en train de faire un spécial).
- L'IA lit l'état de combat avec un retard de 5 ticks (`fightStateReadIndex = 5`, historique de 10). C'est son temps de réaction : à conserver.
- `UnityEngine.Random.Range` est remplacé par le RNG seedé du moteur (même sémantique de bornes : borne haute exclue pour les entiers).

## 7. Fonctionnalités

### V1 (indispensables)

- Écran titre : VS CPU, VS joueur (local), Options.
- Combat complet conforme à la section 4.
- Interface de combat : rounds gagnés, jauge de garde, annonces de round, effets d'impact (`HitEffect.png`, `Guard.png`).
- Contrôles clavier par défaut sur deux joueurs, configurables, sauvegardés dans `localStorage`.
- Manettes via la Gamepad API, attribuées dans l'ordre de connexion.
- Son : bruitages avec panoramique selon la position (`panStereo = x / 5`), musique, volume réglable.
- Mode debug (F12, F1, F2) et rejeu du dernier round.
- Pause en plein combat (Échap) avec reprise et retour au titre.

### V2 (bonus)

- Mode entraînement : mannequin configurable (garde toujours, garde après le premier coup, enregistrement puis rejeu d'une séquence).
- Affichage de l'historique des inputs.
- Contrôles tactiles sur mobile.
- **En ligne avec rollback netcode** (WebRTC en pair-à-pair). Demande un petit serveur de signalisation, donc sort du « 100 % statique ». À évaluer à part : le moteur déterministe de la V1 en est la condition.

## 8. Rendu

- Résolution interne fixe, agrandie par un facteur entier, `imageSmoothingEnabled = false`.
- Le rendu lit l'état du moteur sans jamais le modifier.
- Interpolation entre deux ticks : **non**. On affiche le dernier tick calculé, comme l'original.
- Arrière-plan : `Battle_BG.png`. Respecter l'ordre de dessin et le miroir des sprites selon le sens.

## 9. Pièges navigateur déjà rencontrés

- `navigator.getGamepads()` peut lever une exception dans un iframe (permissions policy) : l'appeler dans un `try/catch` et désactiver les manettes après le premier échec.
- Une manette n'apparaît qu'après une première pression de bouton.
- L'audio ne démarre qu'après une interaction : créer ou reprendre l'`AudioContext` au premier clic ou appui.
- Onglet en arrière-plan : `requestAnimationFrame` s'arrête. Plafonner l'accumulateur (environ 250 ms) pour ne pas rattraper des centaines de ticks au retour.
- Utiliser `KeyboardEvent.code` (touche physique) et non `key` : les mêmes positions sur AZERTY et QWERTY.
- `preventDefault()` sur les flèches et Espace pour éviter le défilement de la page.
- Mémoriser les appuis survenus entre deux ticks pour ne pas rater un appui très court.

## 10. Plan de réalisation

1. **Initialisation** : Vite + TS strict, Vitest, ESLint + Prettier, `LICENSE` GPL-3.0, README avec crédits, clonage de l'original dans `vendor/`.
2. **Extraction des données** (section 5), avec tests.
3. **Moteur pur** : types, boxes, historique d'inputs, `Fighter` (actions, cancels, dash, spéciaux, dégâts), `Battle` (ordre de la section 4.3, rounds). Tests Vitest par mécanique : dash, charge du spécial, cancel uniquement si le coup touche, garde automatique, guard break au 4e coup, hitstop, poussées, bords.
4. **Boucle et rendu de debug** : boucle à 50 Hz, rendu des boxes en rectangles, clavier. Premier combat jouable sans sprites.
5. **Sprites et interface de combat** : atlas, animations, effets, rounds, jauges.
6. **IA** : port de `BattleAI.cs`, tests de déterminisme (même seed = mêmes inputs).
7. **Son et musique**.
8. **Menus, options, configuration des touches, manettes**.
9. **Outils de debug** : F12, F1/F2, enregistrement et rejeu du round.
10. **Finitions et déploiement**.
11. **V2** au choix.

Avant chaque étape : relire les fichiers C# concernés et lister ce qui sera porté.

## 11. Points de vigilance

- **Fidélité avant tout** : ne pas « améliorer » une règle de l'original sans validation (exemple : la garde perdue même sur un coup non gardé est voulue).
- **Flottants** : Unity calcule en float 32 bits, JavaScript en 64 bits. Des écarts infimes de position sont possibles. Acceptable, mais toutes les positions doivent passer par les mêmes fonctions pour rester déterministes. Si un écart visible apparaît, utiliser `Math.fround`.
- **Test de non-régression** : un test qui rejoue une séquence d'inputs enregistrée et compare un hash de l'état final. Il protège toutes les étapes suivantes.
- **Licence** : GPL-3.0 obligatoire. Garder les crédits HiFight visibles.
